import {
  IMediaProvider,
  PlatformId,
  ProviderCapabilities,
  ResolveOptions,
  ResolveResult,
  ResolveFailure
} from '../types.js';
import { config } from '../../config/index.js';
import { parseYouTubeVideoUrl } from './urlParser.js';
import { youTubeOEmbedClient, YouTubeOEmbedClient } from './oembedClient.js';
import { youTubeDataApiClient, YouTubeDataApiClient } from './dataApiClient.js';
import { youTubeThumbnailService, YouTubeThumbnailService } from './thumbnailService.js';
import { youTubeMetadataNormalizer, YouTubeMetadataNormalizer } from './normalizer.js';
import { canFallbackToOEmbed } from './errorMapper.js';
import { EXACT_ALLOWED_YOUTUBE_HOSTS, EXACT_ALLOWED_YOUTUBE_DOWNLOAD_HOSTS } from '../../utils/platformDetector.js';

export interface YouTubeMediaProviderDependencies {
  oEmbedClient?: YouTubeOEmbedClient;
  dataApiClient?: YouTubeDataApiClient;
  thumbnailService?: YouTubeThumbnailService;
  normalizer?: YouTubeMetadataNormalizer;
  apiKey?: string;
}

export class YouTubeMediaProvider implements IMediaProvider {
  readonly id = 'youtube';
  readonly name = 'YouTube Media Provider';
  readonly platformId: PlatformId = 'youtube';

  private readonly oEmbedClient: YouTubeOEmbedClient;
  private readonly dataApiClient: YouTubeDataApiClient;
  private readonly thumbnailService: YouTubeThumbnailService;
  private readonly normalizer: YouTubeMetadataNormalizer;
  private readonly apiKey?: string;

  constructor(deps?: YouTubeMediaProviderDependencies) {
    this.oEmbedClient = deps?.oEmbedClient || youTubeOEmbedClient;
    this.dataApiClient = deps?.dataApiClient || youTubeDataApiClient;
    this.thumbnailService = deps?.thumbnailService || youTubeThumbnailService;
    this.normalizer = deps?.normalizer || youTubeMetadataNormalizer;
    this.apiKey = deps?.apiKey !== undefined ? deps.apiKey : config.youtubeApiKey;
  }

  getCapabilities(): ProviderCapabilities {
    return {
      supportsPreview: true,
      supportsMetadata: true,
      supportsOriginalDownload: false, // Strict non-circumvention: stream ripping prohibited
      supportsCarousel: false,
      requiresAuthentication: false,
      requiresConfiguration: false,
      supportsDirectDownload: false,
      downloadDisclaimer: 'YouTube video downloads are not supported. Thumbnails and metadata export are available.'
    };
  }

  getAllowedDownloadHosts(): Array<string | RegExp> {
    return Array.from(EXACT_ALLOWED_YOUTUBE_DOWNLOAD_HOSTS);
  }

  canResolve(url: string): boolean {
    if (!url || typeof url !== 'string') return false;
    try {
      const withProtocol = url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;
      const parsed = new URL(withProtocol);
      const cleanHost = parsed.hostname.toLowerCase().replace(/\.+$/, '');
      if (!EXACT_ALLOWED_YOUTUBE_HOSTS.has(cleanHost)) {
        return false;
      }
      return parseYouTubeVideoUrl(url).valid;
    } catch {
      return false;
    }
  }

  async resolve(url: string, shortcode: string, options?: ResolveOptions): Promise<ResolveResult> {
    // 1. Validate URL and extract canonical Video ID
    const parsed = parseYouTubeVideoUrl(url);
    if (!parsed.valid || !parsed.videoId || !parsed.canonicalUrl) {
      return {
        ok: false,
        status: 'invalid_url',
        provider: this.id,
        shortcode,
        error: {
          code: 'UNSUPPORTED_URL',
          message: parsed.error || 'The provided URL is not a recognized YouTube video'
        }
      };
    }

    const { videoId, canonicalUrl } = parsed;
    const signal = options?.signal;

    // 2. Data API path when API key is configured
    if (this.apiKey && this.apiKey.trim().length > 0) {
      const dataApiResult = await this.dataApiClient.fetchVideoMetadata(videoId, this.apiKey, signal);

      if (dataApiResult.ok) {
        const videoData = dataApiResult.data;
        const thumbnails = await this.thumbnailService.discoverThumbnails(
          videoId,
          videoData.thumbnails,
          { signal }
        );

        const normalized = this.normalizer.normalize({
          videoId,
          canonicalUrl,
          title: videoData.title,
          author: videoData.channelTitle,
          authorUrl: `https://www.youtube.com/channel/${encodeURIComponent(videoData.channelId)}`,
          description: videoData.description,
          durationSeconds: videoData.durationSeconds,
          durationFormatted: videoData.durationFormatted,
          publishedAt: videoData.publishedAt,
          thumbnails,
          metadataCapability: 'FULL_METADATA'
        });

        return this.normalizer.buildResolveSuccess(normalized);
      }

      // Check whether error is eligible for fallback to anonymous oEmbed
      if (!canFallbackToOEmbed(dataApiResult.error)) {
        // Operational config error, video not found, or private video: do NOT fall back silently
        return {
          ok: false,
          status: 'provider_error',
          provider: this.id,
          shortcode: videoId,
          error: dataApiResult.error
        };
      }

      // Quota exhausted: log warning and proceed to oEmbed fallback
    }

    // 3. Anonymous oEmbed path (default or fallback when quota exhausted)
    const oembedResult = await this.oEmbedClient.fetchMetadata(canonicalUrl, videoId, signal);

    if (!oembedResult.ok) {
      return {
        ok: false,
        status: 'provider_error',
        provider: this.id,
        shortcode: videoId,
        error: oembedResult.error
      };
    }

    const oembedData = oembedResult.data;
    const thumbnails = await this.thumbnailService.discoverThumbnails(videoId, undefined, { signal });

    const normalized = this.normalizer.normalize({
      videoId,
      canonicalUrl,
      title: oembedData.title,
      author: oembedData.authorName,
      authorUrl: oembedData.authorUrl,
      thumbnails,
      metadataCapability: 'BASIC_METADATA'
    });

    return this.normalizer.buildResolveSuccess(normalized);
  }
}

export const youTubeMediaProvider = new YouTubeMediaProvider();
