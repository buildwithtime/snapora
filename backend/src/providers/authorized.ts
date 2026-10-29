import { IMediaProvider, ResolveResult, ProviderCapabilities, CarouselItem, MediaItem, ResolveOptions } from './types.js';
import { z } from 'zod';
import { config } from '../config/index.js';

const GraphApiMediaItemSchema = z.object({
  id: z.string(),
  caption: z.string().optional(),
  media_type: z.enum(['IMAGE', 'VIDEO', 'CAROUSEL_ALBUM']),
  media_url: z.string().optional(),
  permalink: z.string().optional(),
  thumbnail_url: z.string().optional(),
  timestamp: z.string().optional(),
  children: z
    .object({
      data: z.array(
        z.object({
          id: z.string(),
          media_type: z.enum(['IMAGE', 'VIDEO']),
          media_url: z.string().optional(),
          thumbnail_url: z.string().optional()
        })
      )
    })
    .optional()
});

export interface AuthorizedAccountMediaProviderOptions {
  userAccessToken?: string;
  graphApiVersion?: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

/**
 * Official Instagram Graph API Provider for authenticated user/creator accounts.
 * Provides authorized access to high-resolution original media and carousel children.
 *
 * Requirements:
 * - Meta Business Login OAuth 2.0 with 'instagram_basic' permission.
 * - Caller must own or manage the target Instagram professional/creator account.
 */
export class AuthorizedAccountMediaProvider implements IMediaProvider {
  readonly id = 'authorized';
  readonly name = 'AuthorizedAccountMediaProvider';
  private userAccessToken?: string;
  private graphApiVersion: string;
  private timeoutMs: number;
  private fetchFn: typeof fetch;

  constructor(options?: AuthorizedAccountMediaProviderOptions) {
    this.userAccessToken = options?.userAccessToken;
    this.graphApiVersion = options?.graphApiVersion || 'v21.0';
    this.timeoutMs = options?.timeoutMs || config.resolverTimeoutMs || 10000;
    this.fetchFn = options?.fetchFn || fetch;
  }

  getCapabilities(): ProviderCapabilities {
    return {
      supportsPreview: true,
      supportsMetadata: true,
      supportsOriginalDownload: true,
      supportsCarousel: true,
      requiresAuthentication: true,
      requiresConfiguration: true
    };
  }

  canResolve(url: string): boolean {
    const lower = url.toLowerCase();
    return lower.includes('instagram.com') || lower.includes('instagr.am');
  }

  async resolve(url: string, shortcode: string, options?: ResolveOptions): Promise<ResolveResult> {
    const token = options?.userAccessToken || this.userAccessToken;
    if (!token) {
      return {
        ok: false,
        status: 'authentication_required',
        provider: this.name,
        shortcode,
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message:
            'Connecting an authorized Instagram account is required to download original media via Instagram Graph API. Please connect your Meta account or provide an access token.',
          details: 'OAuth 2.0 user access token with instagram_basic scope is required.'
        }
      };
    }

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      // Query Graph API for user's media matching the given shortcode or permalink
      const targetUrl = new URL(`https://graph.facebook.com/${this.graphApiVersion}/me/media`);
      targetUrl.searchParams.set('fields', 'id,caption,media_type,media_url,permalink,thumbnail_url,timestamp,children{id,media_type,media_url}');
      targetUrl.searchParams.set('limit', '100');
      targetUrl.searchParams.set('access_token', token);

      const response = await this.fetchFn(targetUrl.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });

