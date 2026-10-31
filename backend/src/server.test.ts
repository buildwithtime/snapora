import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
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

  describe('GET /health and GET /api/health', () => {
    it('returns service health status on /api/health', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/health'
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.ok).toBe(true);
      expect(json.service).toBe('snapora-backend');
      expect(json.status).toBe('healthy');
    });

    it('returns service health status on /health for cloud load balancers', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health'
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.ok).toBe(true);
      expect(json.service).toBe('snapora-backend');
      expect(json.status).toBe('healthy');
    });

    it('sets standard security response headers on outgoing responses', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health'
      });

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    });

    it('does not apply no-store, no-cache to /health endpoint', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health'
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBeUndefined();
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

    it('sets Cache-Control: no-store, no-cache, must-revalidate and Pragma: no-cache on successful /api/resolve', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/resolve',
        payload: {
          url: 'https://www.instagram.com/p/C8XYZ123/'
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store, no-cache, must-revalidate');
      expect(response.headers['pragma']).toBe('no-cache');
    });

    it('sets Cache-Control and Pragma headers on /api/resolve error responses', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/resolve',
        payload: {
          url: 'https://www.instagram.com/p/private_post_403/'
        }
      });

      expect(response.statusCode).toBe(403);
      expect(response.headers['cache-control']).toBe('no-store, no-cache, must-revalidate');
      expect(response.headers['pragma']).toBe('no-cache');
    });

    it('forwards Retry-After header and returns 429 with formatted message on rate limiting', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/resolve',
        payload: {
          url: 'https://www.instagram.com/p/ratelimit_test/'
        }
      });

      expect(response.statusCode).toBe(429);
      expect(response.headers['cache-control']).toBe('no-store, no-cache, must-revalidate');
      expect(response.headers['pragma']).toBe('no-cache');
      expect(response.headers['retry-after']).toBe('60');

      const json = response.json();
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe('RATE_LIMITED');
      expect(json.error.message).toBe('Instagram is temporarily limiting requests. Please try again in 60 seconds.');
      expect(json.error.retryAfterSeconds).toBe(60);
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

  describe('Production SEO & Metadata Integrity', () => {
    const candidatePublicDirs = [
      path.resolve(process.cwd(), 'frontend/public'),
      path.resolve(process.cwd(), '../frontend/public')
    ];
    const frontendPublic = candidatePublicDirs.find((dir) => fs.existsSync(dir))!;

    const candidateIndexDirs = [
      path.resolve(process.cwd(), 'frontend/index.html'),
      path.resolve(process.cwd(), '../frontend/index.html')
    ];
    const frontendIndex = candidateIndexDirs.find((f) => fs.existsSync(f))!;

    it('validates sitemap.xml contains absolute production homepage URL', () => {
      const sitemapPath = path.resolve(frontendPublic, 'sitemap.xml');
      expect(fs.existsSync(sitemapPath)).toBe(true);

      const content = fs.readFileSync(sitemapPath, 'utf8');
      expect(content).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(content).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
      expect(content).toContain('<loc>https://snapora-1r3i.onrender.com/</loc>');
      expect(content).not.toContain('<loc>/</loc>');
    });

    it('validates robots.txt allows public crawling, disallows /api/, and points to production sitemap', () => {
      const robotsPath = path.resolve(frontendPublic, 'robots.txt');
      expect(fs.existsSync(robotsPath)).toBe(true);

      const content = fs.readFileSync(robotsPath, 'utf8');
      expect(content).toContain('User-agent: *');
      expect(content).toContain('Allow: /');
      expect(content).toContain('Disallow: /api/');
      expect(content).toContain('Sitemap: https://snapora-1r3i.onrender.com/sitemap.xml');
    });

    it('validates canonical URL, Open Graph, Twitter Cards, and JSON-LD in index.html', () => {
      expect(fs.existsSync(frontendIndex)).toBe(true);

      const html = fs.readFileSync(frontendIndex, 'utf8');

      // Canonical URL
      expect(html).toContain('<link rel="canonical" href="https://snapora-1r3i.onrender.com/" />');

      // Open Graph
      expect(html).toContain('<meta property="og:url" content="https://snapora-1r3i.onrender.com/" />');
      expect(html).toContain('<meta property="og:image" content="https://snapora-1r3i.onrender.com/favicon.svg" />');

      // Twitter Cards
      expect(html).toContain('<meta name="twitter:url" content="https://snapora-1r3i.onrender.com/" />');
      expect(html).toContain('<meta name="twitter:image" content="https://snapora-1r3i.onrender.com/favicon.svg" />');

      // Schema.org JSON-LD
      const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
      expect(jsonLdMatch).not.toBeNull();
      const parsedLd = JSON.parse(jsonLdMatch![1]);
      expect(parsedLd['@context']).toBe('https://schema.org');
      expect(parsedLd['@type']).toBe('WebApplication');
      expect(parsedLd.name).toBe('Snapora');
      expect(parsedLd.url).toBe('https://snapora-1r3i.onrender.com/');
    });

    it('serves sitemap.xml and robots.txt via Fastify static file serving when dist exists', async () => {
      const distDirs = [
        path.resolve(process.cwd(), 'frontend/dist'),
        path.resolve(process.cwd(), '../frontend/dist')
      ];
      const distDir = distDirs.find((dir) => fs.existsSync(dir));

      if (distDir) {
        const staticApp = await buildServer({
          provider: new MockProvider(),
          enableRateLimit: false,
          serveStatic: true
        });
        await staticApp.ready();

        const sitemapRes = await staticApp.inject({
          method: 'GET',
          url: '/sitemap.xml'
        });
        expect(sitemapRes.statusCode).toBe(200);
        expect(sitemapRes.body).toContain('<loc>https://snapora-1r3i.onrender.com/</loc>');

        const robotsRes = await staticApp.inject({
          method: 'GET',
          url: '/robots.txt'
        });
        expect(robotsRes.statusCode).toBe(200);
        expect(robotsRes.body).toContain('Sitemap: https://snapora-1r3i.onrender.com/sitemap.xml');

        await staticApp.close();
      }
    });
  });

  describe('CORS Preflight & Origin Access Control Suite', () => {
    let strictProdApp: FastifyInstance;

    beforeAll(async () => {
      strictProdApp = await buildServer({
        provider: new MockProvider(),
        enableRateLimit: false,
        corsOrigin: ['https://snapora-1r3i.onrender.com', 'https://snapora-pr-42.onrender.com']
      });
      await strictProdApp.ready();
    });

    afterAll(async () => {
      await strictProdApp.close();
    });

    it('handles OPTIONS preflight correctly for approved production origin', async () => {
      const response = await strictProdApp.inject({
        method: 'OPTIONS',
        url: '/api/resolve',
        headers: {
          origin: 'https://snapora-1r3i.onrender.com',
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'Content-Type, Authorization'
        }
      });

      expect(response.statusCode).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBe('https://snapora-1r3i.onrender.com');
      expect(response.headers['access-control-allow-credentials']).toBe('true');
      expect(response.headers['access-control-allow-methods']).toContain('POST');
      expect(response.headers['access-control-allow-headers']).toContain('Authorization');
      expect(response.headers['access-control-allow-headers']).toContain('Content-Type');
      expect(response.headers['access-control-max-age']).toBe('86400');
    });

    it('handles OPTIONS preflight correctly for approved preview origin', async () => {
      const response = await strictProdApp.inject({
        method: 'OPTIONS',
        url: '/api/resolve',
        headers: {
          origin: 'https://snapora-pr-42.onrender.com',
          'access-control-request-method': 'POST'
        }
      });

      expect(response.statusCode).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBe('https://snapora-pr-42.onrender.com');
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    it('rejects CORS for unauthorized attacker origin without reflecting origin header', async () => {
      const response = await strictProdApp.inject({
        method: 'OPTIONS',
        url: '/api/resolve',
        headers: {
          origin: 'https://attacker.evil.com',
          'access-control-request-method': 'POST'
        }
      });

      // For unapproved origins, Fastify CORS does not set access-control-allow-origin
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('includes credentials and explicit origin header on actual API requests from approved origin', async () => {
      const response = await strictProdApp.inject({
        method: 'POST',
        url: '/api/resolve',
        headers: {
          origin: 'https://snapora-1r3i.onrender.com'
        },
        payload: {
          url: 'https://www.instagram.com/p/C8XYZ123/'
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBe('https://snapora-1r3i.onrender.com');
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    it('does not grant CORS access to actual API requests from unapproved origin', async () => {
      const response = await strictProdApp.inject({
        method: 'POST',
        url: '/api/resolve',
        headers: {
          origin: 'https://attacker.evil.com'
        },
        payload: {
          url: 'https://www.instagram.com/p/C8XYZ123/'
        }
      });

      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});
