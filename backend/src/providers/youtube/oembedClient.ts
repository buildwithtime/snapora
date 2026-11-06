import { z } from 'zod';
import { safeHttpsRequest } from '../../utils/ssrfClient.js';
import { mapOEmbedError, ClassifiedYouTubeError } from './errorMapper.js';
import { youTubeEmbedService } from './embedService.js';

export const YouTubeOEmbedResponseSchema = z.object({
  title: z.string().default(''),
  author_name: z.string().default(''),
  author_url: z.string().default(''),
  type: z.string().optional(),
  height: z.number().optional(),
  width: z.number().optional(),
  version: z.string().optional(),
  provider_name: z.string().default('YouTube'),
  provider_url: z.string().default('https://www.youtube.com/'),
  thumbnail_height: z.number().optional(),
  thumbnail_width: z.number().optional(),
  thumbnail_url: z.string().optional(),
  html: z.string().optional()
});

export type YouTubeOEmbedPayload = z.infer<typeof YouTubeOEmbedResponseSchema>;

export interface YouTubeOEmbedResult {
  ok: true;
  data: {
    title: string;
    authorName: string;
    authorUrl: string;
    thumbnailUrl?: string;
    thumbnailWidth?: number;
    thumbnailHeight?: number;
    embedUrl: string;
  };
}

export interface YouTubeOEmbedFailure {
  ok: false;
  error: ClassifiedYouTubeError;
}

export class YouTubeOEmbedClient {
  private readonly baseUrl = 'https://www.youtube.com/oembed';

  /**
   * Fetches official public metadata from YouTube's anonymous oEmbed endpoint.
   */
  async fetchMetadata(
    canonicalUrl: string,
    videoId: string,
    signal?: AbortSignal
  ): Promise<YouTubeOEmbedResult | YouTubeOEmbedFailure> {
    const oembedUrl = `${this.baseUrl}?url=${encodeURIComponent(canonicalUrl)}&format=json`;

    try {
      const response = await safeHttpsRequest(oembedUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/json, text/plain, */*',
          'User-Agent': 'Snapora/0.1.0'
        },
        timeoutMs: 8000,
        signal,
        allowedHostsValidator: (hostname) => hostname === 'www.youtube.com' || hostname === 'youtube.com'
      });

      if (response.statusCode !== 200) {
        response.stream.destroy();
        return {
          ok: false,
          error: mapOEmbedError(null, response.statusCode, response.headers as any)
        };
      }

      // Stream body into buffer
      const stream = response.stream;
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        stream.on('data', (c) => chunks.push(c));
        stream.on('end', () => resolve());
        stream.on('error', (err) => reject(err));
      });

      const bodyText = Buffer.concat(chunks).toString('utf-8');
      let rawJson: unknown;
      try {
        rawJson = JSON.parse(bodyText);
      } catch (jsonErr) {
        return {
          ok: false,
          error: {
            code: 'INVALID_RESPONSE',
            message: 'YouTube oEmbed returned invalid JSON payload'
          }
        };
      }

      const parseResult = YouTubeOEmbedResponseSchema.safeParse(rawJson);
      if (!parseResult.success) {
        return {
          ok: false,
          error: mapOEmbedError(parseResult.error)
        };
      }

      const data = parseResult.data;
      const embedUrl = youTubeEmbedService.generateEmbedUrl(videoId);

      return {
        ok: true,
        data: {
          title: data.title,
          authorName: data.author_name,
          authorUrl: data.author_url,
          thumbnailUrl: data.thumbnail_url,
          thumbnailWidth: data.thumbnail_width,
          thumbnailHeight: data.thumbnail_height,
          embedUrl
        }
      };
    } catch (err: any) {
      return {
        ok: false,
        error: mapOEmbedError(err)
      };
    }
  }
}

export const youTubeOEmbedClient = new YouTubeOEmbedClient();
