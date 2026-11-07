import { describe, it, expect } from 'vitest';
import { PinterestPlatformDetector } from './pinterestDetector.js';

describe('PinterestPlatformDetector Suite', () => {
  const detector = new PinterestPlatformDetector();

  describe('Hostname matching', () => {
    it('matches official canonical Pinterest domains', () => {
      expect(detector.matches(new URL('https://www.pinterest.com/pin/123456789012345678/'))).toBe(true);
      expect(detector.matches(new URL('https://pinterest.com/pin/123456789012345678/'))).toBe(true);
      expect(detector.matches(new URL('https://m.pinterest.com/pin/123456789012345678/'))).toBe(true);
      expect(detector.matches(new URL('https://pin.it/abc1234'))).toBe(true);
    });

    it('matches official regional ccTLDs and subdomains', () => {
      expect(detector.matches(new URL('https://pinterest.co.uk/pin/123456789012345678/'))).toBe(true);
      expect(detector.matches(new URL('https://www.pinterest.ca/pin/123456789012345678/'))).toBe(true);
      expect(detector.matches(new URL('https://in.pinterest.com/pin/123456789012345678/'))).toBe(true);
      expect(detector.matches(new URL('https://pinterest.de/pin/123456789012345678/'))).toBe(true);
      expect(detector.matches(new URL('https://pinterest.fr/pin/123456789012345678/'))).toBe(true);
    });

    it('rejects foreign or spoofed domains', () => {
      expect(detector.matches(new URL('https://fakepinterest.com/pin/123456789012345678/'))).toBe(false);
      expect(detector.matches(new URL('https://pinterest.com.evil.com/pin/123456789012345678/'))).toBe(false);
      expect(detector.matches(new URL('https://pinit.com/123456789012345678/'))).toBe(false);
      expect(detector.matches(new URL('https://notpin.it/abc1234'))).toBe(false);
    });
  });

  describe('Direct Pin URL detection', () => {
    it('detects valid canonical Pin URLs', () => {
      const url = 'https://www.pinterest.com/pin/123456789012345678/';
      const res = detector.detect(url, new URL(url));
      expect(res.matched).toBe(true);
      expect(res.platformId).toBe('pinterest');
      expect(res.info).toBeDefined();
      expect(res.info?.contentType).toBe('post');
      expect(res.info?.shortcode).toBe('123456789012345678');
      expect(res.info?.canonicalUrl).toBe('https://www.pinterest.com/pin/123456789012345678/');
    });

    it('detects valid regional Pin URLs and normalizes to canonical', () => {
      const url = 'https://pinterest.co.uk/pin/987654321098765432';
      const res = detector.detect(url, new URL(url));
      expect(res.matched).toBe(true);
      expect(res.platformId).toBe('pinterest');
      expect(res.info?.shortcode).toBe('987654321098765432');
      expect(res.info?.canonicalUrl).toBe('https://www.pinterest.com/pin/987654321098765432/');
    });

    it('detects valid pin.it shortlinks', () => {
      const url = 'https://pin.it/789abcXYZ';
      const res = detector.detect(url, new URL(url));
      expect(res.matched).toBe(true);
      expect(res.platformId).toBe('pinterest');
      expect(res.info?.contentType).toBe('post');
      expect(res.info?.shortcode).toBe('789abcXYZ');
      expect(res.info?.canonicalUrl).toBe('https://pin.it/789abcXYZ');
    });
  });

  describe('Invalid or malformed Pin ID handling', () => {
    it('rejects numeric Pin IDs shorter than 16 digits', () => {
      const url = 'https://www.pinterest.com/pin/12345/';
      const res = detector.detect(url, new URL(url));
      expect(res.matched).toBe(true);
      expect(res.platformId).toBe('pinterest');
      expect(res.error).toMatch(/Invalid Pinterest Pin ID '12345'/);
    });

    it('rejects numeric Pin IDs longer than 22 digits', () => {
      const url = 'https://www.pinterest.com/pin/1234567890123456789012345/';
      const res = detector.detect(url, new URL(url));
      expect(res.matched).toBe(true);
      expect(res.platformId).toBe('pinterest');
      expect(res.error).toMatch(/Invalid Pinterest Pin ID/);
    });

    it('rejects non-numeric Pin IDs in /pin/ path', () => {
      const url = 'https://www.pinterest.com/pin/not-a-number/';
      const res = detector.detect(url, new URL(url));
      expect(res.matched).toBe(true);
      expect(res.platformId).toBe('pinterest');
      expect(res.error).toMatch(/Invalid Pinterest Pin URL: invalid identifier/);
    });

    it('rejects malformed pin.it shortcodes', () => {
      const url = 'https://pin.it/ab'; // too short (< 3)
      const res = detector.detect(url, new URL(url));
      expect(res.matched).toBe(true);
      expect(res.platformId).toBe('pinterest');
      expect(res.error).toMatch(/Invalid or malformed pin.it shortcode/);
    });
  });

  describe('Unsupported URL structures', () => {
    it('rejects boards with user-friendly error', () => {
      const url = 'https://www.pinterest.com/username/my-board-name/';
      const res = detector.detect(url, new URL(url));
      expect(res.matched).toBe(true);
      expect(res.platformId).toBe('pinterest');
      expect(res.error).toMatch(/Pinterest boards \([^)]+\) are not supported/);
    });

    it('rejects profile pages with user-friendly error', () => {
      const url = 'https://www.pinterest.com/username/';
      const res = detector.detect(url, new URL(url));
      expect(res.matched).toBe(true);
      expect(res.platformId).toBe('pinterest');
      expect(res.error).toMatch(/Pinterest user profiles \(@username\) are not supported/);
    });

    it('rejects search and feed pages', () => {
      const searchUrl = 'https://www.pinterest.com/search/pins/?q=food';
      const searchRes = detector.detect(searchUrl, new URL(searchUrl));
      expect(searchRes.matched).toBe(true);
      expect(searchRes.error).toMatch(/search and feed pages are not supported/);

      const todayUrl = 'https://www.pinterest.com/today/';
      const todayRes = detector.detect(todayUrl, new URL(todayUrl));
      expect(todayRes.matched).toBe(true);
      expect(todayRes.error).toMatch(/search and feed pages are not supported/);
    });
  });

  describe('Protocol and security restrictions', () => {
    it('rejects non-HTTPS protocol', () => {
      const url = 'http://www.pinterest.com/pin/123456789012345678/';
      const res = detector.detect(url, new URL(url));
      expect(res.matched).toBe(true);
      expect(res.error).toMatch(/Only HTTPS Pinterest URLs are permitted/);
    });

    it('rejects non-standard ports', () => {
      const url = 'https://www.pinterest.com:8443/pin/123456789012345678/';
      const res = detector.detect(url, new URL(url));
      expect(res.matched).toBe(true);
      expect(res.error).toMatch(/Non-standard ports are prohibited/);
    });

    it('rejects embedded credentials', () => {
      const url = 'https://user:pass@www.pinterest.com/pin/123456789012345678/';
      const res = detector.detect(url, new URL(url));
      expect(res.matched).toBe(true);
      expect(res.error).toMatch(/Embedded authentication credentials are not permitted/);
    });
  });

  describe('Download Host Authorization', () => {
    it('authorizes official Pinterest CDN hosts', () => {
      expect(detector.isAllowedDownloadHost('i.pinimg.com')).toBe(true);
      expect(detector.isAllowedDownloadHost('s-media-cache-ak0.pinimg.com')).toBe(true);
    });

    it('rejects unapproved or foreign hostnames', () => {
      expect(detector.isAllowedDownloadHost('evil.com')).toBe(false);
      expect(detector.isAllowedDownloadHost('i.pinimg.com.evil.com')).toBe(false);
      expect(detector.isAllowedDownloadHost('www.pinterest.com')).toBe(false);
    });
  });
});
