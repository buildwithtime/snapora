import { z } from 'zod';
import { IMediaProvider, ResolveResult, ProviderCapabilities } from './types.js';
import { config } from '../config/index.js';

const MetaOEmbedSchema = z.object({
  version: z.string().optional(),
  title: z.string().optional(),
  author_name: z.string().optional(),
  author_url: z.string().optional(),
  provider_name: z.string().optional(),
  provider_url: z.string().optional(),
  type: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional().nullable(),
  html: z.string().optional(),
  thumbnail_url: z.string().optional(),
  thumbnail_width: z.number().optional(),
  thumbnail_height: z.number().optional()
});

export interface InstagramOEmbedProviderOptions {
  appId?: string;
  clientToken?: string;
  accessToken?: string;
  timeoutMs?: number;
  maxResponseSizeBytes?: number;
  fetchFn?: typeof fetch;
}

export class InstagramOEmbedProvider implements IMediaProvider {
  readonly id = 'oembed';
  readonly name = 'InstagramOEmbedProvider';
  private appId?: string;
  private clientToken?: string;
  private accessToken?: string;
  private timeoutMs: number;
  private maxResponseSizeBytes: number;
  private fetchFn: typeof fetch;

  getCapabilities(): ProviderCapabilities {
    return {
      supportsPreview: true,
      supportsMetadata: true,
      supportsOriginalDownload: false,
      supportsCarousel: false,
      requiresAuthentication: false,
      requiresConfiguration: true
    };
  }

  constructor(options?: InstagramOEmbedProviderOptions) {
    this.appId = options?.appId || config.instagramAppId;
    this.clientToken = options?.clientToken || config.instagramClientToken;
    this.accessToken = options?.accessToken || config.instagramOembedAccessToken;
    this.timeoutMs = options?.timeoutMs || config.resolverTimeoutMs || 10000;
    this.maxResponseSizeBytes = options?.maxResponseSizeBytes || config.maxResponseSizeBytes || 52428800;
    this.fetchFn = options?.fetchFn || fetch;
  }

  canResolve(url: string): boolean {
    const lower = url.toLowerCase();
    return lower.includes('instagram.com') || lower.includes('instagr.am');
  }

  private getEffectiveToken(): string | undefined {
    if (this.accessToken) {
      return this.accessToken;
    }
    if (this.appId && this.clientToken) {
      return `${this.appId}|${this.clientToken}`;
    }
    return undefined;
  }

