import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildServer } from '../server.js';
import { Readable } from 'node:stream';
import * as ssrfClient from '../utils/ssrfClient.js';

describe('Media Download Route — Security & Stream Validation', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer({ enableRateLimit: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects download request with missing URL', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/download'
    });
    expect(res.statusCode).toBe(400);
    const json = res.json();
    expect(json.ok).toBe(false);
  });

  it('blocks private or loopback IP download destinations (SSRF defense)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/download?url=https://127.0.0.1/test.jpg'
    });
    expect(res.statusCode).toBe(400);
    const json = res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('SSRF_BLOCKED');
  });

  it('blocks cloud metadata endpoint downloads (SSRF defense)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/download?url=https://169.254.169.254/latest/meta-data/'
    });
    expect(res.statusCode).toBe(400);
    const json = res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('SSRF_BLOCKED');
  });

  it('blocks unencrypted HTTP download URLs', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/download?url=http://scontent-iad3-1.cdninstagram.com/photo.jpg'
    });
    expect(res.statusCode).toBe(400);
    const json = res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('SSRF_BLOCKED');
  });

  it('blocks downloads from unapproved external domains', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/download?url=https://attacker.example.com/malware.exe'
    });
    expect(res.statusCode).toBe(400);
    const json = res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('UNSUPPORTED_URL');
  });

  it('blocks downloads with non-standard ports', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/download?url=https://scontent-iad3-1.cdninstagram.com:8443/photo.jpg'
    });
    expect(res.statusCode).toBe(400);
    const json = res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('UNSUPPORTED_URL');
  });

  it('sets Cache-Control: no-store, no-cache, must-revalidate and Pragma: no-cache on /api/download error responses', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/download'
    });
    expect(res.statusCode).toBe(400);
    expect(res.headers['cache-control']).toBe('no-store, no-cache, must-revalidate');
    expect(res.headers['pragma']).toBe('no-cache');
  });

  it('handles upstream HTTP 429 on download with Retry-After header and formatted message', async () => {
    vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValueOnce({
      statusCode: 429,
      headers: { 'retry-after': '30' },
      stream: Readable.from([]) as any,
      finalUrl: 'https://scontent-iad3-1.cdninstagram.com/photo.jpg'
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/download?url=https://scontent-iad3-1.cdninstagram.com/photo.jpg'
    });

    expect(res.statusCode).toBe(429);
    expect(res.headers['cache-control']).toBe('no-store, no-cache, must-revalidate');
    expect(res.headers['pragma']).toBe('no-cache');
    expect(res.headers['retry-after']).toBe('30');

    const json = res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('RATE_LIMITED');
    expect(json.error.message).toBe('Instagram is temporarily limiting requests. Please try again in 30 seconds.');
    expect(json.error.retryAfterSeconds).toBe(30);
  });

  it('sets Cache-Control and Pragma headers on raw streaming download response without interfering with stream', async () => {
    // Valid JPEG header bytes: FF D8 FF E0 00 10 4A 46 49 46 00 01
    const jpegBytes = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01
    ]);

    vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValueOnce({
      statusCode: 200,
      headers: { 'content-type': 'image/jpeg', 'content-length': String(jpegBytes.length) },
      stream: Readable.from([jpegBytes]) as any,
      finalUrl: 'https://scontent-iad3-1.cdninstagram.com/photo.jpg'
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/download?url=https://scontent-iad3-1.cdninstagram.com/photo.jpg&filename=test.jpg'
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store, no-cache, must-revalidate');
    expect(res.headers['pragma']).toBe('no-cache');
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(res.headers['content-disposition']).toContain('attachment; filename="test.jpg"');
    expect(res.rawPayload.length).toBe(jpegBytes.length);
  });
});
