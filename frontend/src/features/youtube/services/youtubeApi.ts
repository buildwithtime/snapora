import { YouTubeResolvedData, YouTubeResolutionError } from '../types.js';
import { isYouTubeMetadataExpired } from '../../../utils/retention.js';

export interface ResolveYouTubeResult {
  ok: boolean;
  data?: YouTubeResolvedData;
  error?: YouTubeResolutionError;
}

export function mapYouTubeBackendError(code: string, rawMessage?: string): string {
  switch (code) {
    case 'UNSUPPORTED_URL':
      return rawMessage || 'The provided URL is not a recognized YouTube video. Playlists and channels are not supported.';
    case 'VIDEO_NOT_FOUND':
    case 'POST_NOT_FOUND':
      return 'The requested YouTube video could not be found. It may have been deleted or removed.';
    case 'PRIVATE_VIDEO':
    case 'CONTENT_PRIVATE':
      return 'This YouTube video is private or restricted by the creator.';
    case 'QUOTA_EXCEEDED':
      return 'YouTube API query quota is currently exhausted. Try again later.';
    case 'INVALID_API_KEY':
      return 'YouTube service configuration issue on the server. Please contact administrator.';
    case 'RATE_LIMITED':
    case 'UPSTREAM_RATE_LIMITED':
    case 'LOCAL_RATE_LIMITED':
      return 'Request limit reached. Please wait a moment before trying again.';
    case 'TIMEOUT':
      return 'The request to YouTube took too long to complete. Please try again.';
    case 'PAGE_FETCH_FAILED':
    case 'NETWORK_ERROR':
      return 'Network connection issue while communicating with YouTube. Please verify your connection.';
    default:
      return rawMessage || 'Failed to retrieve video metadata from YouTube.';
  }
}

export async function resolveYouTubeVideo(
  url: string,
  options?: { signal?: AbortSignal; apiBaseUrl?: string }
): Promise<ResolveYouTubeResult> {
  const baseUrl = options?.apiBaseUrl !== undefined
    ? options.apiBaseUrl
    : (import.meta.env.VITE_API_URL || '');

  try {
    const response = await fetch(`${baseUrl}/api/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ url }),
      signal: options?.signal
    });

    const json = await response.json().catch(() => null);

    if (!response.ok || !json || !json.ok) {
      const code = json?.error?.code || (response.status === 429 ? 'RATE_LIMITED' : 'PROVIDER_ERROR');
      const message = mapYouTubeBackendError(code, json?.error?.message);
      const retryAfterSeconds = json?.error?.retryAfterSeconds;

      return {
        ok: false,
        error: {
          code,
          message,
          retryAfterSeconds
        }
      };
    }

    // Success response parsing
    const contentId = json.contentId || json.shortcode || '';
    const canonicalUrl = json.canonicalUrl || `https://www.youtube.com/watch?v=${contentId}`;

    const rawThumbnails: any[] = json.preview?.thumbnails || json.thumbnails || [];
    const thumbnails = rawThumbnails.map((t) => ({
      resolution: t.resolution || 'default',
      url: t.url,
      width: t.width,
      height: t.height,
      verified: t.verified === true
    }));

    // If no thumbnails were nested in preview, check media items
    if (thumbnails.length === 0 && Array.isArray(json.media)) {
      json.media.forEach((m: any) => {
        if (m.thumbnailUrl || m.url) {
          thumbnails.push({
            resolution: m.filename?.replace(/^youtube_[^_]+_|\.jpg$/g, '') || 'hqdefault',
            url: m.thumbnailUrl || m.url,
            width: m.width,
            height: m.height,
            verified: false
          });
        }
      });
    }

    const metadataExpiresAt = json.metadataExpiresAt || json.preview?.metadataExpiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const metadataFetchedAt = json.metadataFetchedAt || json.preview?.metadataFetchedAt || new Date().toISOString();

    const resolvedData: YouTubeResolvedData = {
      videoId: contentId,
      canonicalUrl,
      title: json.title || json.preview?.title || 'YouTube Video',
      author: json.author || json.preview?.authorName || 'Unknown Creator',
      authorUrl: json.authorUrl || json.preview?.authorUrl,
      description: json.description || json.preview?.description,
      durationSeconds: json.durationSeconds ?? json.preview?.durationSeconds,
      durationFormatted: json.durationFormatted || json.preview?.durationFormatted,
      publishedAt: json.publishedAt || json.preview?.publishedAt,
      embedUrl: json.embedUrl || json.preview?.embedUrl,
      isEmbeddable: json.isEmbeddable ?? json.preview?.isEmbeddable,
      embeddingAllowed: json.embeddingAllowed ?? json.preview?.embeddingAllowed,
      embedStatus: json.embedStatus || json.preview?.embedStatus || 'unknown',
      metadataCapability: json.metadataCapability || json.preview?.metadataCapability || 'BASIC_METADATA',
      metadataFetchedAt,
      metadataExpiresAt,
      thumbnails,
      isExpired: isYouTubeMetadataExpired(metadataExpiresAt)
    };

    return {
      ok: true,
      data: resolvedData
    };
  } catch (err: unknown) {
    if ((err instanceof DOMException && err.name === 'AbortError') || (err as { name?: string })?.name === 'AbortError') {
      return {
        ok: false,
        error: {
          code: 'CANCELLED',
          message: 'Resolution request was cancelled.'
        }
      };
    }

    return {
      ok: false,
      error: {
        code: 'NETWORK_ERROR',
        message: err instanceof Error ? err.message : 'Network error communicating with YouTube service'
      }
    };
  }
}
