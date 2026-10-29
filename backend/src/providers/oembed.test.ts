import { describe, it, expect } from 'vitest';
import { InstagramOEmbedProvider } from './oembed.js';

describe('InstagramOEmbedProvider', () => {
  const canonicalUrl = 'https://www.instagram.com/p/Cxyz12345/';
  const shortcode = 'Cxyz12345';

  it('reports PROVIDER_NOT_CONFIGURED when Meta credentials are not supplied', async () => {
    const provider = new InstagramOEmbedProvider({
      appId: undefined,
      clientToken: undefined,
      accessToken: undefined
    });

    const result = await provider.resolve(canonicalUrl, shortcode);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe('preview_unavailable');
      expect(result.error.code).toBe('PROVIDER_NOT_CONFIGURED');
      expect(result.error.message).toContain('INSTAGRAM_APP_ID');
    }
  });

  it('resolves live preview metadata successfully when official API responds with valid payload', async () => {
    const mockPayload = {
      version: '1.0',
      title: 'Scenic mountains in the Alps',
      author_name: 'alpinist_official',
      author_url: 'https://www.instagram.com/alpinist_official',
      provider_name: 'Instagram',
      provider_url: 'https://www.instagram.com',
      type: 'rich',
      width: 658,
      html: '<blockquote class="instagram-media">...</blockquote>',
      thumbnail_url: 'https://scontent.cdninstagram.com/v/sample_thumb.jpg',
      thumbnail_width: 640,
      thumbnail_height: 640
    };

    const mockFetch = async () =>
      new Response(JSON.stringify(mockPayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

    const provider = new InstagramOEmbedProvider({
      appId: '1234567890',
      clientToken: 'abcdef123456',
      fetchFn: mockFetch as unknown as typeof fetch
    });

    const result = await provider.resolve(canonicalUrl, shortcode);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe('live_preview_retrieved');
      expect(result.provider).toBe('InstagramOEmbedProvider');
      expect(result.downloadAvailable).toBe(false); // Explicit: oEmbed does not deliver media files!
      expect(result.media).toHaveLength(0);
      expect(result.author).toBe('alpinist_official');
      expect(result.preview?.html).toContain('instagram-media');
      expect(result.preview?.thumbnailUrl).toContain('sample_thumb.jpg');
      expect(result.disclaimer).toContain('oEmbed preview');
    }
  });

  it('classifies private posts or disabled embeds as CONTENT_PRIVATE', async () => {
    const mockFetch = async () =>
      new Response(
        JSON.stringify({
          error: {
            message: 'This post cannot be embedded because the account is private.',
            code: 100,
            error_subcode: 33
          }
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );

    const provider = new InstagramOEmbedProvider({
      accessToken: 'test_token',
      fetchFn: mockFetch as unknown as typeof fetch
    });

    const result = await provider.resolve(canonicalUrl, shortcode);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe('preview_unavailable');
      expect(result.error.code).toBe('CONTENT_PRIVATE');
      expect(result.error.message).toContain('private');
    }
  });

  it('classifies HTTP 404 as CONTENT_UNAVAILABLE', async () => {
    const mockFetch = async () =>
      new Response('Not Found', {
        status: 404,
        headers: { 'Content-Type': 'text/plain' }
      });

    const provider = new InstagramOEmbedProvider({
      accessToken: 'test_token',
      fetchFn: mockFetch as unknown as typeof fetch
    });

    const result = await provider.resolve(canonicalUrl, shortcode);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe('preview_unavailable');
      expect(result.error.code).toBe('CONTENT_UNAVAILABLE');
    }
  });

  it('classifies rate limit responses as RATE_LIMITED', async () => {
    const mockFetch = async () =>
      new Response(
        JSON.stringify({
          error: {
            message: 'Application request limit reached',
            code: 4
          }
        }),
        {
          status: 429,
          headers: { 'Content-Type': 'application/json' }
        }
      );

    const provider = new InstagramOEmbedProvider({
      accessToken: 'test_token',
      fetchFn: mockFetch as unknown as typeof fetch
    });

    const result = await provider.resolve(canonicalUrl, shortcode);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe('provider_error');
      expect(result.error.code).toBe('RATE_LIMITED');
    }
  });

  it('classifies invalid OAuth tokens as AUTHENTICATION_ERROR', async () => {
    const mockFetch = async () =>
      new Response(
        JSON.stringify({
          error: {
            message: 'Invalid OAuth access token.',
            code: 190
          }
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );

    const provider = new InstagramOEmbedProvider({
      accessToken: 'invalid_token',
      fetchFn: mockFetch as unknown as typeof fetch
    });

    const result = await provider.resolve(canonicalUrl, shortcode);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe('provider_error');
      expect(result.error.code).toBe('AUTHENTICATION_ERROR');
    }
  });

  it('rejects oversized responses to prevent memory exhaustion', async () => {
    const mockFetch = async () =>
      new Response('x'.repeat(2000), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': '2000'
        }
      });

    const provider = new InstagramOEmbedProvider({
      accessToken: 'test_token',
      maxResponseSizeBytes: 500, // lower limit for test
      fetchFn: mockFetch as unknown as typeof fetch
    });

    const result = await provider.resolve(canonicalUrl, shortcode);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('PROVIDER_ERROR');
      expect(result.error.message).toContain('size limit');
    }
  });

  it('classifies timeouts appropriately', async () => {
    const mockFetch = async (_url: string, init?: RequestInit) => {
      return new Promise<Response>((resolve, reject) => {
        const timer = setTimeout(() => resolve(new Response('{}')), 150);
        if (init?.signal) {
          init.signal.addEventListener('abort', () => {
            clearTimeout(timer);
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }
      });
    };

    const provider = new InstagramOEmbedProvider({
      accessToken: 'test_token',
      timeoutMs: 30, // 30ms timeout
      fetchFn: mockFetch as unknown as typeof fetch
    });

    const result = await provider.resolve(canonicalUrl, shortcode);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('TIMEOUT');
    }
  });
});
