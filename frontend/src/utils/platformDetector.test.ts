import { describe, it, expect, beforeEach } from 'vitest';
import {
  UniversalPlatformRegistry,
  InstagramPlatformDetector,
  IPlatformDetector,
  PlatformDetectResult
} from './platformDetector.js';
import { parseInstagramUrl, parseBatchUrls } from './urlValidator.js';

describe('Frontend Modular Platform Detectors & UniversalPlatformRegistry', () => {
  let registry: UniversalPlatformRegistry;

  beforeEach(() => {
    registry = new UniversalPlatformRegistry();
  });

  describe('InstagramPlatformDetector', () => {
    const detector = new InstagramPlatformDetector();

    it('matches official Instagram domains and CDN hosts', () => {
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

    it('parses post, reel, and tv permalinks, strips tracking params, and builds canonical URLs', () => {
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
    });

    it('detects user-prefixed post URLs and profiles', () => {
      const parsedUserPost = detector.detect(
        'https://www.instagram.com/natgeo/p/Cxyz123/',
        new URL('https://www.instagram.com/natgeo/p/Cxyz123/')
      );
      expect(parsedUserPost.matched).toBe(true);
      expect(parsedUserPost.info?.username).toBe('natgeo');
      expect(parsedUserPost.info?.shortcode).toBe('Cxyz123');

      const profile = detector.detect(
        'https://www.instagram.com/nature.photographer/',
        new URL('https://www.instagram.com/nature.photographer/')
      );
      expect(profile.matched).toBe(true);
      expect(profile.info?.contentType).toBe('profile');
      expect(profile.info?.username).toBe('nature.photographer');
    });

    it('identifies direct Meta CDN media links with file extensions and crypto tokens', () => {
      const cdnUrl = 'https://scontent-iad3-1.cdninstagram.com/v/t51.2885-15/photo.jpg?oh=abcd&oe=65abcdef';
      const cdn = detector.detect(cdnUrl, new URL(cdnUrl));
      expect(cdn.matched).toBe(true);
      expect(cdn.platformId).toBe('instagram');
      expect(cdn.info?.contentType).toBe('direct_media');
      expect(cdn.info?.directMediaInfo?.extension).toBe('jpg');
      expect(cdn.info?.directMediaInfo?.hasCryptoTokens).toBe(true);
    });
  });

  describe('UniversalPlatformRegistry (Frontend)', () => {
    it('registers and detects platforms dynamically', () => {
      const mockDetector: IPlatformDetector = {
        platformId: 'youtube',
        name: 'MockYouTubeDetector',
        supportedHostnames: ['youtube.com', 'youtu.be'],
        matches(url: URL) {
          return url.hostname.includes('youtube.com') || url.hostname.includes('youtu.be');
        },
        detect(rawUrl: string, parsedUrl: URL): PlatformDetectResult {
          return {
            matched: true,
            platformId: 'youtube',
            info: {
              platformId: 'youtube',
              contentType: 'video',
              canonicalUrl: `https://${parsedUrl.hostname}${parsedUrl.pathname}`,
              originalUrl: rawUrl,
              shortcode: 'yt123',
              contentId: 'yt123'
            }
          };
        },
        isAllowedDownloadHost(hostname: string) {
          return hostname.includes('googlevideo.com');
        },
        getAllowedDownloadHosts() {
          return [/^[a-zA-Z0-9.-]+\.googlevideo\.com$/];
        }
      };

      registry.registerDetector(mockDetector);
      expect(registry.getDetector('youtube')).toBeDefined();

      const res = registry.detectPlatform('https://youtube.com/watch?v=dQw4w9WgXcQ');
      expect(res.matched).toBe(true);
      expect(res.platformId).toBe('youtube');
      expect(res.info?.contentType).toBe('video');

      expect(registry.isAllowedDownloadHost('rr1---sn-4g5edn7s.googlevideo.com')).toBe(true);
      expect(registry.isAllowedDownloadHost('unapproved.com')).toBe(false);
    });

    it('rejects path traversal, embedded credentials, and unsupported domains', () => {
      expect(registry.detectPlatform('https://www.instagram.com/p/../../etc/passwd').error).toContain('Path traversal');
      expect(registry.detectPlatform('https://admin:secret@instagram.com/p/123/').error).toContain('embedded credentials');
      expect(registry.detectPlatform('https://unsupported-site.org/item/1').error).toContain('Unsupported domain');
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
