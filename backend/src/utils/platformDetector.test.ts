import { describe, it, expect, beforeEach } from 'vitest';
import {
  UniversalPlatformRegistry,
  InstagramPlatformDetector,
  IPlatformDetector,
  PlatformDetectResult
} from './platformDetector.js';

describe('Modular Platform Detectors & UniversalPlatformRegistry', () => {
  let registry: UniversalPlatformRegistry;

  beforeEach(() => {
    registry = new UniversalPlatformRegistry();
  });

  describe('InstagramPlatformDetector', () => {
    const detector = new InstagramPlatformDetector();

    it('identifies official Instagram domains and CDN hosts', () => {
      expect(detector.matches(new URL('https://www.instagram.com/p/Cxyz123/'))).toBe(true);
      expect(detector.matches(new URL('https://instagram.com/reel/123/'))).toBe(true);
      expect(detector.matches(new URL('https://m.instagram.com/tv/123/'))).toBe(true);
      expect(detector.matches(new URL('https://instagr.am/p/123/'))).toBe(true);
      expect(detector.matches(new URL('https://scontent-iad3-1.cdninstagram.com/v/t51.2885-15/photo.jpg'))).toBe(true);
      expect(detector.matches(new URL('https://scontent.xx.fbcdn.net/v/t51.2885-15/video.mp4'))).toBe(true);

      // Rejects non-Instagram domains
      expect(detector.matches(new URL('https://youtube.com/watch?v=123'))).toBe(false);
      expect(detector.matches(new URL('https://attacker.com/p/123'))).toBe(false);
    });

    it('correctly parses standard post, reel, and IGTV permalinks and strips tracking params', () => {
      const parsedPost = detector.detect(
        'https://www.instagram.com/p/Cxyz123/?utm_source=ig_web_copy_link&igsh=123#ref',
        new URL('https://www.instagram.com/p/Cxyz123/?utm_source=ig_web_copy_link&igsh=123#ref')
      );
      expect(parsedPost.matched).toBe(true);
      expect(parsedPost.platformId).toBe('instagram');
      expect(parsedPost.info?.contentType).toBe('post');
      expect(parsedPost.info?.shortcode).toBe('Cxyz123');
      expect(parsedPost.info?.contentId).toBe('Cxyz123');
      expect(parsedPost.info?.canonicalUrl).toBe('https://www.instagram.com/p/Cxyz123/');

      const parsedReel = detector.detect(
        'https://instagram.com/reels/Dabc456?igsh=999',
        new URL('https://instagram.com/reels/Dabc456?igsh=999')
      );
      expect(parsedReel.matched).toBe(true);
      expect(parsedReel.info?.contentType).toBe('reel');
      expect(parsedReel.info?.canonicalUrl).toBe('https://www.instagram.com/reel/Dabc456/');

      const parsedTv = detector.detect(
        'https://m.instagram.com/tv/BvXYZ789012/',
        new URL('https://m.instagram.com/tv/BvXYZ789012/')
      );
      expect(parsedTv.matched).toBe(true);
      expect(parsedTv.info?.contentType).toBe('tv');
      expect(parsedTv.info?.canonicalUrl).toBe('https://www.instagram.com/tv/BvXYZ789012/');
    });

    it('detects user-prefixed post and reel permalinks', () => {
      const parsed = detector.detect(
        'https://www.instagram.com/natgeo/p/Cxyz123/',
        new URL('https://www.instagram.com/natgeo/p/Cxyz123/')
      );
      expect(parsed.matched).toBe(true);
      expect(parsed.info?.username).toBe('natgeo');
      expect(parsed.info?.shortcode).toBe('Cxyz123');
      expect(parsed.info?.canonicalUrl).toBe('https://www.instagram.com/p/Cxyz123/');
    });

    it('detects valid profile URLs and excludes reserved top-level paths', () => {
      const profile = detector.detect(
        'https://www.instagram.com/nature.photographer/',
        new URL('https://www.instagram.com/nature.photographer/')
      );
      expect(profile.matched).toBe(true);
      expect(profile.info?.contentType).toBe('profile');
      expect(profile.info?.username).toBe('nature.photographer');
      expect(profile.info?.canonicalUrl).toBe('https://www.instagram.com/nature.photographer/');

      // Reserved paths return error
      const explore = detector.detect(
        'https://www.instagram.com/explore/',
        new URL('https://www.instagram.com/explore/')
      );
      expect(explore.matched).toBe(true);
      expect(explore.error).toContain('Unrecognized Instagram path');
    });

    it('detects direct Meta CDN media links with tokens and file extensions', () => {
      const cdnUrl = 'https://scontent-iad3-1.cdninstagram.com/v/t51.2885-15/photo.jpg?oh=abcd&oe=65abcdef';
      const cdn = detector.detect(cdnUrl, new URL(cdnUrl));
      expect(cdn.matched).toBe(true);
      expect(cdn.platformId).toBe('instagram');
      expect(cdn.info?.contentType).toBe('direct_media');
      expect(cdn.info?.directMediaInfo?.extension).toBe('jpg');
      expect(cdn.info?.directMediaInfo?.hasCryptoTokens).toBe(true);
      expect(cdn.info?.directMediaInfo?.expiresAtUnixHex).toBe('65abcdef');
    });

    it('verifies allowed download hosts correctly', () => {
      expect(detector.isAllowedDownloadHost('instagram.com')).toBe(true);
      expect(detector.isAllowedDownloadHost('www.instagram.com')).toBe(true);
      expect(detector.isAllowedDownloadHost('scontent-iad3-1.cdninstagram.com')).toBe(true);
      expect(detector.isAllowedDownloadHost('scontent.xx.fbcdn.net')).toBe(true);
      expect(detector.isAllowedDownloadHost('attacker.example.com')).toBe(false);
    });
  });

  describe('UniversalPlatformRegistry', () => {
    it('initializes with the default Instagram platform detector', () => {
      const detector = registry.getDetector('instagram');
      expect(detector).toBeDefined();
      expect(detector?.platformId).toBe('instagram');
      expect(registry.listDetectors()).toHaveLength(1);
    });

    it('allows registering additional platform detectors dynamically', () => {
      const mockDetector: IPlatformDetector = {
        platformId: 'generic',
        name: 'MockGenericDetector',
        supportedHostnames: ['example.com'],
        matches(url: URL) {
          return url.hostname === 'example.com';
        },
        detect(rawUrl: string, parsedUrl: URL): PlatformDetectResult {
          return {
            matched: true,
            platformId: 'generic',
            info: {
              platformId: 'generic',
              contentType: 'video',
              canonicalUrl: `https://${parsedUrl.hostname}${parsedUrl.pathname}`,
              originalUrl: rawUrl,
              shortcode: 'mock123'
            }
          };
        },
        isAllowedDownloadHost(hostname: string) {
          return hostname === 'example.com';
        },
        getAllowedDownloadHosts() {
          return ['example.com'];
        }
      };

      registry.registerDetector(mockDetector);
      expect(registry.getDetector('generic')).toBeDefined();
      expect(registry.listDetectors()).toHaveLength(2);

      const res = registry.detectPlatform('https://example.com/media/test');
      expect(res.matched).toBe(true);
      expect(res.platformId).toBe('generic');
      expect(res.info?.canonicalUrl).toBe('https://example.com/media/test');

      expect(registry.isAllowedDownloadHost('example.com')).toBe(true);
      expect(registry.isAllowedDownloadHost('unregistered.com')).toBe(false);
    });

    it('rejects empty, blank, or malformed URLs with descriptive errors', () => {
      expect(registry.detectPlatform('').matched).toBe(false);
      expect(registry.detectPlatform('   ').error).toContain('cannot be empty or blank');
      expect(registry.detectPlatform('not-a-valid-url').error).toContain('Hostname');
    });

    it('rejects path traversal sequences', () => {
      const res = registry.detectPlatform('https://www.instagram.com/p/../../etc/passwd');
      expect(res.matched).toBe(false);
      expect(res.error).toContain('Path traversal sequences are not permitted');
    });

    it('rejects embedded credentials in URL', () => {
      const res = registry.detectPlatform('https://user:pass@instagram.com/p/Cxyz123/');
      expect(res.matched).toBe(false);
      expect(res.error).toContain('Embedded authentication credentials are not permitted');
    });

    it('rejects non-standard ports', () => {
      const res = registry.detectPlatform('https://instagram.com:8443/p/Cxyz123/');
      expect(res.matched).toBe(false);
      expect(res.error).toContain('Non-standard ports are prohibited');
    });

    it('rejects unsupported domains with a clear actionable message', () => {
      const res = registry.detectPlatform('https://unknown-domain.org/video/123');
      expect(res.matched).toBe(false);
      expect(res.error).toContain("Hostname 'unknown-domain.org' is not in the allowed domain list");
    });
  });
});

