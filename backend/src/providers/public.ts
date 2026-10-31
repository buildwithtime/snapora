import {
  IMediaProvider,
  ProviderCapabilities,
  ResolveResult,
  MediaItem,
  CarouselItem,
  ResolveOptions,
  ProfileDiscoveryResult,
  ProfileDiscoveryOptions,
  ProfileInfo,
  ProfileMediaItem,
  ProfileMediaChild
} from './types.js';
import { parseInstagramUrl, USERNAME_REGEX } from '../utils/urlParser.js';
import { safeHttpsRequest } from '../utils/ssrfClient.js';
import { config } from '../config/index.js';
import { parseRetryAfter, formatRateLimitMessage } from '../utils/errors.js';

export interface PublicWebProviderOptions {
  timeoutMs?: number;
}

export class PublicWebMediaProvider implements IMediaProvider {
  readonly id = 'public';
  readonly name = 'Instagram Public Web Provider';

  private timeoutMs: number;

  constructor(options: PublicWebProviderOptions = {}) {
    this.timeoutMs = options.timeoutMs || config.resolverTimeoutMs || 15000;
  }

  getCapabilities(): ProviderCapabilities {
    return {
      supportsPreview: true,
      supportsMetadata: true,
      supportsOriginalDownload: true,
      supportsCarousel: true,
      requiresAuthentication: false,
      requiresConfiguration: false,
      supportsProfileDiscovery: true
    };
  }

  canResolve(url: string): boolean {
    const parsed = parseInstagramUrl(url);
    return parsed.valid && (parsed.contentType === 'post' || parsed.contentType === 'reel' || parsed.contentType === 'tv');
  }

  async resolve(url: string, shortcode: string, _options?: ResolveOptions): Promise<ResolveResult> {
    const parsed = parseInstagramUrl(url);
    if (!parsed.valid || !parsed.canonicalUrl) {
      return {
        ok: false,
        status: 'invalid_url',
        provider: this.id,
        shortcode,
        error: {
          code: 'UNSUPPORTED_URL',
          message: parsed.error || 'Invalid Instagram URL'
        }
      };
    }

    const canonicalUrl = parsed.canonicalUrl;

    try {
      // Execute SSRF-hardened HTTPS fetch to public Instagram web permalink
      const safeResponse = await safeHttpsRequest(canonicalUrl, {
        method: 'GET',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none'
        },
        timeoutMs: this.timeoutMs,
        maxResponseSizeBytes: 5 * 1024 * 1024 // 5MB max for HTML payload
      });

      // Handle upstream HTTP statuses
      if (safeResponse.statusCode === 404) {
        safeResponse.stream.destroy();
        return {
          ok: false,
          status: 'permanently_inaccessible',
          provider: this.id,
          shortcode,
          error: {
            code: 'CONTENT_UNAVAILABLE',
            message: 'The requested Instagram post was deleted or does not exist.'
          }
        };
      }

      if (safeResponse.statusCode === 429) {
        safeResponse.stream.destroy();
        const retryHeader = safeResponse.headers['retry-after'];
        const retrySeconds = parseRetryAfter(retryHeader);
        const message = formatRateLimitMessage(retrySeconds);
        return {
          ok: false,
          status: 'rate_limited',
          provider: this.id,
          shortcode,
          error: {
            code: 'RATE_LIMITED',
            message,
            ...(retrySeconds && retrySeconds > 0 ? { retryAfterSeconds: retrySeconds } : {})
          }
        };
      }

      if (safeResponse.statusCode === 401 || safeResponse.statusCode === 403) {
        safeResponse.stream.destroy();
        return {
          ok: false,
          status: 'authentication_required',
          provider: this.id,
          shortcode,
          error: {
            code: 'CONTENT_PRIVATE',
            message: 'This post is private or requires authentication to view.'
          }
        };
      }

      if (safeResponse.statusCode >= 400) {
        safeResponse.stream.destroy();
        return {
          ok: false,
          status: 'temporarily_unavailable',
          provider: this.id,
          shortcode,
          error: {
            code: 'PROVIDER_ERROR',
            message: `Instagram web server returned HTTP ${safeResponse.statusCode}`
          }
        };
      }

      // Read response HTML
      const chunks: Buffer[] = [];
      for await (const chunk of safeResponse.stream) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      }
      const html = Buffer.concat(chunks).toString('utf8');

