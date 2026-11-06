import { describe, it, expect } from 'vitest';
import {
  YouTubePlatformDetector,
  UniversalPlatformRegistry,
  universalPlatformRegistry,
  EXACT_ALLOWED_YOUTUBE_HOSTS,
  EXACT_ALLOWED_YOUTUBE_DOWNLOAD_HOSTS
} from '../../utils/platformDetector.js';

describe('YouTubePlatformDetector & Universal Registry Suite', () => {
  const detector = new YouTubePlatformDetector();
  const registry = new UniversalPlatformRegistry();

  describe('Supported Web Permalinks & Canonicalization', () => {
    it('detects standard www.youtube.com/watch?v={videoId}', () => {
      const res = registry.detectPlatform('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(res.matched).toBe(true);
      expect(res.platformId).toBe('youtube');
      expect(res.info?.contentType).toBe('video');
      expect(res.info?.contentId).toBe('dQw4w9WgXcQ');
      expect(res.info?.shortcode).toBe('dQw4w9WgXcQ');
      expect(res.info?.canonicalUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    });

    it('detects bare youtube.com/watch?v={videoId}', () => {
      const res = registry.detectPlatform('https://youtube.com/watch?v=jNQXAC9IVRw');
      expect(res.matched).toBe(true);
      expect(res.platformId).toBe('youtube');
      expect(res.info?.contentId).toBe('jNQXAC9IVRw');
      expect(res.info?.canonicalUrl).toBe('https://www.youtube.com/watch?v=jNQXAC9IVRw');
    });

    it('detects mobile m.youtube.com/watch?v={videoId}', () => {
      const res = registry.detectPlatform('https://m.youtube.com/watch?v=9bZkp7q19f0');
      expect(res.matched).toBe(true);
      expect(res.platformId).toBe('youtube');
      expect(res.info?.contentId).toBe('9bZkp7q19f0');
      expect(res.info?.canonicalUrl).toBe('https://www.youtube.com/watch?v=9bZkp7q19f0');
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

    it('normalizes URLs and strips tracking parameters (si, feature, utm_*, t)', () => {
      const raw = 'https://youtu.be/dQw4w9WgXcQ?si=abcdef1234567890&feature=share&utm_source=twitter&t=42';
      const res = registry.detectPlatform(raw);
      expect(res.matched).toBe(true);
      expect(res.info?.canonicalUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(res.info?.originalUrl).toBe(raw);
    });
  });

  describe('Invalid and Unsupported URL Rejection', () => {
    it('rejects invalid video ID with less than 11 characters', () => {
      const res = registry.detectPlatform('https://www.youtube.com/watch?v=short');
      expect(res.matched).toBe(true);
      expect(res.platformId).toBe('youtube');
      expect(res.error).toContain('Invalid YouTube video ID');
    });

    it('rejects invalid video ID with invalid characters', () => {
      const res = registry.detectPlatform('https://www.youtube.com/watch?v=dQw4w9WgXc!');
      expect(res.matched).toBe(true);
      expect(res.error).toContain('Invalid YouTube video ID');
    });

    it('rejects /watch with missing v parameter', () => {
      const res = registry.detectPlatform('https://www.youtube.com/watch');
      expect(res.matched).toBe(true);
      expect(res.error).toContain("missing 'v' video ID query parameter");
    });

    it('rejects playlist-only URLs with descriptive message', () => {
      const res = registry.detectPlatform('https://www.youtube.com/playlist?list=PLrEnWoR732-BHrPp_Pm8_VleD68f9n14-');
      expect(res.matched).toBe(true);
      expect(res.platformId).toBe('youtube');
      expect(res.error).toContain('Playlists are not supported. Please provide a direct video URL.');
    });

    it('rejects channel URLs with descriptive message', () => {
      const handleRes = registry.detectPlatform('https://www.youtube.com/@mkbhd');
      expect(handleRes.matched).toBe(true);
      expect(handleRes.error).toContain('Channel URLs are not supported. Please provide a direct video URL.');

      const channelRes = registry.detectPlatform('https://www.youtube.com/channel/UCBJycsmduvYEL83R_U4JriQ');
      expect(channelRes.matched).toBe(true);
      expect(channelRes.error).toContain('Channel URLs are not supported. Please provide a direct video URL.');

      const cRes = registry.detectPlatform('https://www.youtube.com/c/CreatorName');
      expect(cRes.matched).toBe(true);
      expect(cRes.error).toContain('Channel URLs are not supported. Please provide a direct video URL.');
    });

    it('rejects unrecognized YouTube paths', () => {
      const res = registry.detectPlatform('https://www.youtube.com/feed/subscriptions');
      expect(res.matched).toBe(true);
      expect(res.error).toContain('Unrecognized YouTube path');
    });
  });

  describe('Security Boundaries & SSRF Defenses', () => {
    it('rejects lookalike domains and subdomain spoofing', () => {
      const lookalike = registry.detectPlatform('https://youtube.com.attacker.com/watch?v=dQw4w9WgXcQ');
      expect(lookalike.matched).toBe(false);
      expect(lookalike.error).toContain('not in the allowed domain list');

      const prefix = registry.detectPlatform('https://notyoutube.com/watch?v=dQw4w9WgXcQ');
      expect(prefix.matched).toBe(false);
      expect(prefix.error).toContain('not in the allowed domain list');
    });

    it('rejects embedded credentials in YouTube URLs', () => {
      const res = registry.detectPlatform('https://user:pass@www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(res.matched).toBe(false);
      expect(res.error).toContain('Embedded authentication credentials are not permitted');
    });

    it('rejects non-standard ports', () => {
      const res = registry.detectPlatform('https://www.youtube.com:8443/watch?v=dQw4w9WgXcQ');
      expect(res.matched).toBe(false);
      expect(res.error).toContain('Non-standard ports are prohibited');
    });

    it('rejects non-HTTPS URLs', () => {
      const res = registry.detectPlatform('http://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(res.matched).toBe(false);
      expect(res.error).toContain('Only HTTPS URLs are permitted');
    });

    it('distinguishes web Permalinks from media download hosts strictly', () => {
      // Web domains are NOT allowed download hosts
      expect(registry.isAllowedDownloadHost('youtube.com')).toBe(false);
      expect(registry.isAllowedDownloadHost('www.youtube.com')).toBe(false);
      expect(registry.isAllowedDownloadHost('m.youtube.com')).toBe(false);
      expect(registry.isAllowedDownloadHost('youtu.be')).toBe(false);

      // Approved thumbnail CDN hosts ARE allowed download hosts
      expect(registry.isAllowedDownloadHost('i.ytimg.com')).toBe(true);
      expect(registry.isAllowedDownloadHost('img.youtube.com')).toBe(true);

      // Suffix spoofing of CDN is blocked
      expect(registry.isAllowedDownloadHost('i.ytimg.com.attacker.com')).toBe(false);
      expect(registry.isAllowedDownloadHost('evil-img.youtube.com')).toBe(false);
    });
  });
});
