import { IMediaProvider, ResolveResult, ProviderCapabilities, MediaItem } from './types.js';
import { parseInstagramUrl } from '../utils/urlParser.js';
import { assertSafeDestinationHost } from '../utils/ssrf.js';
import { config } from '../config/index.js';

export interface DirectMediaUrlProviderOptions {
  timeoutMs?: number;
  maxResponseSizeBytes?: number;
  fetchFn?: typeof fetch;
  lookupFn?: (hostname: string, options: any) => Promise<any>;
}

/**
 * DirectMediaUrlProvider handles verified direct Meta/Instagram CDN links
 * (e.g., scontent*.cdninstagram.com or *.fbcdn.net).
 *
 * Implements strict SSRF protection (pre-flight DNS validation), checks
 * cryptographic token presence and expiration, and extracts stream metadata.
 */
export class DirectMediaUrlProvider implements IMediaProvider {
  readonly id = 'direct';
  readonly name = 'DirectMediaUrlProvider';
  private timeoutMs: number;
  private maxResponseSizeBytes: number;
  private fetchFn: typeof fetch;
  private lookupFn?: (hostname: string, options: any) => Promise<any>;

  constructor(options?: DirectMediaUrlProviderOptions) {
    this.timeoutMs = options?.timeoutMs || config.resolverTimeoutMs || 10000;
    this.maxResponseSizeBytes = options?.maxResponseSizeBytes || config.maxResponseSizeBytes || 52428800;
    this.fetchFn = options?.fetchFn || fetch;
    this.lookupFn = options?.lookupFn;
  }

  getCapabilities(): ProviderCapabilities {
    return {
      supportsPreview: true,
      supportsMetadata: true,
      supportsOriginalDownload: true,
      supportsCarousel: false,
      requiresAuthentication: false,
      requiresConfiguration: false
    };
  }

  canResolve(url: string): boolean {
    const parsed = parseInstagramUrl(url);
    return parsed.valid && parsed.contentType === 'direct_media';
  }

  async resolve(url: string, shortcode: string): Promise<ResolveResult> {
    const parsed = parseInstagramUrl(url);
    if (!parsed.valid || parsed.contentType !== 'direct_media' || !parsed.directMediaInfo) {
      return {
        ok: false,
        status: 'invalid_url',
        provider: this.name,
        shortcode,
        error: {
          code: 'UNSUPPORTED_URL',
          message: 'URL is not a recognized Meta/Instagram direct CDN media link.'
        }
      };
    }

    const { hostname, extension, hasCryptoTokens, expiresAtUnixHex } = parsed.directMediaInfo;

    // 1. SSRF Pre-flight DNS and IP blocklist check
    const dnsCheck = await assertSafeDestinationHost(hostname, this.lookupFn as any);
    if (!dnsCheck.safe) {
      return {
        ok: false,
        status: 'provider_error',
        provider: this.name,
        shortcode,
        error: {
          code: 'SSRF_BLOCKED',
          message: dnsCheck.error || 'Destination IP resides in a restricted network range'
        }
      };
    }

    // 2. Expiration Token Check
    if (expiresAtUnixHex) {
      const expiresAtSeconds = parseInt(expiresAtUnixHex, 16);
      const currentSeconds = Math.floor(Date.now() / 1000);
      if (!isNaN(expiresAtSeconds) && currentSeconds > expiresAtSeconds) {
        return {
          ok: false,
          status: 'preview_unavailable',
          provider: this.name,
          shortcode,
          error: {
            code: 'CONTENT_UNAVAILABLE',
            message: `This direct media link expired at ${new Date(expiresAtSeconds * 1000).toISOString()}. Please obtain a fresh media URL.`
          }
        };
      }
    }

    // 3. Optional HEAD request to check availability and Content-Length
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), this.timeoutMs);
    let sizeBytes: number | undefined;

    try {
      const headRes = await this.fetchFn(url, {
        method: 'HEAD',
        signal: controller.signal
      });

      clearTimeout(timeoutHandle);

      if (headRes.ok) {
        const cl = headRes.headers?.get?.('content-length');
        if (cl) {
          const parsedCl = parseInt(cl, 10);
          if (!isNaN(parsedCl)) {
            if (parsedCl > this.maxResponseSizeBytes) {
              return {
                ok: false,
                status: 'provider_error',
                provider: this.name,
                shortcode,
                error: {
                  code: 'FILE_TOO_LARGE',
                  message: `Media size (${parsedCl} bytes) exceeds maximum allowable limit (${this.maxResponseSizeBytes} bytes).`
                }
              };
            }
            sizeBytes = parsedCl;
          }
        }
      }
    } catch {
      // If HEAD is blocked or fails, proceed with resolution without pre-flight size
      clearTimeout(timeoutHandle);
    }

    const isVideo = extension === 'mp4';
    const mediaType = isVideo ? 'video' : 'image';
    const filename = `snapora_direct_${shortcode}.${extension !== 'unknown' ? extension : isVideo ? 'mp4' : 'jpg'}`;

    const mediaItem: MediaItem = {
      id: `direct_${shortcode}`,
      postId: shortcode,
      type: mediaType,
      url,
      previewUrl: isVideo ? undefined : url,
      thumbnailUrl: isVideo ? undefined : url,
      filename,
      sizeBytes,
      provider: this.name,
      downloadable: true,
      carouselPosition: { index: 0, total: 1 }
    };

    return {
      ok: true,
      status: 'media_download_available',
      provider: this.name,
      shortcode,
      canonicalUrl: url,
      title: `Direct Media (${extension.toUpperCase()})`,
      media: [mediaItem],
      downloadAvailable: true,
      preview: {
        type: 'thumbnail',
        thumbnailUrl: mediaItem.thumbnailUrl || url,
        title: `Direct Media (${extension.toUpperCase()})`,
        providerName: 'Meta CDN'
      },
      disclaimer: 'Direct media link verified and ingested from Meta CDN with SSRF protections.'
    };
  }
}
