import { IMediaProvider, ProviderCapabilities, ResolveResult, MediaItem, CarouselItem, ResolveOptions } from './types.js';
import { parseInstagramUrl } from '../utils/urlParser.js';
import { safeHttpsRequest } from '../utils/ssrfClient.js';
import { config } from '../config/index.js';

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
      requiresConfiguration: false
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
        return {
          ok: false,
          status: 'rate_limited',
          provider: this.id,
          shortcode,
          error: {
            code: 'RATE_LIMITED',
            message: 'Instagram web rate limit reached. Please wait a few moments before retrying.'
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

      // Check if redirected to login page indicating private post
      if (safeResponse.finalUrl.includes('/accounts/login/') || html.includes('login_page') && !html.includes('xig_polaris_media')) {
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
      return {
        ok: false,
        status: 'provider_error',
        provider: this.id,
        shortcode,
        error: {
          code: 'NETWORK_ERROR',
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

    return {
      ok: false,
      status: 'unsupported_content',
      provider: this.id,
      shortcode,
      error: {
        code: 'CONTENT_UNAVAILABLE',
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
}
