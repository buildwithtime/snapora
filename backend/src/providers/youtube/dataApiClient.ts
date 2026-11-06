import { safeHttpsRequest } from '../../utils/ssrfClient.js';
import { mapDataApiError, ClassifiedYouTubeError, redactApiKey } from './errorMapper.js';
import { youTubeEmbedService } from './embedService.js';

export interface ParsedDuration {
  durationSeconds: number;
  durationFormatted: string;
}

/**
 * Parses an ISO 8601 duration string (e.g. 'PT1H2M3S', 'PT4M13S', 'PT45S')
 * into total seconds and a user-friendly clock format ('HH:MM:SS' or 'MM:SS').
 */
export function parseIsoDuration(isoDuration?: string): ParsedDuration {
  if (!isoDuration || typeof isoDuration !== 'string') {
    return { durationSeconds: 0, durationFormatted: '00:00' };
  }

  const match = isoDuration.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!match) {
    return { durationSeconds: 0, durationFormatted: '00:00' };
  }

  const days = parseInt(match[1] || '0', 10);
  const hours = parseInt(match[2] || '0', 10) + days * 24;
  const minutes = parseInt(match[3] || '0', 10);
  const seconds = parseInt(match[4] || '0', 10);

  const durationSeconds = hours * 3600 + minutes * 60 + seconds;

  const pad = (n: number) => n.toString().padStart(2, '0');
  let durationFormatted = '';
  if (hours > 0) {
    durationFormatted = `${hours}:${pad(minutes)}:${pad(seconds)}`;
  } else {
    durationFormatted = `${pad(minutes)}:${pad(seconds)}`;
  }

  return { durationSeconds, durationFormatted };
}

export interface YouTubeDataApiVideoData {
  videoId: string;
  title: string;
  description: string;
  channelTitle: string;
  channelId: string;
  publishedAt: string;
  durationSeconds: number;
  durationFormatted: string;
  thumbnails: Record<string, { url: string; width: number; height: number }>;
  embedUrl: string;
  isEmbeddable: boolean;
  privacyStatus: string;
}

export interface YouTubeDataApiResult {
  ok: true;
  data: YouTubeDataApiVideoData;
}

export interface YouTubeDataApiFailure {
  ok: false;
  error: ClassifiedYouTubeError;
}

export class YouTubeDataApiClient {
  private readonly endpoint = 'https://www.googleapis.com/youtube/v3/videos';

  /**
   * Fetches enriched metadata from YouTube Data API v3 using server-side API key.
   */
  async fetchVideoMetadata(
    videoId: string,
    apiKey: string,
    signal?: AbortSignal
  ): Promise<YouTubeDataApiResult | YouTubeDataApiFailure> {
    if (!apiKey || !apiKey.trim()) {
      return {
        ok: false,
        error: {
          code: 'INVALID_API_KEY',
          message: 'No YouTube API key provided'
        }
      };
    }

    const cleanKey = apiKey.trim();
    const queryParams = new URLSearchParams({
      id: videoId.trim(),
      part: 'snippet,contentDetails,status',
      key: cleanKey
    });

    const requestUrl = `${this.endpoint}?${queryParams.toString()}`;

    try {
      const response = await safeHttpsRequest(requestUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Snapora/0.1.0'
        },
        timeoutMs: 10000,
        signal,
        allowedHostsValidator: (hostname) => hostname === 'www.googleapis.com'
      });

      // Stream body into buffer
      const stream = response.stream;
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        stream.on('data', (c) => chunks.push(c));
        stream.on('end', () => resolve());
        stream.on('error', (err) => reject(err));
      });

      const bodyText = Buffer.concat(chunks).toString('utf-8');
      let jsonPayload: any;
      try {
        jsonPayload = JSON.parse(bodyText);
      } catch (jsonErr) {
        return {
          ok: false,
          error: {
            code: 'INVALID_RESPONSE',
            message: 'YouTube Data API returned invalid JSON'
          }
        };
      }

      // Check HTTP error statuses or Google API error payloads
      if (response.statusCode >= 400 || jsonPayload.error) {
        return {
          ok: false,
          error: mapDataApiError(jsonPayload, response.statusCode, cleanKey, response.headers as any)
        };
      }

      // Check items array
      const items = jsonPayload.items;
      if (!Array.isArray(items) || items.length === 0) {
        return {
          ok: false,
          error: {
            code: 'VIDEO_NOT_FOUND',
            message: `YouTube video with ID '${videoId}' was not found or has been removed`
          }
        };
      }

      const item = items[0];
      const snippet = item.snippet || {};
      const contentDetails = item.contentDetails || {};
      const status = item.status || {};

      // Check privacy status
      if (status.privacyStatus === 'private') {
        return {
          ok: false,
          error: {
            code: 'PRIVATE_VIDEO',
            message: 'This YouTube video is marked private and cannot be resolved'
          }
        };
      }

      const { durationSeconds, durationFormatted } = parseIsoDuration(contentDetails.duration);
      const embedUrl = youTubeEmbedService.generateEmbedUrl(videoId);

      return {
        ok: true,
        data: {
          videoId,
          title: snippet.title || '',
          description: snippet.description || '',
          channelTitle: snippet.channelTitle || '',
          channelId: snippet.channelId || '',
          publishedAt: snippet.publishedAt || '',
          durationSeconds,
          durationFormatted,
          thumbnails: snippet.thumbnails || {},
          embedUrl,
          isEmbeddable: status.embeddable !== false,
          privacyStatus: status.privacyStatus || 'public'
        }
      };
    } catch (err: any) {
      return {
        ok: false,
        error: mapDataApiError(err, undefined, cleanKey)
      };
    }
  }
}

export const youTubeDataApiClient = new YouTubeDataApiClient();
