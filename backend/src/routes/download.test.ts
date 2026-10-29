import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildServer } from '../server.js';

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
});
