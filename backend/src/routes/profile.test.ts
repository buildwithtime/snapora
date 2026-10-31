import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildServer } from '../server.js';
import { MockProvider } from '../providers/mock.js';

describe('POST /api/profile/discover', () => {
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

  it('discovers media for a valid public profile URL', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/profile/discover',
      payload: {
        url: 'https://www.instagram.com/mock_creator/'
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.ok).toBe(true);
    expect(body.profile).toBeDefined();
    expect(body.profile.username).toBe('mock_creator');
    expect(body.profile.isPrivate).toBe(false);
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBe(12);
    expect(body.pagination.hasMore).toBe(true);
    expect(body.pagination.nextCursor).toBe('cursor_page_2');

    // Headers check
    expect(response.headers['cache-control']).toContain('no-store');
  });

  it('supports passing a raw handle or @username', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/profile/discover',
      payload: {
        url: '@studio_design'
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.ok).toBe(true);
    expect(body.profile.username).toBe('studio_design');
    expect(body.items.length).toBeGreaterThan(0);
  });

  it('supports cursor pagination across multiple pages', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/profile/discover',
      payload: {
        url: 'https://www.instagram.com/mock_creator/',
        cursor: 'cursor_page_2'
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.ok).toBe(true);
    expect(body.items.length).toBe(12);
    expect(body.pagination.hasMore).toBe(false);
  });

  it('returns empty media list for profiles with zero posts', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/profile/discover',
      payload: {
        url: 'https://www.instagram.com/empty_profile/'
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.ok).toBe(true);
    expect(body.items).toHaveLength(0);
    expect(body.pagination.hasMore).toBe(false);
  });

  it('returns 403 when discovering a private account', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/profile/discover',
      payload: {
        url: 'https://www.instagram.com/private_user/'
      }
    });

    expect(response.statusCode).toBe(403);
    const body = response.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('PRIVATE_ACCOUNT');
  });

  it('returns 429 with Retry-After header when rate limited', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/profile/discover',
      payload: {
        url: 'https://www.instagram.com/ratelimit_target/'
      }
    });

    expect(response.statusCode).toBe(429);
    expect(response.headers['retry-after']).toBe('60');
    const body = response.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('RATE_LIMITED');
  });

  it('returns 404 when profile does not exist', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/profile/discover',
      payload: {
        url: 'https://www.instagram.com/notfound_user/'
      }
    });

    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('POST_NOT_FOUND');
  });

  it('rejects an individual media post URL sent to profile discovery endpoint', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/profile/discover',
      payload: {
        url: 'https://www.instagram.com/p/Cxyz123/'
      }
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('INVALID_REQUEST');
  });

  it('rejects malformed username or empty URL', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/profile/discover',
      payload: {
        url: ''
      }
    });

    expect(response.statusCode).toBe(400);
  });

  it('rejects malicious cursor URLs attempting SSRF or parameter injection', async () => {
    const ssrfCursor = await app.inject({
      method: 'POST',
      url: '/api/profile/discover',
      payload: {
        url: 'https://www.instagram.com/mock_creator/',
        cursor: 'http://169.254.169.254/latest/meta-data'
      }
    });

    expect(ssrfCursor.statusCode).toBe(400);
    const body = ssrfCursor.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('INVALID_REQUEST');

    const injectionCursor = await app.inject({
      method: 'POST',
      url: '/api/profile/discover',
      payload: {
        url: 'https://www.instagram.com/mock_creator/',
        cursor: '../../traversal'
      }
    });

    expect(injectionCursor.statusCode).toBe(400);

    // Valid Base64 Meta cursor with padding (= / ==) is accepted by schema validator
    const validMetaCursor = await app.inject({
      method: 'POST',
      url: '/api/profile/discover',
      payload: {
        url: 'https://www.instagram.com/mock_creator/',
        cursor: 'QVFIUk9xTXpFeU16RTFPRFkzTmpFM09EZ3lNREU9PQ=='
      }
    });
    expect(validMetaCursor.statusCode).toBe(200);
  });

  it('rejects reserved top-level Instagram paths in profile discovery', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/profile/discover',
      payload: {
        url: 'https://www.instagram.com/explore/'
      }
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.ok).toBe(false);
  });

  it('enforces server-side ceiling of 500 items and disables hasMore if provider returns over-limit items', async () => {
    // Construct mock provider returning 550 items
    const manyItems = Array.from({ length: 550 }, (_, i) => ({
      id: `item_${i}`,
      shortcode: `code_${i}`,
      type: 'image' as const,
      url: `https://www.instagram.com/p/code_${i}/`,
      thumbnailUrl: `https://cdn.example.com/thumb_${i}.jpg`,
      displayUrl: `https://cdn.example.com/disp_${i}.jpg`
    }));

    const mockProvider = {
      id: 'mock',
      name: 'MockProvider',
      getCapabilities: () => ({
        supportsPreview: true,
        supportsMetadata: true,
        supportsOriginalDownload: true,
        supportsCarousel: true,
        requiresAuthentication: false,
        requiresConfiguration: false,
        supportsProfileDiscovery: true
      }),
      canResolve: () => true,
      resolve: async () => ({ ok: false } as any),
      canDiscoverProfile: () => true,
      discoverProfile: async () => ({
        ok: true,
        provider: 'MockProvider',
        profile: { username: 'test_user', isPrivate: false, isVerified: false, mediaCount: 600 },
        items: manyItems,
        pagination: { hasMore: true, nextCursor: 'next_page' }
      })
    };

    const localApp = await buildServer({ provider: mockProvider as any, enableRateLimit: false });
    const res = await localApp.inject({
      method: 'POST',
      url: '/api/profile/discover',
      payload: {
        url: 'https://www.instagram.com/test_user/'
      }
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.items).toHaveLength(500);
    expect(body.pagination.hasMore).toBe(false);
    await localApp.close();
  });
});

