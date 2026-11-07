import {
  IMediaProvider,
  PlatformId,
  ProviderCapabilities,
  ResolveOptions,
  ResolveResult,
  ResolveFailure
} from '../types.js';
import {
  isAllowedPinterestHost,
  PinterestUrlParser,
  pinterestUrlParser,
  EXACT_ALLOWED_PINTEREST_DOWNLOAD_HOSTS
} from './urlParser.js';
import { PinterestOEmbedClient, pinterestOEmbedClient } from './oembedClient.js';
import { PinterestThumbnailService, pinterestThumbnailService } from './thumbnailService.js';
import { PinterestEmbedService, pinterestEmbedService } from './embedService.js';
import { PinterestMetadataNormalizer, pinterestMetadataNormalizer } from './normalizer.js';
import { mapPinterestOEmbedError } from './errorMapper.js';

export interface PinterestMediaProviderDependencies {
  urlParser?: PinterestUrlParser;
  oembedClient?: PinterestOEmbedClient;
  thumbnailService?: PinterestThumbnailService;
  embedService?: PinterestEmbedService;
  normalizer?: PinterestMetadataNormalizer;
}

export class PinterestMediaProvider implements IMediaProvider {
  readonly id = 'pinterest';
  readonly name = 'Pinterest Media Provider';
  readonly platformId: PlatformId = 'pinterest';

  private readonly urlParser: PinterestUrlParser;
  private readonly oembedClient: PinterestOEmbedClient;
  private readonly thumbnailService: PinterestThumbnailService;
  private readonly embedService: PinterestEmbedService;
  private readonly normalizer: PinterestMetadataNormalizer;

  constructor(deps?: PinterestMediaProviderDependencies) {
    this.urlParser = deps?.urlParser || pinterestUrlParser;
    this.oembedClient = deps?.oembedClient || pinterestOEmbedClient;
    this.thumbnailService = deps?.thumbnailService || pinterestThumbnailService;
    this.embedService = deps?.embedService || pinterestEmbedService;
    this.normalizer = deps?.normalizer || pinterestMetadataNormalizer;
  }

  getCapabilities(): ProviderCapabilities {
    return {
      supportsPreview: true,
      supportsMetadata: true,
      supportsOriginalDownload: false, // Strict non-circumvention: bulk downloading & stream ripping prohibited
      supportsCarousel: false,
      requiresAuthentication: false,
      requiresConfiguration: false,
      supportsDirectDownload: false,
      downloadDisclaimer: 'Pinterest pin downloads are not supported. Preview thumbnails and metadata export are available.'
    };
  }

  getAllowedDownloadHosts(): Array<string | RegExp> {
    return Array.from(EXACT_ALLOWED_PINTEREST_DOWNLOAD_HOSTS);
  }

  canResolve(url: string): boolean {
    if (!url || typeof url !== 'string') return false;
    try {
      const withProtocol = url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;
      const parsed = new URL(withProtocol);
      const cleanHost = parsed.hostname.toLowerCase().replace(/\.+$/, '');
      if (!isAllowedPinterestHost(cleanHost)) {
        return false;
      }
      if (cleanHost === 'pin.it') {
        const shortcode = parsed.pathname.replace(/^\/+|\/+$/g, '');
        return /^[a-zA-Z0-9_-]{3,20}$/.test(shortcode);
      }
      return this.urlParser.parsePinId(parsed) !== null;
    } catch {
      return false;
    }
  }

  async resolve(url: string, shortcode: string, options?: ResolveOptions): Promise<ResolveResult> {
    // 1. Resolve shortlink or extract canonical Pin ID
    let pinId: string;
    let canonicalUrl: string;

    try {
      const withProtocol = url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;
      const parsed = new URL(withProtocol);
      const cleanHost = parsed.hostname.toLowerCase().replace(/\.+$/, '');

      if (cleanHost === 'pin.it') {
        const resolved = await this.urlParser.resolveShortLink(url, {
          signal: options?.signal
        });
        pinId = resolved.pinId;
        canonicalUrl = resolved.canonicalUrl;
      } else {
        const parsedPin = this.urlParser.parsePinId(parsed);
        if (!parsedPin) {
          return {
            ok: false,
            status: 'invalid_url',
            provider: this.id,
            shortcode,
            error: {
              code: 'INVALID_PIN_ID',
              message: `The provided URL is not a recognized Pinterest Pin URL. Expected format: https://www.pinterest.com/pin/<pin_id>/`
            }
          };
        }
        pinId = parsedPin.pinId;
        canonicalUrl = parsedPin.canonicalUrl;
      }
    } catch (urlErr: any) {
      const classified = mapPinterestOEmbedError(urlErr);
      return {
        ok: false,
        status: urlErr?.code === 'SSRF_BLOCKED' || urlErr?.code === 'PINTEREST_REDIRECT_REJECTED'
          ? 'invalid_url'
          : 'provider_error',
        provider: this.id,
        shortcode,
        error: classified
      };
    }

    // 2. Fetch metadata from official Pinterest oEmbed endpoint
    let oembed;
    try {
      oembed = await this.oembedClient.getPinMetadata(canonicalUrl, pinId, {
        signal: options?.signal
      });
    } catch (oembedErr: any) {
      const classified = mapPinterestOEmbedError(oembedErr, oembedErr?.statusCode);
      let status: ResolveFailure['status'] = 'provider_error';

      if (classified.code === 'PIN_NOT_FOUND') {
        status = 'invalid_url';
      } else if (classified.code === 'PINTEREST_RATE_LIMITED') {
        status = 'rate_limited';
      } else if (classified.code === 'PINTEREST_OEMBED_DISABLED') {
        status = 'configuration_required';
      }

      return {
        ok: false,
        status,
        provider: this.id,
        shortcode: pinId,
        error: classified
      };
    }

    // 3. Discover and verify preview thumbnail (236x)
    const thumbnails = await this.thumbnailService.buildThumbnailItems(
      oembed.thumbnail_url,
      {
        width: oembed.thumbnail_width,
        height: oembed.thumbnail_height
      }
    );

    // 4. Normalize metadata with 30-day lifecycle expiration
    const normalized = this.normalizer.normalize({
      pinId,
      canonicalUrl,
      oembed,
      thumbnails,
      embedStatus: 'unknown'
    });

    return this.normalizer.buildResolveSuccess(normalized);
  }
}

export const pinterestMediaProvider = new PinterestMediaProvider();
