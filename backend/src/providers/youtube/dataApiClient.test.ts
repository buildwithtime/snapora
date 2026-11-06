import { describe, it, expect, vi } from 'vitest';
import { Readable } from 'node:stream';
import {
  YouTubeDataApiClient,
  parseIsoDuration,
  DEFAULT_MAX_DATA_API_RESPONSE_SIZE
} from './dataApiClient.js';
import * as ssrfClient from '../../utils/ssrfClient.js';

describe('YouTubeDataApiClient Suite', () => {
  const client = new YouTubeDataApiClient();
  const testApiKey = 'AIzaSyTestKeyForTestingPurposes12345';

  describe('parseIsoDuration', () => {
    it('parses standard ISO 8601 durations correctly', () => {
      expect(parseIsoDuration('PT1H2M3S')).toEqual({
        durationSeconds: 3723,
        durationFormatted: '1:02:03'
      });
      expect(parseIsoDuration('PT4M13S')).toEqual({
        durationSeconds: 253,
        durationFormatted: '04:13'
      });
      expect(parseIsoDuration('PT45S')).toEqual({
        durationSeconds: 45,
        durationFormatted: '00:45'
      });
      expect(parseIsoDuration('P1DT2H3M4S')).toEqual({
        durationSeconds: 93784,
        durationFormatted: '26:03:04'
      });
    });

    it('handles empty, null, or malformed strings gracefully', () => {
      expect(parseIsoDuration('')).toEqual({ durationSeconds: 0, durationFormatted: '00:00' });
      expect(parseIsoDuration(undefined)).toEqual({ durationSeconds: 0, durationFormatted: '00:00' });
      expect(parseIsoDuration('invalid-format')).toEqual({ durationSeconds: 0, durationFormatted: '00:00' });
    });
  });

  describe('Embedding-Disabled Video Handling', () => {
    it('handles embeddable: true — exposes embedUrl and explicit allowed status', async () => {
      const mockPayload = {
        items: [
          {
            snippet: {
              title: 'Embeddable Video',
              description: 'This video can be embedded',
              channelTitle: 'Test Channel',
              channelId: 'UC123456',
              publishedAt: '2026-01-01T00:00:00Z',
              thumbnails: {}
            },
            contentDetails: { duration: 'PT2M30S' },
            status: { privacyStatus: 'public', embeddable: true }
          }
        ]
      };

      const spy = vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValueOnce({
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        stream: Readable.from([Buffer.from(JSON.stringify(mockPayload))]) as any
      });

      const result = await client.fetchVideoMetadata('dQw4w9WgXcQ', testApiKey);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.isEmbeddable).toBe(true);
        expect(result.data.embeddingAllowed).toBe(true);
        expect(result.data.embedStatus).toBe('allowed');
        expect(result.data.embedUrl).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
        expect(result.data.title).toBe('Embeddable Video');
      }

      spy.mockRestore();
    });

    it('handles embeddable: false — preserves metadata, omits embedUrl, and reports disabled status', async () => {
      const mockPayload = {
        items: [
          {
            snippet: {
              title: 'Embedding-Disabled Video',
              description: 'Creator turned off embedding',
              channelTitle: 'Restricted Channel',
              channelId: 'UC999999',
              publishedAt: '2026-02-01T00:00:00Z',
              thumbnails: {}
            },
            contentDetails: { duration: 'PT5M00S' },
            status: { privacyStatus: 'public', embeddable: false }
          }
        ]
      };

      const spy = vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValueOnce({
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        stream: Readable.from([Buffer.from(JSON.stringify(mockPayload))]) as any
      });

      const result = await client.fetchVideoMetadata('dQw4w9WgXcQ', testApiKey);
      expect(result.ok).toBe(true);
      if (result.ok) {
        // Metadata MUST be preserved
        expect(result.data.title).toBe('Embedding-Disabled Video');
        expect(result.data.channelTitle).toBe('Restricted Channel');
        expect(result.data.durationSeconds).toBe(300);
        // Embedding MUST be disabled and active embedUrl omitted
        expect(result.data.isEmbeddable).toBe(false);
        expect(result.data.embeddingAllowed).toBe(false);
        expect(result.data.embedStatus).toBe('disabled');
        expect(result.data.embedUrl).toBeUndefined();
      }

      spy.mockRestore();
    });

    it('handles missing embeddable status — defaults safely with unknown status', async () => {
      const mockPayload = {
        items: [
          {
            snippet: {
              title: 'Missing Embeddable Status Video',
              description: 'status object without embeddable property',
              channelTitle: 'Channel',
              channelId: 'UC888',
              publishedAt: '2026-03-01T00:00:00Z',
              thumbnails: {}
            },
            contentDetails: { duration: 'PT1M00S' },
            status: { privacyStatus: 'public' } // embeddable omitted
          }
        ]
      };

      const spy = vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValueOnce({
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        stream: Readable.from([Buffer.from(JSON.stringify(mockPayload))]) as any
      });

      const result = await client.fetchVideoMetadata('dQw4w9WgXcQ', testApiKey);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.isEmbeddable).toBeUndefined();
        expect(result.data.embeddingAllowed).toBeUndefined();
        expect(result.data.embedStatus).toBe('unknown');
        expect(result.data.embedUrl).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
      }

      spy.mockRestore();
    });
  });

  describe('Response Size Limits & Streaming Protection', () => {
    it('aborts upfront when Content-Length exceeds max response size', async () => {
      const smallClient = new YouTubeDataApiClient({ maxResponseSizeBytes: 1024 }); // 1KB limit
      const destroySpy = vi.fn();

      const spy = vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValueOnce({
        statusCode: 200,
        headers: { 'content-type': 'application/json', 'content-length': '5000' }, // 5KB > 1KB
        stream: {
          destroy: destroySpy,
          on: vi.fn(),
          removeListener: vi.fn()
        } as any
      });

      const result = await smallClient.fetchVideoMetadata('dQw4w9WgXcQ', testApiKey);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('FILE_TOO_LARGE');
        expect(result.error.message).toContain('exceeds maximum limit');
      }
      expect(destroySpy).toHaveBeenCalled();

      spy.mockRestore();
    });

    it('aborts stream when streaming bytes exceed max response size (misleading or missing Content-Length)', async () => {
      const smallClient = new YouTubeDataApiClient({ maxResponseSizeBytes: 500 });
      // Generate chunks totaling 1500 bytes (> 500 bytes)
      const bigChunk1 = Buffer.alloc(300, 'a');
      const bigChunk2 = Buffer.alloc(300, 'b');
      const bigChunk3 = Buffer.alloc(300, 'c');

      const stream = Readable.from([bigChunk1, bigChunk2, bigChunk3]);

      const spy = vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValueOnce({
        statusCode: 200,
        headers: { 'content-type': 'application/json' }, // missing Content-Length (chunked)
        stream: stream as any
      });

      const result = await smallClient.fetchVideoMetadata('dQw4w9WgXcQ', testApiKey);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('FILE_TOO_LARGE');
        expect(result.error.message).toContain('exceeded maximum allowable size');
      }

      spy.mockRestore();
    });

    it('processes normal responses within size limits successfully', async () => {
      const mockPayload = {
        items: [
          {
            snippet: { title: 'Normal Video', channelTitle: 'C', publishedAt: '2026-01-01T00:00:00Z', thumbnails: {} },
            contentDetails: { duration: 'PT10S' },
            status: { privacyStatus: 'public', embeddable: true }
          }
        ]
      };
      const jsonBuffer = Buffer.from(JSON.stringify(mockPayload));

      const spy = vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValueOnce({
        statusCode: 200,
        headers: { 'content-type': 'application/json', 'content-length': String(jsonBuffer.length) },
        stream: Readable.from([jsonBuffer]) as any
      });

      const result = await client.fetchVideoMetadata('dQw4w9WgXcQ', testApiKey);
      expect(result.ok).toBe(true);

      spy.mockRestore();
    });
  });
});
