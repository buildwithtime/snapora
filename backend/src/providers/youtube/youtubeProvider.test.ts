import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { Readable } from 'node:stream';
import { FastifyInstance } from 'fastify';
import { buildServer } from '../../server.js';
import * as ssrfClient from '../../utils/ssrfClient.js';
import { YouTubeMediaProvider } from './provider.js';
import { YouTubeOEmbedClient } from './oembedClient.js';
import { YouTubeDataApiClient } from './dataApiClient.js';
import { YouTubeThumbnailService } from './thumbnailService.js';
import { YouTubeMetadataNormalizer } from './normalizer.js';

describe('YouTubeMediaProvider Core & Integration Suite', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer({ enableRateLimit: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Capabilities & Host Declarations', () => {
    const provider = new YouTubeMediaProvider();

    it('declares capability contract accurately with strict non-circumvention', () => {
      const caps = provider.getCapabilities();
      expect(caps.supportsPreview).toBe(true);
      expect(caps.supportsMetadata).toBe(true);
      expect(caps.supportsOriginalDownload).toBe(false); // Zero stream ripping
      expect(caps.supportsCarousel).toBe(false);
      expect(caps.requiresAuthentication).toBe(false);
      expect(caps.requiresConfiguration).toBe(false);
      expect(caps.downloadDisclaimer).toContain('YouTube video downloads are not supported');
    });

    it('declares approved thumbnail CDN hosts exclusively as download hosts', () => {
      const hosts = provider.getAllowedDownloadHosts();
      expect(hosts).toContain('i.ytimg.com');
      expect(hosts).toContain('img.youtube.com');
      expect(hosts).not.toContain('youtube.com');
      expect(hosts).not.toContain('www.youtube.com');
    });

    it('evaluates canResolve accurately across valid and invalid inputs', () => {
      expect(provider.canResolve('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
      expect(provider.canResolve('https://youtu.be/dQw4w9WgXcQ')).toBe(true);
      expect(provider.canResolve('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe(true);
      expect(provider.canResolve('https://www.instagram.com/p/Cxyz123/')).toBe(false);
      expect(provider.canResolve('https://www.youtube.com/playlist?list=123')).toBe(false);
      expect(provider.canResolve('not-a-url')).toBe(false);
    });
  });

  describe('Resolution via YouTube Data API v3 (FULL_METADATA)', () => {
    it('enriches metadata with channel ID, description, duration, and sets 30-day retention', async () => {
      const mockDataApiClient = {
        fetchVideoMetadata: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            videoId: 'dQw4w9WgXcQ',
            title: 'Rick Astley - Never Gonna Give You Up',
            description: 'The official music video for Rick Astley',
            channelTitle: 'Rick Astley',
            channelId: 'UCuAXFkgsw1L7xaCfnd5JJOw',
            publishedAt: '2009-10-25T06:57:33Z',
            durationSeconds: 213,
            durationFormatted: '03:33',
            thumbnails: {
              maxres: { url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg', width: 1280, height: 720 },
              high: { url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg', width: 480, height: 360 }
            },
            embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
            isEmbeddable: true,
            privacyStatus: 'public'
          }
        })
      } as unknown as YouTubeDataApiClient;

      const provider = new YouTubeMediaProvider({
        dataApiClient: mockDataApiClient,
        apiKey: 'test-google-api-key'
      });

      const res = await provider.resolve('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ');

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.platform).toBe('youtube');
        expect(res.title).toBe('Rick Astley - Never Gonna Give You Up');
        expect(res.author).toBe('Rick Astley');
        expect(res.authorUrl).toContain('UCuAXFkgsw1L7xaCfnd5JJOw');
        expect(res.description).toBe('The official music video for Rick Astley');
        expect(res.durationSeconds).toBe(213);
        expect(res.durationFormatted).toBe('03:33');
        expect(res.metadataCapability).toBe('FULL_METADATA');
        expect(res.downloadAvailable).toBe(false);
        expect(res.embedUrl).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');

        // Confirm 30-day retention window
        expect(res.metadataFetchedAt).toBeDefined();
        expect(res.metadataExpiresAt).toBeDefined();
        const diffDays =
          (Date.parse(res.metadataExpiresAt!) - Date.parse(res.metadataFetchedAt!)) / (1000 * 60 * 60 * 24);
        expect(Math.round(diffDays)).toBe(30);

        // Confirm thumbnails mapped to media items
        expect(res.media).toBeDefined();
        expect(res.media!.length).toBeGreaterThan(0);
        expect(res.media![0].downloadable).toBe(false);
      }
    });
  });

  describe('Resolution via Anonymous oEmbed (BASIC_METADATA)', () => {
    it('retrieves basic preview, author, and embed URL without requiring API key', async () => {
      const mockOEmbedClient = {
        fetchMetadata: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            title: 'Me at the zoo',
            authorName: 'jawed',
            authorUrl: 'https://www.youtube.com/@jawed',
            thumbnailUrl: 'https://i.ytimg.com/vi/jNQXAC9IVRw/hqdefault.jpg',
            thumbnailWidth: 480,
            thumbnailHeight: 360,
            embedUrl: 'https://www.youtube-nocookie.com/embed/jNQXAC9IVRw'
          }
        })
      } as unknown as YouTubeOEmbedClient;

      const provider = new YouTubeMediaProvider({
        oEmbedClient: mockOEmbedClient,
        apiKey: undefined // No API key configured
      });

      const res = await provider.resolve('https://youtu.be/jNQXAC9IVRw', 'jNQXAC9IVRw');

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.platform).toBe('youtube');
        expect(res.title).toBe('Me at the zoo');
        expect(res.author).toBe('jawed');
        expect(res.authorUrl).toBe('https://www.youtube.com/@jawed');
        expect(res.metadataCapability).toBe('BASIC_METADATA');
        expect(res.embedUrl).toBe('https://www.youtube-nocookie.com/embed/jNQXAC9IVRw');
        expect(res.downloadAvailable).toBe(false);
        expect(res.metadataExpiresAt).toBeDefined();
      }
    });
  });

  describe('Quota Exhaustion & Fallback Execution', () => {
    it('falls back to anonymous oEmbed when Data API reports quotaExceeded', async () => {
      const mockDataApiClient = {
        fetchVideoMetadata: vi.fn().mockResolvedValue({
          ok: false,
          error: {
            code: 'QUOTA_EXCEEDED',
            message: 'YouTube Data API quota has been exceeded'
          }
        })
      } as unknown as YouTubeDataApiClient;

      const mockOEmbedClient = {
        fetchMetadata: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            title: 'Fallback Video Title',
            authorName: 'Fallback Author',
            authorUrl: 'https://www.youtube.com/@creator',
            thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
            embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'
          }
        })
      } as unknown as YouTubeOEmbedClient;

      const provider = new YouTubeMediaProvider({
        dataApiClient: mockDataApiClient,
        oEmbedClient: mockOEmbedClient,
        apiKey: 'test-google-api-key'
      });

      const res = await provider.resolve('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ');

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.metadataCapability).toBe('BASIC_METADATA');
        expect(res.title).toBe('Fallback Video Title');
      }
    });

    it('does NOT fall back to oEmbed when Data API key is invalid (surfaces config error)', async () => {
      const mockDataApiClient = {
        fetchVideoMetadata: vi.fn().mockResolvedValue({
          ok: false,
          error: {
            code: 'INVALID_API_KEY',
            message: 'The configured YOUTUBE_API_KEY is invalid or expired'
          }
        })
      } as unknown as YouTubeDataApiClient;

      const mockOEmbedClient = {
        fetchMetadata: vi.fn()
      } as unknown as YouTubeOEmbedClient;

      const provider = new YouTubeMediaProvider({
        dataApiClient: mockDataApiClient,
        oEmbedClient: mockOEmbedClient,
        apiKey: 'invalid-api-key'
      });

      const res = await provider.resolve('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ');

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe('INVALID_API_KEY');
      }
      expect(mockOEmbedClient.fetchMetadata).not.toHaveBeenCalled();
    });

    it('does NOT fall back to oEmbed when video is private or deleted', async () => {
      const mockDataApiClient = {
        fetchVideoMetadata: vi.fn().mockResolvedValue({
          ok: false,
          error: {
            code: 'PRIVATE_VIDEO',
            message: 'This YouTube video is private'
          }
        })
      } as unknown as YouTubeDataApiClient;

      const mockOEmbedClient = {
        fetchMetadata: vi.fn()
      } as unknown as YouTubeOEmbedClient;

      const provider = new YouTubeMediaProvider({
        dataApiClient: mockDataApiClient,
        oEmbedClient: mockOEmbedClient,
        apiKey: 'test-key'
      });

      const res = await provider.resolve('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ');

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe('PRIVATE_VIDEO');
      }
      expect(mockOEmbedClient.fetchMetadata).not.toHaveBeenCalled();
    });
  });

  describe('Resolve Route Integration (POST /api/resolve)', () => {
    it('resolves a YouTube URL through POST /api/resolve and selects YouTube provider', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/resolve',
        payload: {
          url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
        }
      });

      // Even if network fails offline, the endpoint recognizes YouTube and routes to YouTubeMediaProvider
      const json = res.json();
      expect(json.provider).toBe('youtube');
    });

    it('rejects unsupported playlist URLs with clear 400 error', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/resolve',
        payload: {
          url: 'https://www.youtube.com/playlist?list=PL1234567890'
        }
      });

      expect(res.statusCode).toBe(400);
      const json = res.json();
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe('UNSUPPORTED_URL');
      expect(json.error.message).toContain('Playlists are not supported');
    });
  });

  describe('Download Security Separation (/api/download)', () => {
    it('rejects YouTube webpage permalinks from the download route', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/download?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ'
      });

      expect(res.statusCode).toBe(400);
      const json = res.json();
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe('UNSUPPORTED_URL');
      expect(json.error.message).toContain('not in the allowed domain list');
    });

    it('permits approved YouTube thumbnail CDN hosts through the download route host validator', async () => {
      const validJpegBytes = Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01
      ]);
      const spy = vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValueOnce({
        statusCode: 200,
        headers: { 'content-type': 'image/jpeg', 'content-length': String(validJpegBytes.length) },
        stream: Readable.from([validJpegBytes]) as any
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/download?url=https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg&expectedType=image'
      });

      expect(res.statusCode).toBe(200);
      expect(spy).toHaveBeenCalled();
      const passedValidator = spy.mock.calls[0][1]?.allowedHostsValidator;
      expect(passedValidator).toBeDefined();
      expect(passedValidator!('i.ytimg.com')).toBe(true);
      expect(passedValidator!('img.youtube.com')).toBe(true);
      expect(passedValidator!('www.youtube.com')).toBe(false);
      expect(passedValidator!('youtube.com')).toBe(false);

      spy.mockRestore();
    });
  });

  describe('Credential Leakage Protection', () => {
    it('guarantees YouTube API key is never exposed in resolve responses', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/resolve',
        payload: {
          url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
        }
      });

      const bodyText = res.body;
      expect(bodyText).not.toContain('AIza');
      expect(bodyText).not.toContain('YOUTUBE_API_KEY');
    });
  });
});