      clearTimeout(timeoutHandle);

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          return {
            ok: false,
            status: 'authentication_required',
            provider: this.name,
            shortcode,
            error: {
              code: 'AUTHENTICATION_ERROR',
              message: 'Your Meta account session has expired or lacks permissions. Please reconnect.',
              details: `Graph API returned HTTP ${response.status}`
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
            message: `Meta Graph API error (HTTP ${response.status})`
          }
        };
      }

      const json = await response.json() as { data?: unknown[] };
      const items = Array.isArray(json.data) ? json.data : [];

      // Find the item matching shortcode in permalink
      const matchedRaw = items.find((item: any) =>
        item.permalink && (item.permalink.includes(`/${shortcode}/`) || item.id === shortcode)
      );

      if (!matchedRaw) {
        return {
          ok: false,
          status: 'preview_unavailable',
          provider: this.name,
          shortcode,
          error: {
            code: 'CONTENT_UNAVAILABLE',
            message: `Post '${shortcode}' was not found in the connected Instagram account.`,
            details: 'Meta Graph API permits downloading media only from the authenticated creator or business account itself. Arbitrary third-party posts cannot be accessed via Graph API.'
          }
        };
      }

      const parseResult = GraphApiMediaItemSchema.safeParse(matchedRaw);
      if (!parseResult.success) {
        return {
          ok: false,
          status: 'provider_error',
          provider: this.name,
          shortcode,
          error: {
            code: 'PROVIDER_ERROR',
            message: 'Invalid media response structure from Meta Graph API'
          }
        };
      }

      const mediaData = parseResult.data;
      const mediaList: MediaItem[] = [];
      const carouselList: CarouselItem[] = [];

      if (mediaData.media_type === 'CAROUSEL_ALBUM' && mediaData.children?.data) {
        const total = mediaData.children.data.length;
        mediaData.children.data.forEach((child, idx) => {
          if (child.media_url) {
            const isVideo = child.media_type === 'VIDEO';
            const filename = `snapora_${shortcode}_${idx + 1}.${isVideo ? 'mp4' : 'jpg'}`;
            const item: CarouselItem = {
              id: child.id,
              postId: shortcode,
              index: idx,
              type: isVideo ? 'video' : 'image',
              url: child.media_url,
              previewUrl: child.thumbnail_url || child.media_url,
              thumbnailUrl: child.thumbnail_url || child.media_url,
              filename,
              provider: this.name,
              downloadable: true,
              carouselPosition: { index: idx, total }
            };
            carouselList.push(item);
            mediaList.push({
              id: child.id,
              postId: shortcode,
              type: item.type,
              url: item.url,
              previewUrl: item.previewUrl,
              thumbnailUrl: item.thumbnailUrl,
              filename: item.filename,
              provider: this.name,
              downloadable: true,
              carouselPosition: { index: idx, total }
            });
          }
        });
      } else if (mediaData.media_url) {
        const isVideo = mediaData.media_type === 'VIDEO';
        const filename = `snapora_${shortcode}.${isVideo ? 'mp4' : 'jpg'}`;
        mediaList.push({
          id: mediaData.id,
          postId: shortcode,
          type: isVideo ? 'video' : 'image',
          url: mediaData.media_url,
          previewUrl: mediaData.thumbnail_url || mediaData.media_url,
          thumbnailUrl: mediaData.thumbnail_url || mediaData.media_url,
          filename,
          provider: this.name,
          downloadable: true,
          carouselPosition: { index: 0, total: 1 }
        });
      }

      return {
        ok: true,
        status: 'media_download_available',
        provider: this.name,
        shortcode,
        canonicalUrl: mediaData.permalink || url,
        title: mediaData.caption ? mediaData.caption.slice(0, 100) : `Post ${shortcode}`,
        media: mediaList,
        carouselItems: carouselList.length > 0 ? carouselList : undefined,
        downloadAvailable: mediaList.length > 0,
        preview: {
          type: 'thumbnail',
          thumbnailUrl: mediaData.thumbnail_url || mediaList[0]?.url,
          title: mediaData.caption
        },
        disclaimer: 'Retrieved via official Meta Graph API with authorized user permissions.'
      };
    } catch (err: unknown) {
      clearTimeout(timeoutHandle);
      const isAbort = err instanceof Error && err.name === 'AbortError';
      return {
        ok: false,
        status: 'provider_error',
        provider: this.name,
        shortcode,
        error: {
          code: isAbort ? 'TIMEOUT' : 'NETWORK_ERROR',
          message: isAbort ? 'Graph API request timed out' : 'Failed to connect to Meta Graph API'
        }
      };
    }
  }
}