  async resolve(url: string, shortcode: string): Promise<ResolveResult> {
    const token = this.getEffectiveToken();

    // 1. Check for missing credentials
    if (!token) {
      return {
        ok: false,
        status: 'preview_unavailable',
        provider: this.name,
        shortcode,
        error: {
          code: 'PROVIDER_NOT_CONFIGURED',
          message:
            'Meta Application ID and Client Token are not configured on the backend server. Configure INSTAGRAM_APP_ID and INSTAGRAM_CLIENT_TOKEN in .env to enable official live Instagram oEmbed previews.'
        }
      };
    }

    // 2. Build official Meta oEmbed endpoint URL
    const targetUrl = new URL('https://graph.facebook.com/v21.0/instagram_oembed');
    targetUrl.searchParams.set('url', url);
    targetUrl.searchParams.set('access_token', token);
    targetUrl.searchParams.set('omitscript', 'true');

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchFn(targetUrl.toString(), {
        method: 'GET',
        headers: {
          Accept: 'application/json'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutHandle);

      // Check Content-Length if provided
      const contentLengthHeader = response.headers?.get?.('content-length');
      if (contentLengthHeader) {
        const length = parseInt(contentLengthHeader, 10);
        if (!isNaN(length) && length > this.maxResponseSizeBytes) {
          return {
            ok: false,
            status: 'provider_error',
            provider: this.name,
            shortcode,
            error: {
              code: 'PROVIDER_ERROR',
              message: 'Meta API response exceeded maximum allowable size limit'
            }
          };
        }
      }

      // 3. Handle non-200 responses
      if (!response.ok) {
        let errorDetails = '';
        let errorCode = '';
        let errorSubcode = 0;

        try {
          const errJson = (await response.json()) as {
            error?: { message?: string; code?: number; error_subcode?: number };
          };
          errorDetails = errJson.error?.message || '';
          errorCode = String(errJson.error?.code || '');
          errorSubcode = errJson.error?.error_subcode || 0;
        } catch {
          errorDetails = response.statusText;
        }

        if (response.status === 404) {
          return {
            ok: false,
            status: 'preview_unavailable',
            provider: this.name,
            shortcode,
            error: {
              code: 'CONTENT_UNAVAILABLE',
              message: 'The requested Instagram post was not found or has been removed.'
            }
          };
        }

        if (response.status === 429 || errorCode === '4' || errorCode === '17') {
          return {
            ok: false,
            status: 'provider_error',
            provider: this.name,
            shortcode,
            error: {
              code: 'RATE_LIMITED',
              message: 'Meta oEmbed API rate limit exceeded. Please retry after cooling down.'
            }
          };
        }

        if (
          errorCode === '190' ||
          errorDetails.includes('OAuthException') ||
          errorDetails.includes('Invalid OAuth access token')
        ) {
          return {
            ok: false,
            status: 'provider_error',
            provider: this.name,
            shortcode,
            error: {
              code: 'AUTHENTICATION_ERROR',
              message: 'Invalid or unauthorized Meta application credentials.'
            }
          };
        }

        // Error code 100 or subcode 33 typically denotes private/age-restricted media or disabled embeds
        const lowerMsg = errorDetails.toLowerCase();
        if (
          errorCode === '100' ||
          errorSubcode === 33 ||
          lowerMsg.includes('private') ||
          lowerMsg.includes('permission') ||
          lowerMsg.includes('embed') ||
          lowerMsg.includes('cannot be embedded')
        ) {
          return {
            ok: false,
            status: 'preview_unavailable',
            provider: this.name,
            shortcode,
            error: {
              code: 'CONTENT_PRIVATE',
              message:
                'This Instagram post or account is private, or embedding has been disabled by the creator.'
            }
          };
        }

        return {
          ok: false,
          status: 'provider_error',
          provider: this.name,
          shortcode,
          error: {
            code: 'PROVIDER_ERROR',
            message: `Meta API returned HTTP status ${response.status}: ${errorDetails || 'Unknown error'}`
          }
        };
      }

      // 4. Parse & validate response payload with Zod
      const rawText = await response.text();
      if (rawText.length > this.maxResponseSizeBytes) {
        return {
          ok: false,
          status: 'provider_error',
          provider: this.name,
          shortcode,
          error: {
            code: 'PROVIDER_ERROR',
            message: 'Meta API response exceeded allowable size limit'
          }
        };
      }

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(rawText);
      } catch {
        return {
          ok: false,
          status: 'provider_error',
          provider: this.name,
          shortcode,
          error: {
            code: 'PROVIDER_ERROR',
            message: 'Meta API returned non-JSON response'
          }
        };
      }

      const validated = MetaOEmbedSchema.safeParse(parsedJson);
      if (!validated.success) {
        return {
          ok: false,
          status: 'provider_error',
          provider: this.name,
          shortcode,
          error: {
            code: 'PROVIDER_ERROR',
            message: 'Invalid or unexpected oEmbed payload structure from Meta'
          }
        };
      }

      const data = validated.data;

      // 5. Build official live-preview result
      // IMPORTANT: oEmbed provides embedding and metadata, but NOT raw downloadable MP4/photo files
      return {
        ok: true,
        status: 'live_preview_retrieved',
        provider: this.name,
        shortcode,
        canonicalUrl: url,
        title: data.title || `Post by @${data.author_name || 'Instagram User'}`,
        author: data.author_name,
        preview: {
          type: 'embed',
          html: data.html,
          thumbnailUrl: data.thumbnail_url,
          thumbnailWidth: data.thumbnail_width,
          thumbnailHeight: data.thumbnail_height,
          authorName: data.author_name,
          authorUrl: data.author_url,
          title: data.title,
          providerName: data.provider_name || 'Instagram',
          version: data.version
        },
        media: [], // Zero media files: oEmbed does not deliver downloadable streams
        downloadAvailable: false,
        disclaimer:
          'Official Meta oEmbed preview. Meta public APIs provide embedding and thumbnail metadata, but do not provide raw downloadable media files.'
      };
    } catch (err: unknown) {
      clearTimeout(timeoutHandle);

      const isAbort =
        (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')) ||
        (typeof err === 'object' && err !== null && 'name' in err && (err as { name: unknown }).name === 'AbortError');

      if (isAbort) {
        return {
          ok: false,
          status: 'provider_error',
          provider: this.name,
          shortcode,
          error: {
            code: 'TIMEOUT',
            message: `Meta API request timed out after ${this.timeoutMs}ms`
          }
        };
      }

      const msg = err instanceof Error ? err.message : 'Network request failure';
      return {
        ok: false,
        status: 'provider_error',
        provider: this.name,
        shortcode,
        error: {
          code: 'NETWORK_ERROR',
          message: `Network failure connecting to Meta Graph API: ${msg}`
        }
      };
    }
  }
}
