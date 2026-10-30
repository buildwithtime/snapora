import {
  IMediaProvider,
  ResolveResult,
  ProviderCapabilities,
  CarouselItem,
  MediaItem,
  ResolveOptions,
  ProfileDiscoveryResult,
  ProfileDiscoveryOptions,
  ProfileInfo,
  ProfileMediaItem,
  ProfileMediaChild
} from './types.js';
import { z } from 'zod';
import { config } from '../config/index.js';
import { parseRetryAfter, formatRateLimitMessage } from '../utils/errors.js';

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
    this.graphApiVersion = options?.graphApiVersion || config.instagramGraphApiVersion || 'v21.0';
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
      requiresConfiguration: true,
      supportsProfileDiscovery: true
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

      const response = await this.fetchFn(targetUrl.toString(), {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`
        },
        signal: controller.signal
      });

      clearTimeout(timeoutHandle);

      if (!response.ok) {
        if (response.status === 429) {
          const retryHeader = typeof response.headers?.get === 'function' ? response.headers.get('retry-after') : undefined;
          const retrySeconds = parseRetryAfter(retryHeader);
          const message = formatRateLimitMessage(retrySeconds);
          return {
            ok: false,
            status: 'rate_limited',
            provider: this.name,
            shortcode,
            error: {
              code: 'RATE_LIMITED',
              message,
              ...(retrySeconds && retrySeconds > 0 ? { retryAfterSeconds: retrySeconds } : {})
            }
          };
        }

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

      let json: { data?: unknown[] } = {};
      try {
        if (typeof response.text === 'function') {
          const rawText = await response.text();
          if (rawText.trim()) {
            json = JSON.parse(rawText) as { data?: unknown[] };
          }
        } else if (typeof (response as any).json === 'function') {
          json = await (response as any).json();
        }
      } catch {
        return {
          ok: false,
          status: 'provider_error',
          provider: this.name,
          shortcode,
          error: {
            code: 'PROVIDER_ERROR',
            message: 'Received invalid response payload from Meta Graph API'
          }
        };
      }
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

  canDiscoverProfile(_urlOrUsername: string): boolean {
    return true;
  }

  async discoverProfile(
    urlOrUsername: string,
    options?: ProfileDiscoveryOptions
  ): Promise<ProfileDiscoveryResult> {
    const token = options?.userAccessToken || this.userAccessToken;
    if (!token) {
      return {
        ok: false,
        provider: this.name,
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message:
            'Access to discover media via Instagram Graph API requires an authorized access token with instagram_basic scope.'
        }
      };
    }

    if (options?.cursor && (!/^[a-zA-Z0-9_.:=+-]{1,512}$/.test(options.cursor) || options.cursor.includes('..'))) {
      return {
        ok: false,
        provider: this.name,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Malformed pagination cursor parameter.'
        }
      };
    }

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      // 1. Fetch user account details
      const userUrl = new URL(`https://graph.facebook.com/${this.graphApiVersion}/me`);
      userUrl.searchParams.set('fields', 'id,username,name,biography,profile_picture_url,media_count,followers_count,follows_count');

      const userResp = await this.fetchFn(userUrl.toString(), {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`
        },
        signal: controller.signal
      });

      if (userResp.status === 429) {
        clearTimeout(timeoutHandle);
        const retryHeader = typeof userResp.headers?.get === 'function' ? userResp.headers.get('retry-after') : undefined;
        const retrySeconds = parseRetryAfter(retryHeader);
        return {
          ok: false,
          provider: this.name,
          error: {
            code: 'RATE_LIMITED',
            message: formatRateLimitMessage(retrySeconds),
            ...(retrySeconds && retrySeconds > 0 ? { retryAfterSeconds: retrySeconds } : {})
          }
        };
      }

      let profileData: any = {};
      if (userResp.ok) {
        profileData = await userResp.json().catch(() => ({}));
      }

      // Check account ownership against requested username
      let requestedUsername = urlOrUsername.trim();
      if (requestedUsername.includes('/')) {
        const parts = requestedUsername.split('/').filter(Boolean);
        requestedUsername = parts.pop() || requestedUsername;
      }
      requestedUsername = requestedUsername.replace(/^@/, '').toLowerCase();

      const authUsername = (profileData.username || '').toLowerCase();
      if (
        requestedUsername &&
        requestedUsername !== 'me' &&
        authUsername &&
        requestedUsername !== authUsername
      ) {
        clearTimeout(timeoutHandle);
        return {
          ok: false,
          provider: this.name,
          error: {
            code: 'AUTHENTICATION_REQUIRED',
            message: `The provided Meta Graph API access token belongs to @${profileData.username}, not @${requestedUsername}. Meta Graph API /me/media only provides authorized access to your own managed creator or business account.`
          }
        };
      }

      // 2. Fetch media list with pagination cursor
      const mediaUrl = new URL(`https://graph.facebook.com/${this.graphApiVersion}/me/media`);
      mediaUrl.searchParams.set(
        'fields',
        'id,caption,media_type,media_url,permalink,thumbnail_url,timestamp,like_count,comments_count,children{id,media_type,media_url}'
      );
      mediaUrl.searchParams.set('limit', String(options?.limit || 24));
      if (options?.cursor) {
        mediaUrl.searchParams.set('after', options.cursor);
      }

      const mediaResp = await this.fetchFn(mediaUrl.toString(), {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`
        },
        signal: controller.signal
      });
      clearTimeout(timeoutHandle);

      if (mediaResp.status === 429) {
        const retryHeader = typeof mediaResp.headers?.get === 'function' ? mediaResp.headers.get('retry-after') : undefined;
        const retrySeconds = parseRetryAfter(retryHeader);
        return {
          ok: false,
          provider: this.name,
          error: {
            code: 'RATE_LIMITED',
            message: formatRateLimitMessage(retrySeconds),
            ...(retrySeconds && retrySeconds > 0 ? { retryAfterSeconds: retrySeconds } : {})
          }
        };
      }

      if (!mediaResp.ok) {
        const errorJson: any = await mediaResp.json().catch(() => ({}));
        const isAuthError =
          mediaResp.status === 401 ||
          errorJson?.error?.code === 190 ||
          errorJson?.error?.type === 'OAuthException';
        return {
          ok: false,
          provider: this.name,
          error: {
            code: isAuthError ? 'AUTHENTICATION_ERROR' : 'PROVIDER_ERROR',
            message: errorJson?.error?.message || `Meta Graph API responded with HTTP ${mediaResp.status}`
          }
        };
      }

      const rawJson: any = await mediaResp.json();
      const rawItems: any[] = Array.isArray(rawJson?.data) ? rawJson.data : [];

      const items: ProfileMediaItem[] = rawItems.map((item) => {
        const isCarousel = item.media_type === 'CAROUSEL_ALBUM';
        const isVideo = item.media_type === 'VIDEO';
        const type: 'image' | 'video' | 'carousel' = isCarousel ? 'carousel' : isVideo ? 'video' : 'image';

        const permalink = item.permalink || `https://www.instagram.com/p/${item.id}/`;
        const shortcodeMatch = permalink.match(/\/(?:p|reel|tv)\/([a-zA-Z0-9_-]+)/);
        const shortcode = shortcodeMatch ? shortcodeMatch[1] : item.id;

        const mediaItem: ProfileMediaItem = {
          id: item.id,
          shortcode,
          url: permalink,
          type,
          thumbnailUrl: item.thumbnail_url || item.media_url || '',
          displayUrl: item.media_url || item.thumbnail_url || '',
          caption: item.caption,
          likesCount: item.like_count,
          commentsCount: item.comments_count,
          timestamp: item.timestamp ? new Date(item.timestamp).getTime() : undefined
        };

        if (isCarousel && item.children?.data) {
          mediaItem.carouselMedia = item.children.data.map((c: any) => ({
            id: c.id,
            type: c.media_type === 'VIDEO' ? 'video' : 'image',
            url: c.media_url,
            thumbnailUrl: c.thumbnail_url || c.media_url
          }));
        }

        return mediaItem;
      });

      const cleanUsername = profileData.username || urlOrUsername.replace(/https?:\/\/(?:www\.)?instagram\.com\//, '').replace(/\/$/, '').replace(/^@/, '');
      const profileInfo: ProfileInfo = {
        username: cleanUsername,
        fullName: profileData.name || cleanUsername,
        biography: profileData.biography,
        avatarUrl: profileData.profile_picture_url,
        isPrivate: false,
        isVerified: false,
        postsCount: profileData.media_count ?? items.length,
        followersCount: profileData.followers_count,
        followingCount: profileData.follows_count
      };

      const paging = rawJson?.paging;
      const afterCursor = paging?.cursors?.after;
      const hasMore = Boolean(paging?.next && afterCursor);

      return {
        ok: true,
        provider: this.name,
        profile: profileInfo,
        items,
        pagination: {
          hasMore,
          nextCursor: afterCursor,
          totalLoaded: items.length
        }
      };
    } catch (err: unknown) {
      clearTimeout(timeoutHandle);
      const isAbort = err instanceof Error && err.name === 'AbortError';
      return {
        ok: false,
        provider: this.name,
        error: {
          code: isAbort ? 'TIMEOUT' : 'NETWORK_ERROR',
          message: isAbort ? 'Graph API request timed out' : 'Failed to connect to Meta Graph API'
        }
      };
    }
  }
}
