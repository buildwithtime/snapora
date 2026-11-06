import { describe, it, expect } from 'vitest';
import {
  UniversalPlatformRegistry,

  IPlatformDetector,
  PlatformDetectResult
} from './platformDetector.js';
import { parseInstagramUrl, parseBatchUrls } from './urlValidator.js';

describe('Universal Platform Detector & Registry (Frontend)', () => {
  const registry = new UniversalPlatformRegistry();

  describe('Built-in Platform Detectors Initialization', () => {
    it('initializes with built-in Instagram and YouTube platform detectors', () => {
      const ig = registry.getDetector('instagram');
      expect(ig).toBeDefined();
      expect(ig?.platformId).toBe('instagram');

      const yt = registry.getDetector('youtube');
      expect(yt).toBeDefined();
      expect(yt?.platformId).toBe('youtube');

      expect(registry.listDetectors()).toHaveLength(2);
    });
  });

  describe('Instagram Detection Verification (Regression Guard)', () => {
    it('detects standard post permalinks', () => {
      const res = registry.detectPlatform('https://www.instagram.com/p/Cxyz123abc/');
      expect(res.matched).toBe(true);
      expect(res.platformId).toBe('instagram');
      expect(res.info?.contentType).toBe('post');
      expect(res.info?.shortcode).toBe('Cxyz123abc');
      expect(res.info?.canonicalUrl).toBe('https://www.instagram.com/p/Cxyz123abc/');
    });

    it('detects Reel permalinks with tracking parameters stripped', () => {
      const res = registry.detectPlatform('https://www.instagram.com/reel/Cxyz999/?igsh=abcdef&utm_source=ig_web');
      expect(res.matched).toBe(true);
      expect(res.platformId).toBe('instagram');
      expect(res.info?.contentType).toBe('reel');
      expect(res.info?.shortcode).toBe('Cxyz999');
      expect(res.info?.canonicalUrl).toBe('https://www.instagram.com/reel/Cxyz999/');
    });

    it('detects direct Meta CDN media URLs', () => {
      const cdnUrl =
        'https://scontent.cdninstagram.com/v/t51.2885-15/12345_n.jpg?_nc_cat=1&ccb=1-7&_nc_sid=123&oh=00_AY_hash&oe=6789ABCD';
      const cdn = registry.detectPlatform(cdnUrl);
      expect(cdn.matched).toBe(true);
      expect(cdn.platformId).toBe('instagram');
      expect(cdn.info?.contentType).toBe('direct_media');
      expect(cdn.info?.directMediaInfo?.extension).toBe('jpg');
      expect(cdn.info?.directMediaInfo?.hasCryptoTokens).toBe(true);
    });
  });

  describe('YouTube Detection Consistency (Parity with Backend)', () => {
    it('detects standard www.youtube.com/watch?v={videoId}', () => {
      const res = registry.detectPlatform('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(res.matched).toBe(true);
      expect(res.platformId).toBe('youtube');
      expect(res.info?.contentType).toBe('video');
      expect(res.info?.contentId).toBe('dQw4w9WgXcQ');
      expect(res.info?.shortcode).toBe('dQw4w9WgXcQ');
      expect(res.info?.canonicalUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    });

    it('detects shortened youtu.be/{videoId} links', () => {
      const res = registry.detectPlatform('https://youtu.be/dQw4w9WgXcQ');
      expect(res.matched).toBe(true);
      expect(res.platformId).toBe('youtube');
      expect(res.info?.contentId).toBe('dQw4w9WgXcQ');
      expect(res.info?.canonicalUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    });

    it('detects YouTube Shorts (/shorts/{videoId})', () => {
      const res = registry.detectPlatform('https://www.youtube.com/shorts/abcdef12345');
      expect(res.matched).toBe(true);
      expect(res.platformId).toBe('youtube');
      expect(res.info?.contentType).toBe('video');
      expect(res.info?.contentId).toBe('abcdef12345');
      expect(res.info?.canonicalUrl).toBe('https://www.youtube.com/watch?v=abcdef12345');
    });

    it('detects YouTube Live (/live/{videoId})', () => {
      const res = registry.detectPlatform('https://www.youtube.com/live/jfKfPfyJRdk');
      expect(res.matched).toBe(true);
      expect(res.platformId).toBe('youtube');
      expect(res.info?.contentId).toBe('jfKfPfyJRdk');
      expect(res.info?.canonicalUrl).toBe('https://www.youtube.com/watch?v=jfKfPfyJRdk');
    });

    it('detects YouTube Embed (/embed/{videoId})', () => {
      const res = registry.detectPlatform('https://www.youtube.com/embed/dQw4w9WgXcQ');
      expect(res.matched).toBe(true);
      expect(res.platformId).toBe('youtube');
      expect(res.info?.contentId).toBe('dQw4w9WgXcQ');
      expect(res.info?.canonicalUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    });

    it('normalizes tracking parameters cleanly to canonical URL', () => {
      const raw = 'https://youtu.be/dQw4w9WgXcQ?si=1234567890abcdef&feature=share&utm_source=twitter';
      const res = registry.detectPlatform(raw);
      expect(res.matched).toBe(true);
      expect(res.info?.canonicalUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(res.info?.originalUrl).toBe(raw);
    });

    it('rejects playlist-only URLs with descriptive message', () => {
      const res = registry.detectPlatform('https://www.youtube.com/playlist?list=PLrEnWoR732-BHrPp_Pm8_VleD68f9n14-');
      expect(res.matched).toBe(true);
      expect(res.platformId).toBe('youtube');
      expect(res.error).toContain('Playlists are not supported');
    });

    it('rejects channel URLs with descriptive message', () => {
      const res = registry.detectPlatform('https://www.youtube.com/@mkbhd');
      expect(res.matched).toBe(true);
      expect(res.error).toContain('Channel URLs are not supported');
    });

    it('rejects invalid 11-char video IDs', () => {
      const res = registry.detectPlatform('https://www.youtube.com/watch?v=short');
      expect(res.matched).toBe(true);
      expect(res.error).toContain('Invalid YouTube video ID');
    });

    it('enforces download host isolation for YouTube', () => {
      expect(registry.isAllowedDownloadHost('youtube.com')).toBe(false);
      expect(registry.isAllowedDownloadHost('www.youtube.com')).toBe(false);
      expect(registry.isAllowedDownloadHost('i.ytimg.com')).toBe(true);
      expect(registry.isAllowedDownloadHost('img.youtube.com')).toBe(true);
    });
  });

  describe('UniversalPlatformRegistry Dynamic Registration & Security', () => {
    it('allows registering additional platform detectors dynamically', () => {
      const mockDetector: IPlatformDetector = {
        platformId: 'pinterest',
        name: 'MockPinterestDetector',
        supportedHostnames: ['pinterest.com'],
        matches(url: URL) {
          return url.hostname.includes('pinterest.com');
        },
        detect(rawUrl: string, parsedUrl: URL): PlatformDetectResult {
          return {
            matched: true,
            platformId: 'pinterest',
            info: {
              platformId: 'pinterest',
              contentType: 'image',
              canonicalUrl: `https://${parsedUrl.hostname}${parsedUrl.pathname}`,
              originalUrl: rawUrl,
              shortcode: 'pin123',
              contentId: 'pin123'
            }
          };
        },
        isAllowedDownloadHost(hostname: string) {
          return hostname === 'i.pinimg.com';
        },
        getAllowedDownloadHosts() {
          return ['i.pinimg.com'];
        }
      };

      registry.registerDetector(mockDetector);
      expect(registry.getDetector('pinterest')).toBeDefined();
      expect(registry.listDetectors()).toHaveLength(3);

      const res = registry.detectPlatform('https://www.pinterest.com/pin/123456789/');
      expect(res.matched).toBe(true);
      expect(res.platformId).toBe('pinterest');

      expect(registry.isAllowedDownloadHost('i.pinimg.com')).toBe(true);
      expect(registry.isAllowedDownloadHost('unapproved.com')).toBe(false);
    });

    it('rejects path traversal, embedded credentials, and unsupported domains', () => {
      expect(registry.detectPlatform('https://www.instagram.com/p/../../etc/passwd').error).toContain('Path traversal');
      expect(registry.detectPlatform('https://admin:secret@instagram.com/p/123/').error).toContain('embedded credentials');
      expect(registry.detectPlatform('https://unsupported-site.org/item/1').error).toContain('not in the allowed domain list');
    });
  });

  describe('Backward Compatibility Layer in urlValidator', () => {
    it('parseInstagramUrl returns platform and contentId while preserving shortcode and mediaType', () => {
      const res = parseInstagramUrl('https://www.instagram.com/p/Cxyz123/');
      expect(res.valid).toBe(true);
      expect(res.platform).toBe('instagram');
      expect(res.shortcode).toBe('Cxyz123');
      expect(res.contentId).toBe('Cxyz123');
      expect(res.mediaType).toBe('post');
      expect(res.normalizedUrl).toBe('https://www.instagram.com/p/Cxyz123/');
    });

    it('parseBatchUrls attaches platform and contentId to valid queue candidate items', () => {
      const batchText = `
        https://www.instagram.com/p/Post12345/
        https://www.instagram.com/reel/Reel67890/
        https://attacker.com/malware
      `;
      const { valid, invalid } = parseBatchUrls(batchText);

      expect(valid).toHaveLength(2);
      expect(valid[0].platform).toBe('instagram');
      expect(valid[0].contentId).toBe('Post12345');
      expect(valid[0].shortcode).toBe('Post12345');
      expect(valid[1].platform).toBe('instagram');
      expect(valid[1].contentId).toBe('Reel67890');

      expect(invalid).toHaveLength(1);
      expect(invalid[0].url).toBe('https://attacker.com/malware');
    });
  });
});
