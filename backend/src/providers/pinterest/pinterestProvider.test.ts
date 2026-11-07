import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PinterestMediaProvider } from './provider.js';
import { PinterestOEmbedClient } from './oembedClient.js';
import { PinterestThumbnailService } from './thumbnailService.js';
import { PinterestUrlParser } from './urlParser.js';
import { PinterestEmbedService } from './embedService.js';
import { PinterestMetadataNormalizer } from './normalizer.js';
import { buildServer } from '../../server.js';
import * as ssrfClient from '../../utils/ssrfClient.js';
import { Readable } from 'node:stream';

describe('PinterestMediaProvider Core & Integration Suite', () => {
  const validPinId = '123456789012345678';
  const canonicalUrl = `https://www.pinterest.com/pin/${validPinId}/`;

  let provider: PinterestMediaProvider;
  let mockOEmbedClient: PinterestOEmbedClient;
  let mockThumbnailService: PinterestThumbnailService;
  let mockUrlParser: PinterestUrlParser;

  beforeEach(() => {
    vi.restoreAllMocks();

    mockOEmbedClient = new PinterestOEmbedClient();
    mockThumbnailService = new PinterestThumbnailService();
    mockUrlParser = new PinterestUrlParser();

    provider = new PinterestMediaProvider({
      urlParser: mockUrlParser,
      oembedClient: mockOEmbedClient,
      thumbnailService: mockThumbnailService,
      embedService: new PinterestEmbedService(),
      normalizer: new PinterestMetadataNormalizer()
    });
  });

  describe('Capabilities and Routing', () => {
    it('declares correct provider capabilities enforcing non-circumvention', () => {
      expect(provider.id).toBe('pinterest');
      expect(provider.platformId).toBe('pinterest');
      const caps = provider.getCapabilities();
      expect(caps.supportsPreview).toBe(true);
      expect(caps.supportsMetadata).toBe(true);
      expect(caps.supportsOriginalDownload).toBe(false);
      expect(caps.supportsCarousel).toBe(false);
      expect(caps.downloadDisclaimer).toMatch(/downloads are not supported/);
    });

    it('returns authorized thumbnail download hosts', () => {
      const hosts = provider.getAllowedDownloadHosts();
      expect(hosts).toEqual(['i.pinimg.com']);
    });

    it('determines whether it can resolve URLs', () => {
      expect(provider.canResolve('https://www.pinterest.com/pin/123456789012345678/')).toBe(true);
      expect(provider.canResolve('https://pin.it/abc1234')).toBe(true);
      expect(provider.canResolve('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(false);
      expect(provider.canResolve('https://www.instagram.com/p/Cxyz123/')).toBe(false);
      expect(provider.canResolve('https://www.pinterest.com/pin/123/')).toBe(false); // Invalid ID
    });
  });

  describe('Direct Pin URL Resolution', () => {
    it('successfully resolves a direct Pin URL with oEmbed metadata and thumbnail', async () => {
      vi.spyOn(mockOEmbedClient, 'getPinMetadata').mockResolvedValueOnce({
        title: 'Modern Architecture',
        author_name: 'StudioOne',
        author_url: 'https://www.pinterest.com/studioone/',
        thumbnail_url: 'https://i.pinimg.com/236x/ab/cd/ef/thumb.jpg',
        thumbnail_width: 236,
        thumbnail_height: 354
      });

      vi.spyOn(mockThumbnailService, 'buildThumbnailItems').mockResolvedValueOnce([
        {
          resolution: '236x',
          url: 'https://i.pinimg.com/236x/ab/cd/ef/thumb.jpg',
          width: 236,
          height: 354,
          verified: true
        }
      ]);

      const res = await provider.resolve(canonicalUrl, validPinId);
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      expect(res.status).toBe('live_metadata_retrieved');
      expect(res.provider).toBe('pinterest');
      expect(res.platform).toBe('pinterest');
      expect(res.shortcode).toBe(validPinId);
      expect(res.contentId).toBe(validPinId);
      expect(res.title).toBe('Modern Architecture');
      expect(res.author).toBe('StudioOne');

      // Top-level embedding status assertions
      expect(res.embedStatus).toBe('unknown');
      expect(res.isEmbeddable).toBeUndefined();
      expect(res.embeddingAllowed).toBeUndefined();
      expect(res.embedUrl).toBeDefined();

      // Nested preview embedding status assertions
      expect(res.preview?.embedStatus).toBe('unknown');
      expect(res.preview?.isEmbeddable).toBeUndefined();
      expect(res.preview?.embeddingAllowed).toBeUndefined();
      expect(res.preview?.embedUrl).toBe(res.embedUrl);

      expect(res.downloadAvailable).toBe(false);
      expect(res.media).toHaveLength(1);
      expect(res.media![0].downloadable).toBe(false);
    });
  });

  describe('pin.it Shortlink Resolution', () => {
    it('safely resolves a pin.it shortlink through SSRF-validated traversal', async () => {
      vi.spyOn(mockUrlParser, 'resolveShortLink').mockResolvedValueOnce({
        pinId: validPinId,
        canonicalUrl
      });

      vi.spyOn(mockOEmbedClient, 'getPinMetadata').mockResolvedValueOnce({
        title: 'Interior Design Inspiration',
        author_name: 'HomeDecor',
        thumbnail_url: 'https://i.pinimg.com/236x/12/34/56/thumb.jpg'
      });

      vi.spyOn(mockThumbnailService, 'buildThumbnailItems').mockResolvedValueOnce([]);

      const res = await provider.resolve('https://pin.it/abc1234', 'abc1234');
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      expect(res.contentId).toBe(validPinId);
      expect(res.title).toBe('Interior Design Inspiration');
      expect(mockUrlParser.resolveShortLink).toHaveBeenCalledWith('https://pin.it/abc1234', expect.any(Object));
    });
  });

  describe('Error Handling and Security Safeguards', () => {
    it('returns invalid_url for unparseable or malformed Pin URLs', async () => {
      const res = await provider.resolve('https://www.pinterest.com/pin/bad/', 'bad');
      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.status).toBe('invalid_url');
      expect(res.error.code).toBe('INVALID_PIN_ID');
    });

    it('returns invalid_url when Pin is not found (404)', async () => {
      const notFoundErr: any = new Error('Pin not found');
      notFoundErr.code = 'PIN_NOT_FOUND';
      notFoundErr.statusCode = 404;
      vi.spyOn(mockOEmbedClient, 'getPinMetadata').mockRejectedValueOnce(notFoundErr);

      const res = await provider.resolve(canonicalUrl, validPinId);
      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.status).toBe('invalid_url');
      expect(res.error.code).toBe('PIN_NOT_FOUND');
    });

    it('returns rate_limited with retrySeconds when rate limited (429)', async () => {
      const rateErr: any = new Error('Rate limit exceeded');
      rateErr.code = 'PINTEREST_RATE_LIMITED';
      rateErr.statusCode = 429;
      rateErr.retryAfterSeconds = 90;
      vi.spyOn(mockOEmbedClient, 'getPinMetadata').mockRejectedValueOnce(rateErr);

      const res = await provider.resolve(canonicalUrl, validPinId);
      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.status).toBe('rate_limited');
      expect(res.error.code).toBe('PINTEREST_RATE_LIMITED');
      expect(res.error.retryAfterSeconds).toBe(90);
    });

    it('returns configuration_required when oEmbed is disabled via config', async () => {
      const disabledErr: any = new Error('oEmbed disabled');
      disabledErr.code = 'PINTEREST_OEMBED_DISABLED';
      vi.spyOn(mockOEmbedClient, 'getPinMetadata').mockRejectedValueOnce(disabledErr);

      const res = await provider.resolve(canonicalUrl, validPinId);
      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.status).toBe('configuration_required');
      expect(res.error.code).toBe('PINTEREST_OEMBED_DISABLED');
    });

    it('rejects SSRF shortlink attempts safely', async () => {
      const ssrfErr: any = new Error('Destination blocked');
      ssrfErr.code = 'SSRF_BLOCKED';
      vi.spyOn(mockUrlParser, 'resolveShortLink').mockRejectedValueOnce(ssrfErr);

      const res = await provider.resolve('https://pin.it/evil', 'evil');
      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.status).toBe('invalid_url');
      expect(res.error.code).toBe('SSRF_DETECTED');
    });
  });

  describe('Resolve Route Integration (POST /api/resolve)', () => {
    it('resolves a Pinterest URL through POST /api/resolve and selects Pinterest provider', async () => {
      const fastify = await buildServer({ enableRateLimit: false });
      await fastify.ready();

      try {
        // Mock safeHttpsRequest for oEmbed call
        const mockPayload = {
          title: 'Architectural Blueprint',
          author_name: 'StudioPro',
          thumbnail_url: 'https://i.pinimg.com/236x/99/88/77/blueprint.jpg'
        };

        const mockStream = new Readable({
          read() {
            this.push(JSON.stringify(mockPayload));
            this.push(null);
          }
        });

        vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValueOnce({
          statusCode: 200,
          headers: { 'content-type': 'application/json' },
          stream: mockStream as any,
          finalUrl: 'https://www.pinterest.com/oembed.json'
        });

        const response = await fastify.inject({
          method: 'POST',
          url: '/api/resolve',
          payload: {
            url: 'https://www.pinterest.com/pin/123456789012345678/'
          }
        });

        expect(response.statusCode).toBe(200);
        const json = JSON.parse(response.body);
        expect(json.ok).toBe(true);
        expect(json.provider).toBe('pinterest');
        expect(json.platform).toBe('pinterest');
        expect(json.shortcode).toBe('123456789012345678');
        expect(json.title).toBe('Architectural Blueprint');
        expect(json.embedStatus).toBe('unknown');
        expect(json.isEmbeddable).toBeUndefined();
        expect(json.embeddingAllowed).toBeUndefined();
        expect(json.embedUrl).toBeDefined();
        expect(json.preview?.embedStatus).toBe('unknown');
        expect(json.downloadAvailable).toBe(false);
      } finally {
        await fastify.close();
      }
    });
  });
});
