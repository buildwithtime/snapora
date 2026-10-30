import { describe, it, expect, vi, beforeEach } from 'vitest';
import { safeFetchJson, mapHttpStatusToError } from './apiClient.js';

describe('safeFetchJson API Client Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('parses valid JSON successfully', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ ok: true, shortcode: 'ABC' }))
    });

    const result = await safeFetchJson<{ ok: boolean; shortcode: string }>('/api/test');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.shortcode).toBe('ABC');
      expect(result.status).toBe(200);
    }
  });

  it('handles empty response on ok status as MALFORMED_RESPONSE without throwing', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('   ')
    });

    const result = await safeFetchJson('/api/test');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('MALFORMED_RESPONSE');
      expect(result.error.message).toBe('We received an incomplete response. Please try again.');
    }
  });

  it('handles empty response on 502 Bad Gateway correctly without throwing Unexpected end of JSON', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      text: () => Promise.resolve('')
    });

    const result = await safeFetchJson('/api/test');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('SERVER_UNAVAILABLE');
      expect(result.error.message).toBe('The upstream media service is temporarily unavailable. Please try again.');
    }
  });

  it('handles truncated or malformed JSON gracefully', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('{"ok": true, "shortcode": ')
    });

    const result = await safeFetchJson('/api/test');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('MALFORMED_RESPONSE');
      expect(result.error.message).toBe('We received an incomplete response. Please try again.');
    }
  });

  it('handles HTML error pages from reverse proxies (e.g. 504 Gateway Timeout)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 504,
      text: () => Promise.resolve('<html><head><title>504 Gateway Timeout</title></head><body>504</body></html>')
    });

    const result = await safeFetchJson('/api/test');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('TIMEOUT');
      expect(result.error.message).toBe('The request took too long. Please try again.');
    }
  });

  it('extracts structured error responses returned by the backend', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            ok: false,
            error: {
              code: 'PRIVATE_ACCOUNT',
              message: 'This account is private'
            }
          })
        )
    });

    const result = await safeFetchJson('/api/test');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('PRIVATE_ACCOUNT');
      expect(result.error.message).toBe('This account is private');
    }
  });

  it('handles rate limiting (429) correctly', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve('Rate limit exceeded')
    });

    const result = await safeFetchJson('/api/test');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('RATE_LIMITED');
      expect(result.error.message).toBe('Instagram is temporarily limiting requests. Please try again later.');
    }
  });

  it('re-throws AbortError for user cancellation', async () => {
    const abortError = new DOMException('The user aborted a request.', 'AbortError');
    global.fetch = vi.fn().mockRejectedValue(abortError);

    await expect(safeFetchJson('/api/test')).rejects.toThrow('The user aborted a request.');
  });

  it('handles network connection failure safely as NETWORK_ERROR', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    const result = await safeFetchJson('/api/test');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NETWORK_ERROR');
      expect(result.error.message).toBe('Connection interrupted. Please check your connection and retry.');
    }
  });

  it('handles HTTP 204 No Content cleanly as a valid empty response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      text: () => Promise.resolve('')
    });

    const result = await safeFetchJson<void>('/api/test');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe(204);
      expect(result.data).toBeUndefined();
    }
  });

  it('preserves Fastify default error response structure', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            statusCode: 400,
            error: 'Bad Request',
            message: 'body/url must match format uri'
          })
        )
    });

    const result = await safeFetchJson('/api/test');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('Bad Request');
      expect(result.error.message).toBe('body/url must match format uri');
    }
  });

  it('re-throws standard Error with name AbortError cleanly', async () => {
    const error = new Error('Request was aborted');
    error.name = 'AbortError';
    global.fetch = vi.fn().mockRejectedValue(error);

    await expect(safeFetchJson('/api/test')).rejects.toThrow('Request was aborted');
  });
});

describe('mapHttpStatusToError helper', () => {
  it('maps various HTTP statuses to descriptive errors', () => {
    expect(mapHttpStatusToError(429).code).toBe('RATE_LIMITED');
    expect(mapHttpStatusToError(504).code).toBe('TIMEOUT');
    expect(mapHttpStatusToError(403).code).toBe('PRIVATE_ACCOUNT');
    expect(mapHttpStatusToError(404).code).toBe('POST_NOT_FOUND');
    expect(mapHttpStatusToError(502).code).toBe('SERVER_UNAVAILABLE');
    expect(mapHttpStatusToError(500).code).toBe('MALFORMED_RESPONSE');
  });
});

