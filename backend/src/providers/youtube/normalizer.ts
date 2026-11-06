import {
  NormalizedYouTubeMetadata,
  YouTubeMetadataCapability,
  YouTubeThumbnailItem
} from './types.js';
import { ResolveSuccess, MediaItem } from '../types.js';
import { calculateMetadataExpiration } from './retention.js';
import { youTubeEmbedService } from './embedService.js';

export interface NormalizerInput {
  videoId: string;
  canonicalUrl: string;
  title: string;
  author: string;
  authorUrl?: string;
  description?: string;
  durationSeconds?: number;
  durationFormatted?: string;
  publishedAt?: string;
  thumbnails: YouTubeThumbnailItem[];
  metadataCapability: YouTubeMetadataCapability;
  fetchedAt?: Date | string;
  isEmbeddable?: boolean;
  embeddingAllowed?: boolean;
  embedStatus?: 'allowed' | 'disabled' | 'unknown';
}

export class YouTubeMetadataNormalizer {
  /**
   * Normalizes raw metadata from Data API or oEmbed into a unified Snapora YouTube structure.
   */
  normalize(input: NormalizerInput): NormalizedYouTubeMetadata {
    const { metadataFetchedAt, metadataExpiresAt } = calculateMetadataExpiration(input.fetchedAt);

    // Determine embedding capability and status
    let isEmbeddable: boolean | undefined;
    let embeddingAllowed: boolean | undefined;
    let embedStatus: 'allowed' | 'disabled' | 'unknown';

    if (input.embedStatus === 'disabled' || input.isEmbeddable === false || input.embeddingAllowed === false) {
      embedStatus = 'disabled';
      isEmbeddable = false;
      embeddingAllowed = false;
    } else if (input.embedStatus === 'allowed' || (input.embedStatus === undefined && input.isEmbeddable === true)) {
      embedStatus = 'allowed';
      isEmbeddable = true;
      embeddingAllowed = true;
    } else {
      // 'unknown' or unverified status (e.g. anonymous oEmbed path or missing Data API status)
      embedStatus = 'unknown';
      isEmbeddable = undefined;
      embeddingAllowed = undefined;
    }

    // Preserve the existing product behavior of generating the privacy-enhanced embed URL
    // when embedding is allowed or when attempting an embed with unknown permission,
    // but strictly omit active embed URL when embedding is explicitly disabled.
    const embedUrl = embedStatus !== 'disabled' ? youTubeEmbedService.generateEmbedUrl(input.videoId) : undefined;

    return {
      platform: 'youtube',
      contentId: input.videoId,
      canonicalUrl: input.canonicalUrl,
      title: input.title,
      author: input.author,
      authorUrl: input.authorUrl || `https://www.youtube.com/@${encodeURIComponent(input.author)}`,
      description: input.description,
      durationSeconds: input.durationSeconds,
      durationFormatted: input.durationFormatted,
      publishedAt: input.publishedAt,
      thumbnails: input.thumbnails,
      embedUrl,
      isEmbeddable,
      embeddingAllowed,
      embedStatus,
      metadataCapability: input.metadataCapability,
      metadataFetchedAt,
      metadataExpiresAt
    };
  }

  /**
   * Builds the standardized ResolveSuccess response object for the backend resolve route.
   */
  buildResolveSuccess(normalized: NormalizedYouTubeMetadata): ResolveSuccess {
    // Select the highest-resolution thumbnail available for preview display
    const primaryThumb = normalized.thumbnails[0] || {
      url: `https://i.ytimg.com/vi/${normalized.contentId}/hqdefault.jpg`,
      width: 480,
      height: 360,
      resolution: 'hqdefault',
      verified: false
    };

    // Represent verified/discovered thumbnails as image media items
    const media: MediaItem[] = normalized.thumbnails.map((t) => ({
      id: `${normalized.contentId}_${t.resolution}`,
      postId: normalized.contentId,
      platform: 'youtube',
      type: 'image',
      url: t.url,
      previewUrl: t.url,
      thumbnailUrl: t.url,
      width: t.width,
      height: t.height,
      filename: `youtube_${normalized.contentId}_${t.resolution}.jpg`,
      provider: 'youtube',
      downloadable: false,
      resolutionStatus: 'live_metadata_retrieved',
      takenAt: normalized.publishedAt
    }));

    return {
      ok: true,
      status: 'live_metadata_retrieved',
      provider: 'youtube',
      platform: 'youtube',
      shortcode: normalized.contentId,
      contentId: normalized.contentId,
      canonicalUrl: normalized.canonicalUrl,
      title: normalized.title,
      author: normalized.author,
      authorUrl: normalized.authorUrl,
      description: normalized.description,
      durationSeconds: normalized.durationSeconds,
      durationFormatted: normalized.durationFormatted,
      publishedAt: normalized.publishedAt,
      embedUrl: normalized.embedUrl,
      isEmbeddable: normalized.isEmbeddable,
      embeddingAllowed: normalized.embeddingAllowed,
      embedStatus: normalized.embedStatus,
      metadataCapability: normalized.metadataCapability,
      metadataFetchedAt: normalized.metadataFetchedAt,
      metadataExpiresAt: normalized.metadataExpiresAt,
      takenAt: normalized.publishedAt,
      downloadAvailable: false,
      disclaimer: 'YouTube video downloads are not supported. Thumbnails and metadata export are available.',
      preview: {
        type: 'thumbnail',
        title: normalized.title,
        authorName: normalized.author,
        authorUrl: normalized.authorUrl,
        thumbnailUrl: primaryThumb.url,
        thumbnailWidth: primaryThumb.width,
        thumbnailHeight: primaryThumb.height,
        providerName: 'YouTube',
        embedUrl: normalized.embedUrl,
        isEmbeddable: normalized.isEmbeddable,
        embeddingAllowed: normalized.embeddingAllowed,
        embedStatus: normalized.embedStatus,
        description: normalized.description,
        durationSeconds: normalized.durationSeconds,
        durationFormatted: normalized.durationFormatted,
        publishedAt: normalized.publishedAt,
        metadataCapability: normalized.metadataCapability,
        metadataFetchedAt: normalized.metadataFetchedAt,
        metadataExpiresAt: normalized.metadataExpiresAt,
        thumbnails: normalized.thumbnails
      },
      media
    };
  }
}

export const youTubeMetadataNormalizer = new YouTubeMetadataNormalizer();