      // Check if redirected to login page indicating private post or login wall
      const isLoginRedirect =
        safeResponse.finalUrl.includes('/accounts/login') ||
        (html.includes('login_page') && !html.includes('xig_polaris_media'));

      if (isLoginRedirect) {
        return {
          ok: false,
          status: 'authentication_required',
          provider: this.id,
          shortcode,
          error: {
            code: 'CONTENT_PRIVATE',
            message: 'This post belongs to a private account or requires Instagram login.'
          }
        };
      }

      const isLoginWall =
        html.includes('/accounts/login/') ||
        html.includes('Login • Instagram') ||
        html.includes('"require_login":true') ||
        html.includes('login-box');

      if (isLoginWall) {
        return {
          ok: false,
          status: 'authentication_required',
          provider: this.id,
          shortcode,
          error: {
            code: 'LOGIN_WALL_ENCOUNTERED',
            message: 'Instagram requires account authorization to view this post. Connect an authorized Meta account or provide an access token.'
          }
        };
      }

      // Parse media from HTML response
      return this.parseHtmlResponse(html, shortcode, canonicalUrl);
    } catch (err: any) {
      if (err.code === 'SSRF_BLOCKED') {
        return {
          ok: false,
          status: 'invalid_url',
          provider: this.id,
          shortcode,
          error: {
            code: 'SSRF_BLOCKED',
            message: err.message
          }
        };
      }

      if (err.code === 'TIMEOUT') {
        return {
          ok: false,
          status: 'temporarily_unavailable',
          provider: this.id,
          shortcode,
          error: {
            code: 'TIMEOUT',
            message: 'Connection timed out while fetching Instagram post.'
          }
        };
      }

      const msg = err instanceof Error ? err.message : 'Unknown network failure';
      const isPageFetchFailed = msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED') || msg.includes('ECONNRESET');
      return {
        ok: false,
        status: 'provider_error',
        provider: this.id,
        shortcode,
        error: {
          code: isPageFetchFailed ? 'PAGE_FETCH_FAILED' : 'NETWORK_ERROR',
          message: `Failed to resolve post from Instagram web: ${msg}`
        }
      };
    }
  }

  private parseHtmlResponse(html: string, shortcode: string, canonicalUrl: string): ResolveResult {
    let mediaNode: any = null;
    let title: string | undefined = undefined;
    let author: string | undefined = undefined;

    // 1. Scan for embedded Polaris / ScheduledServerJS script tags
    const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
    let m: RegExpExecArray | null;
    let scriptCount = 0;
    while ((m = scriptRegex.exec(html)) !== null) {
      scriptCount++;
      const content = m[1];
      if (
        content.includes('PolarisLoggedOut') ||
        content.includes('xdt_api__v1__media__shortcode__web_info') ||
        content.includes('xig_polaris_media') ||
        content.includes('carousel_media') ||
        content.includes('image_versions2')
      ) {
        try {
          const parsed = JSON.parse(content.trim());
          mediaNode = this.findMediaNodeInObject(parsed);
          if (mediaNode) {
            break;
          }
        } catch {
          // Continue scanning remaining scripts
        }
      }
    }

    // 2. OpenGraph meta tags as supplementary/fallback metadata
    const ogTitleMatch =
      html.match(/<meta\s+(?:property|name)="og:title"\s+content="([^"]+)"/i) ||
      html.match(/content="([^"]+)"\s+(?:property|name)="og:title"/i);
    const ogDescMatch =
      html.match(/<meta\s+(?:property|name)="og:description"\s+content="([^"]+)"/i) ||
      html.match(/content="([^"]+)"\s+(?:property|name)="og:description"/i);
    const ogImageMatch =
      html.match(/<meta\s+(?:property|name)="og:image"\s+content="([^"]+)"/i) ||
      html.match(/content="([^"]+)"\s+(?:property|name)="og:image"/i);
    const ogVideoMatch =
      html.match(/<meta\s+(?:property|name)="og:video(?::secure_url)?"\s+content="([^"]+)"/i) ||
      html.match(/content="([^"]+)"\s+(?:property|name)="og:video(?::secure_url)?"/i);

    if (ogTitleMatch) {
      const rawTitle = this.decodeHtmlEntities(ogTitleMatch[1]);
      const authorMatch = rawTitle.match(/^(?:([^\s:]+)\s+on\s+Instagram:|([^(@]+)\s*\(@([^)]+)\))/i);
      if (authorMatch) {
        author = (authorMatch[1] || authorMatch[3] || authorMatch[2])?.trim();
      }
      title = rawTitle;
    }

    // If structured media node found
    if (mediaNode) {
      if (mediaNode.caption?.text) {
        title = mediaNode.caption.text;
      }
      if (mediaNode.user?.username) {
        author = mediaNode.user.username;
      }

      const rawTakenAt = mediaNode.taken_at || mediaNode.taken_at_timestamp;
      const takenAt = typeof rawTakenAt === 'number' ? rawTakenAt : undefined;

      const isCarousel =
        mediaNode.media_type === 8 ||
        (Array.isArray(mediaNode.carousel_media) && mediaNode.carousel_media.length > 0);

      const media: MediaItem[] = [];
      const carouselItems: CarouselItem[] = [];

      if (isCarousel && Array.isArray(mediaNode.carousel_media)) {
        const total = mediaNode.carousel_media.length;
        mediaNode.carousel_media.forEach((slide: any, idx: number) => {
          const isVideo = slide.media_type === 2 || Boolean(slide.video_versions?.length) || Boolean(slide.video_url);
          const bestImage = slide.image_versions2?.candidates?.[0]?.url || slide.display_url || slide.display_uri;
          const previewImage =
            slide.image_versions2?.candidates?.find(
              (c: any) => (c.width && c.width <= 750) || (c.height && c.height <= 750)
            )?.url || bestImage;
          const bestVideo = slide.video_versions?.[0]?.url || slide.video_url;
          const downloadUrl = isVideo
            ? (bestVideo ? this.cleanUrl(bestVideo) : undefined)
            : (bestImage ? this.cleanUrl(bestImage) : undefined);
          const isDownloadable = Boolean(downloadUrl);
          const ext = isVideo ? (isDownloadable ? 'mp4' : 'jpg') : 'jpg';

          const item: CarouselItem = {
            id: String(slide.id || `${shortcode}_${idx + 1}`),
            postId: shortcode,
            index: idx,
            type: isVideo ? 'video' : 'image',
            url: downloadUrl,
            previewUrl: previewImage ? this.cleanUrl(previewImage) : downloadUrl,
            thumbnailUrl: previewImage ? this.cleanUrl(previewImage) : downloadUrl,
            filename: `${shortcode}_slide_${idx + 1}_${slide.id || idx + 1}.${ext}`,
            width: slide.original_width,
            height: slide.original_height,
            provider: this.id,
            downloadable: isDownloadable,
            resolutionStatus: isDownloadable ? 'media_download_available' : 'preview_unavailable',
            carouselPosition: { index: idx + 1, total },
            takenAt
          };

          carouselItems.push(item);
          media.push(item as MediaItem);
        });

        return {
          ok: true,
          status: carouselItems.some((c) => c.downloadable) ? 'media_download_available' : 'live_preview_retrieved',
          provider: this.id,
          shortcode,
          canonicalUrl,
          title,
          author,
          takenAt,
          preview: {
            type: 'thumbnail',
            thumbnailUrl: carouselItems[0]?.previewUrl,
            authorName: author,
            authorUrl: author ? `https://www.instagram.com/${author}/` : undefined,
            title,
            providerName: this.name
          },
          media,
          carouselItems,
          downloadAvailable: media.some((m) => m.downloadable)
        };
      } else {
        // Single post or Reel
        const isVideo = mediaNode.media_type === 2 || Boolean(mediaNode.video_versions?.length) || Boolean(mediaNode.video_url);
        const bestImage = mediaNode.image_versions2?.candidates?.[0]?.url || mediaNode.display_url || mediaNode.display_uri;
        const previewImage =
          mediaNode.image_versions2?.candidates?.find(
            (c: any) => (c.width && c.width <= 750) || (c.height && c.height <= 750)
          )?.url || bestImage;
        const bestVideo = mediaNode.video_versions?.[0]?.url || mediaNode.video_url;
        const downloadUrl = isVideo
          ? (bestVideo ? this.cleanUrl(bestVideo) : undefined)
          : (bestImage ? this.cleanUrl(bestImage) : undefined);
        const isDownloadable = Boolean(downloadUrl);
        const ext = isVideo ? (isDownloadable ? 'mp4' : 'jpg') : 'jpg';

        const singleItem: MediaItem = {
          id: String(mediaNode.id || shortcode),
          postId: shortcode,
          type: isVideo ? 'video' : 'image',
          url: downloadUrl,
          previewUrl: previewImage ? this.cleanUrl(previewImage) : downloadUrl,
          thumbnailUrl: previewImage ? this.cleanUrl(previewImage) : downloadUrl,
          filename: `${shortcode}.${ext}`,
          width: mediaNode.original_width,
          height: mediaNode.original_height,
          provider: this.id,
          downloadable: isDownloadable,
          resolutionStatus: isDownloadable ? 'media_download_available' : 'preview_unavailable',
          takenAt
        };

        return {
          ok: true,
          status: isDownloadable ? 'media_download_available' : 'live_preview_retrieved',
          provider: this.id,
          shortcode,
          canonicalUrl,
          title,
          author,
          takenAt,
          preview: {
            type: 'thumbnail',
            thumbnailUrl: singleItem.previewUrl,
            authorName: author,
            authorUrl: author ? `https://www.instagram.com/${author}/` : undefined,
            title,
            providerName: this.name
          },
          media: [singleItem],
          downloadAvailable: isDownloadable,
          disclaimer: !isDownloadable && isVideo ? 'Video stream is unavailable in public web metadata; displaying thumbnail preview only.' : undefined
        };
      }
    }

    // Fallback: Extract from OpenGraph tags if scripts were not populated
    if (ogImageMatch || ogVideoMatch) {
      const isReel = canonicalUrl.includes('/reel/') || canonicalUrl.includes('/tv/');
      const hasVideo = Boolean(ogVideoMatch);
      const isVideo = hasVideo || isReel;

      const videoUrl = hasVideo ? this.cleanUrl(ogVideoMatch![1]) : undefined;
      const imageUrl = ogImageMatch ? this.cleanUrl(ogImageMatch[1]) : undefined;
      const downloadUrl = isVideo ? videoUrl : imageUrl;
      const previewUrl = imageUrl || videoUrl;
      const isDownloadable = Boolean(downloadUrl);
      const ext = isVideo ? (isDownloadable ? 'mp4' : 'jpg') : 'jpg';

      const singleItem: MediaItem = {
        id: shortcode,
        postId: shortcode,
        type: isVideo ? 'video' : 'image',
        url: downloadUrl,
        previewUrl,
        thumbnailUrl: previewUrl,
        filename: `${shortcode}.${ext}`,
        provider: this.id,
        downloadable: isDownloadable,
        resolutionStatus: isDownloadable ? 'media_download_available' : 'preview_unavailable'
      };

      return {
        ok: true,
        status: isDownloadable ? 'media_download_available' : 'live_preview_retrieved',
        provider: this.id,
        shortcode,
        canonicalUrl,
        title,
        author,
        preview: {
          type: 'thumbnail',
          thumbnailUrl: singleItem.previewUrl,
          authorName: author,
          authorUrl: author ? `https://www.instagram.com/${author}/` : undefined,
          title,
          providerName: this.name
        },
        media: [singleItem],
        downloadAvailable: isDownloadable,
        disclaimer: !isDownloadable && isVideo ? 'Video stream is unavailable in public web metadata; displaying thumbnail preview only.' : undefined
      };
    }

    const isClientShell =
      html.includes('Polaris') ||
      html.includes('requireLazy') ||
      html.includes('CAAIGLoginHomepage') ||
      (html.includes('<title>Instagram</title>') && !html.includes('shortcode_media'));

    if (isClientShell) {
      return {
        ok: false,
        status: 'authentication_required',
        provider: this.id,
        shortcode,
        error: {
          code: 'LOGIN_WALL_ENCOUNTERED',
          message: 'Instagram served an unauthenticated web shell requiring login to view this post. Connect an authorized Meta account or provide an access token.'
        }
      };
    }

    return {
      ok: false,
      status: 'unsupported_content',
      provider: this.id,
      shortcode,
      error: {
        code: 'METADATA_NOT_FOUND',
        message: 'Could not extract media metadata from the public Instagram page.'
      }
    };
  }

  private findMediaNodeInObject(obj: any): any {
    if (!obj || typeof obj !== 'object') return null;

    if (obj.xig_polaris_media) {
      return obj.xig_polaris_media.if_not_gated_logged_out || obj.xig_polaris_media;
    }
    if (obj.carousel_media || obj.video_versions || (obj.image_versions2 && obj.code)) {
      return obj;
    }
    if (obj.shortcode_media) {
      return obj.shortcode_media;
    }

    for (const v of Object.values(obj)) {
      const found = this.findMediaNodeInObject(v);
      if (found) return found;
    }
    return null;
  }

  private cleanUrl(rawUrl: string): string {
    return rawUrl.replace(/&amp;/g, '&').replace(/\\u0026/g, '&');
  }

  private decodeHtmlEntities(str: string): string {
    return str
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#064;/g, '@')
      .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)));
  }

  canDiscoverProfile(urlOrUsername: string): boolean {
    if (!urlOrUsername) return false;
    const clean = urlOrUsername.trim().replace(/^@/, '');
    if (clean.includes('/')) {
      const parsed = parseInstagramUrl(clean);
      return parsed.valid && parsed.contentType === 'profile';
    }
    return USERNAME_REGEX.test(clean);
  }

  async discoverProfile(
    urlOrUsername: string,
    options?: ProfileDiscoveryOptions
  ): Promise<ProfileDiscoveryResult> {
    let username = urlOrUsername.trim();
    if (username.includes('/')) {
      const parsed = parseInstagramUrl(username);
      if (parsed.valid && parsed.username) {
        username = parsed.username;
      } else {
        const parts = username.split('/').filter(Boolean);
        username = parts.pop() || username;
      }
    }
    username = username.replace(/^@/, '');

    if (!USERNAME_REGEX.test(username)) {
      return {
        ok: false,
        provider: this.name,
        error: {
          code: 'INVALID_URL',
          message: `Invalid Instagram username format: '${username}'`
        }
      };
    }

    if (options?.cursor && (!/^[a-zA-Z0-9_.:=+-]{1,512}$/.test(options.cursor) || options.cursor.includes('..'))) {
      return {
        ok: false,
        provider: this.name,
        error: {
          code: 'INVALID_URL',
          message: 'Invalid pagination cursor format'
        }
      };
    }

    const canonicalProfileUrl = options?.cursor
      ? `https://www.instagram.com/${username}/?max_id=${encodeURIComponent(options.cursor)}`
      : `https://www.instagram.com/${username}/`;

    try {
      const safeResponse = await safeHttpsRequest(canonicalProfileUrl, {
        method: 'GET',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none'
        },
        timeoutMs: this.timeoutMs,
        maxResponseSizeBytes: 8 * 1024 * 1024 // 8MB ceiling
      });

      if (safeResponse.statusCode === 404) {
        safeResponse.stream.destroy();
        return {
          ok: false,
          provider: this.name,
          error: {
            code: 'POST_NOT_FOUND',
            message: `Instagram profile '@${username}' was not found or has been removed.`
          }
        };
      }

      if (safeResponse.statusCode === 429) {
        safeResponse.stream.destroy();
        const retryHeader = safeResponse.headers['retry-after'];
        const retrySeconds = parseRetryAfter(retryHeader);
        const message = formatRateLimitMessage(retrySeconds);
        return {
          ok: false,
          provider: this.name,
          error: {
            code: 'RATE_LIMITED',
            message,
            ...(retrySeconds && retrySeconds > 0 ? { retryAfterSeconds: retrySeconds } : {})
          }
        };
      }

      const chunks: Buffer[] = [];
      for await (const chunk of safeResponse.stream) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      }
      const html = Buffer.concat(chunks).toString('utf-8');

      // Check for login wall
      const isLoginWall =
        safeResponse.finalUrl.includes('/accounts/login') ||
        html.includes('/accounts/login/') ||
        html.includes('Login • Instagram') ||
        html.includes('"require_login":true') ||
        html.includes('login-box');

      const extracted = this.extractProfileFromHtml(html, username);
      if (extracted) {
        return extracted;
      }

      if (isLoginWall) {
        return {
          ok: false,
          provider: this.name,
          error: {
            code: 'LOGIN_WALL_ENCOUNTERED',
            message: options?.cursor
              ? 'Instagram requires account authorization to paginate beyond initial posts. Please connect an authorized Instagram account or Meta Graph API token.'
              : 'Instagram requires account authorization to view profile timelines anonymously. Connect your Meta account or provide an access token to discover all media.'
          }
        };
      }

      return {
        ok: false,
        provider: this.name,
        error: {
          code: 'CONTENT_UNAVAILABLE',
          message: `Unable to read media timeline for '@${username}'. The account may be restricted or private.`
        }
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Public profile discovery failure';
      return {
        ok: false,
        provider: this.name,
        error: {
          code: 'PROVIDER_ERROR',
          message: `Failed to load profile for '@${username}': ${msg}`
        }
      };
    }
  }

  private extractProfileFromHtml(html: string, fallbackUsername: string): ProfileDiscoveryResult | null {
    // Attempt parsing JSON data blobs embedded in Instagram HTML
    const jsonMatches = html.match(/<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/gi) || [];

    for (const tag of jsonMatches) {
      const content = tag.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '').trim();
      if (!content.includes('edge_owner_to_timeline_media') && !content.includes('ProfilePage')) {
        continue;
      }

      try {
        const parsed = JSON.parse(content);
        const user = this.findUserNodeInObject(parsed);
        if (user) {
          if (user.is_private && !user.edge_owner_to_timeline_media?.edges?.length) {
            return {
              ok: false,
              provider: this.name,
              error: {
                code: 'PRIVATE_ACCOUNT',
                message: `The Instagram account '@${user.username || fallbackUsername}' is private.`
              }
            };
          }

          const timeline = user.edge_owner_to_timeline_media;
          const edges = timeline?.edges || [];
          const items: ProfileMediaItem[] = [];

          for (const edge of edges) {
            const node = edge.node;
            if (!node || !node.shortcode) continue;

            const isVideo = !!node.is_video;
            const isCarousel = node.__typename === 'GraphSidecar' || !!node.edge_sidecar_to_children;
            const type: 'image' | 'video' | 'carousel' = isCarousel ? 'carousel' : isVideo ? 'video' : 'image';

            const item: ProfileMediaItem = {
              id: node.id || `post_${node.shortcode}`,
              shortcode: node.shortcode,
              url: `https://www.instagram.com/p/${node.shortcode}/`,
              type,
              thumbnailUrl: node.thumbnail_src || node.display_url || '',
              displayUrl: node.display_url || '',
              caption: node.edge_media_to_caption?.edges?.[0]?.node?.text,
              likesCount: node.edge_media_preview_like?.count ?? node.edge_liked_by?.count,
              commentsCount: node.edge_media_to_comment?.count,
              timestamp: node.taken_at_timestamp ? node.taken_at_timestamp * 1000 : undefined
            };

            if (isCarousel && node.edge_sidecar_to_children?.edges) {
              item.carouselMedia = node.edge_sidecar_to_children.edges.map((cEdge: any, idx: number) => {
                const cNode = cEdge.node;
                return {
                  id: cNode.id || `${item.id}_${idx}`,
                  type: cNode.is_video ? 'video' : 'image',
                  url: cNode.video_url || cNode.display_url,
                  thumbnailUrl: cNode.display_url,
                  width: cNode.dimensions?.width,
                  height: cNode.dimensions?.height
                };
              });
            }

            items.push(item);
          }

          const profileInfo: ProfileInfo = {
            username: user.username || fallbackUsername,
            fullName: user.full_name || user.username || fallbackUsername,
            biography: user.biography,
            avatarUrl: user.profile_pic_url_hd || user.profile_pic_url,
            isPrivate: !!user.is_private,
            isVerified: !!user.is_verified,
            postsCount: timeline?.count ?? items.length,
            followersCount: user.edge_followed_by?.count,
            followingCount: user.edge_follow?.count
          };

          const pageInfo = timeline?.page_info;
          return {
            ok: true,
            provider: this.name,
            profile: profileInfo,
            items,
            pagination: {
              hasMore: !!pageInfo?.has_next_page,
              nextCursor: pageInfo?.end_cursor,
              totalLoaded: items.length
            }
          };
        }
      } catch {
        // Skip unparseable JSON blocks
      }
    }

    return null;
  }

  private findUserNodeInObject(obj: any): any {
    if (!obj || typeof obj !== 'object') return null;
    if (obj.edge_owner_to_timeline_media || (obj.username && obj.profile_pic_url)) {
      return obj;
    }
    for (const val of Object.values(obj)) {
      const found = this.findUserNodeInObject(val);
      if (found) return found;
    }
    return null;
  }
}
