import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PinterestOEmbedClient,
  PINTEREST_OEMBED_ENDPOINT
} from './oembedClient.js';
import * as ssrfClient from '../../utils/ssrfClient.js';
import { Readable } from 'node:stream';

describe('PinterestOEmbedClient Suite', () => {
  const client = new PinterestOEmbedClient();
  const validCanonicalUrl = 'https://www.pinterest.com/pin/123456789012345678/';
  const validPinId = '123456789012345678';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('successfully retrieves and parses official oEmbed metadata', async () => {
    const mockPayload = {
      version: '1.0',
      type: 'rich',
      provider_name: 'Pinterest',
      provider_url: 'https://www.pinterest.com',
      title: 'Modern Architectural Villa',
      author_name: 'DesignStudio',
      author_url: 'https://www.pinterest.com/designstudio/',
      html: `<iframe src="https://assets.pinterest.com/ext/embed.html?id=${validPinId}&src=oembed"></iframe>`,
      thumbnail_url: 'https://i.pinimg.com/236x/ab/cd/ef/abcdef.jpg',
      thumbnail_width: 236,
      thumbnail_height: 354
    };

    const mockStream = new Readable({
      read() {
        this.push(JSON.stringify(mockPayload));
        this.push(null);
      }
    });

    vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValueOnce({
      statusCode: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
      stream: mockStream as any,
      finalUrl: `${PINTEREST_OEMBED_ENDPOINT}?url=${encodeURIComponent(validCanonicalUrl)}`
    });

    const res = await client.getPinMetadata(validCanonicalUrl, validPinId);
    expect(res.title).toBe('Modern Architectural Villa');
    expect(res.author_name).toBe('DesignStudio');
    expect(res.thumbnail_url).toBe('https://i.pinimg.com/236x/ab/cd/ef/abcdef.jpg');
    expect(ssrfClient.safeHttpsRequest).toHaveBeenCalledWith(
      expect.stringContaining('oembed.json?url='),
      expect.objectContaining({
        method: 'GET'
      })
    );
  });

  it('throws PINTEREST_OEMBED_DISABLED when provider is disabled via config or options', async () => {
    const disabledClient = new PinterestOEmbedClient({ enabled: false });
    await expect(disabledClient.getPinMetadata(validCanonicalUrl, validPinId)).rejects.toThrow(
      /PINTEREST_OEMBED_DISABLED/
    );

    // Also when overridden via method options
    await expect(client.getPinMetadata(validCanonicalUrl, validPinId, { enabled: false })).rejects.toThrow(
      /PINTEREST_OEMBED_DISABLED/
    );
  });

  it('handles rate limiting (HTTP 429) and parses retryAfter', async () => {
    const mockStream = new Readable({ read() { this.push(null); } });
    vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValueOnce({
      statusCode: 429,
      headers: { 'retry-after': '60' },
      stream: mockStream as any,
      finalUrl: ''
    });

    try {
      await client.getPinMetadata(validCanonicalUrl, validPinId);
      expect.fail('Should have thrown PINTEREST_RATE_LIMITED');
    } catch (err: any) {
      expect(err.code).toBe('PINTEREST_RATE_LIMITED');
      expect(err.retryAfterSeconds).toBe(60);
    }
  });

  it('handles HTTP 404/400 as PIN_NOT_FOUND', async () => {
    const mockStream = new Readable({ read() { this.push(null); } });
    vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValueOnce({
      statusCode: 404,
      headers: {},
      stream: mockStream as any,
      finalUrl: ''
    });

    try {
      await client.getPinMetadata(validCanonicalUrl, validPinId);
      expect.fail('Should have thrown PIN_NOT_FOUND');
    } catch (err: any) {
      expect(err.code).toBe('PIN_NOT_FOUND');
    }
  });

  it('handles 5xx server errors as PINTEREST_UNAVAILABLE', async () => {
    const mockStream = new Readable({ read() { this.push(null); } });
    vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValueOnce({
      statusCode: 503,
      headers: {},
      stream: mockStream as any,
      finalUrl: ''
    });

    try {
      await client.getPinMetadata(validCanonicalUrl, validPinId);
      expect.fail('Should have thrown PINTEREST_UNAVAILABLE');
    } catch (err: any) {
      expect(err.code).toBe('PINTEREST_UNAVAILABLE');
    }
  });

  it('handles network timeouts as PINTEREST_TIMEOUT', async () => {
    const timeoutErr: any = new Error('Socket timeout');
    timeoutErr.code = 'TIMEOUT';
    vi.spyOn(ssrfClient, 'safeHttpsRequest').mockRejectedValueOnce(timeoutErr);

    try {
      await client.getPinMetadata(validCanonicalUrl, validPinId);
      expect.fail('Should have thrown PINTEREST_TIMEOUT');
    } catch (err: any) {
      expect(err.code).toBe('PINTEREST_TIMEOUT');
    }
  });

  it('rejects unexpected Content-Type header with PINTEREST_INVALID_RESPONSE', async () => {
    const mockStream = new Readable({ read() { this.push('<!doctype html><html></html>'); this.push(null); } });
    vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValueOnce({
      statusCode: 200,
      headers: { 'content-type': 'text/html' },
      stream: mockStream as any,
      finalUrl: ''
    });

    try {
      await client.getPinMetadata(validCanonicalUrl, validPinId);
      expect.fail('Should have thrown PINTEREST_INVALID_RESPONSE');
    } catch (err: any) {
      expect(err.code).toBe('PINTEREST_INVALID_RESPONSE');
    }
  });

  it('rejects identity mismatch if returned oEmbed HTML does not match requested Pin ID', async () => {
    const mismatchPayload = {
      version: '1.0',
      title: 'Other Pin',
      html: '<iframe src="https://assets.pinterest.com/ext/embed.html?id=999999999999999999&src=oembed"></iframe>'
    };

    const mockStream = new Readable({
      read() {
        this.push(JSON.stringify(mismatchPayload));
        this.push(null);
      }
    });

    vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValueOnce({
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      stream: mockStream as any,
      finalUrl: ''
    });

    try {
      await client.getPinMetadata(validCanonicalUrl, validPinId);
      expect.fail('Should have thrown PINTEREST_INVALID_RESPONSE for identity mismatch');
    } catch (err: any) {
      expect(err.code).toBe('PINTEREST_INVALID_RESPONSE');
      expect(err.message).toMatch(/does not match requested Pin ID/);
    }
  });
});
