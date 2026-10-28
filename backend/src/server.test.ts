import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildServer } from './server.js';
import { MockProvider } from './providers/mock.js';

describe('Snapora Backend API & Security Suite', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer({
      provider: new MockProvider(),
      enableRateLimit: false
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/health', () => {
    it('returns service health status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/health'
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.ok).toBe(true);
      expect(json.service).toBe('snapora-backend');
    });
  });

  describe('POST /api/resolve — Functional Resolution', () => {
    it('resolves valid Instagram photo post', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/resolve',
        payload: {
          url: 'https://www.instagram.com/p/C8XYZ123/'
        }
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.ok).toBe(true);
      expect(json.shortcode).toBe('C8XYZ123');
      expect(json.media).toHaveLength(1);
      expect(json.media[0].type).toBe('image');
      expect(json.media[0].url).toContain('picsum.photos');
    });

    it('resolves Instagram video reel post', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/resolve',
        payload: {
          url: 'https://www.instagram.com/reel/video_reel_test/'
        }
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.ok).toBe(true);
      expect(json.media[0].type).toBe('video');
      expect(json.media[0].filename).toContain('.mp4');
    });

    it('returns 403 for private account shortcode', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/resolve',
        payload: {
          url: 'https://www.instagram.com/p/private_post_403/'
        }
      });

      expect(response.statusCode).toBe(403);
      const json = response.json();
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe('PRIVATE_ACCOUNT');
    });
  });

  describe('POST /api/resolve — SSRF and Security Hardening', () => {
    it('rejects disallowed external domains', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/resolve',
        payload: {
          url: 'https://attacker.example.com/p/test/'
        }
      });

      expect(response.statusCode).toBe(400);
      const json = response.json();
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe('UNSUPPORTED_URL');
      expect(json.error.message).toContain('not in the allowed domain list');
    });

    it('rejects lookalike suffix domains (e.g. instagram.com.attacker.com)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/resolve',
        payload: {
          url: 'https://instagram.com.attacker.com/p/test/'
        }
      });

      expect(response.statusCode).toBe(400);
      const json = response.json();
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe('UNSUPPORTED_URL');
    });

    it('rejects prefix lookalike domains (e.g. evil-instagram.com)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/resolve',
        payload: {
          url: 'https://evil-instagram.com/p/test/'
        }
      });

      expect(response.statusCode).toBe(400);
      const json = response.json();
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe('UNSUPPORTED_URL');
    });

    it('rejects embedded credentials in URL', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/resolve',
        payload: {
          url: 'https://admin:secret123@www.instagram.com/p/valid_test/'
        }
      });

      expect(response.statusCode).toBe(400);
      const json = response.json();
      expect(json.ok).toBe(false);
      expect(json.error.message).toContain('Embedded authentication credentials are not permitted');
    });

    it('rejects non-standard ports (port scan attempt)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/resolve',
        payload: {
          url: 'https://www.instagram.com:8443/p/valid_test/'
        }
      });

      expect(response.statusCode).toBe(400);
      const json = response.json();
      expect(json.ok).toBe(false);
      expect(json.error.message).toContain('Non-standard ports are prohibited');
    });

    it('blocks unencrypted HTTP URLs', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/resolve',
        payload: {
          url: 'http://www.instagram.com/p/valid_shortcode/'
        }
      });

      expect(response.statusCode).toBe(400);
      const json = response.json();
      expect(json.ok).toBe(false);
      expect(json.error.message).toContain('Only HTTPS URLs are permitted');
    });

    it('blocks private IP addresses and localhost', async () => {
      const targets = [
        'https://127.0.0.1/p/test/',
        'https://169.254.169.254/p/test/',
        'https://10.0.0.1/p/test/',
        'https://localhost/p/test/'
      ];

      for (const target of targets) {
        const response = await app.inject({
          method: 'POST',
          url: '/api/resolve',
          payload: { url: target }
        });

        expect(response.statusCode).toBe(400);
        const json = response.json();
        expect(json.ok).toBe(false);
      }
    });

    it('rejects invalid request body with missing URL', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/resolve',
        payload: {}
      });

      expect(response.statusCode).toBe(400);
      const json = response.json();
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe('INVALID_REQUEST');
    });
  });
});
