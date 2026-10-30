import { describe, it, expect } from 'vitest';
import { parseInstagramUrl, parseBatchUrls } from './urlValidator.js';

describe('Frontend URL Validator', () => {
  it('parses standard Instagram photo post', () => {
    const res = parseInstagramUrl('https://www.instagram.com/p/Cxyz123/');
    expect(res.valid).toBe(true);
    expect(res.shortcode).toBe('Cxyz123');
    expect(res.mediaType).toBe('post');
    expect(res.normalizedUrl).toBe('https://www.instagram.com/p/Cxyz123/');
  });

  it('parses Instagram reel URL and canonicalizes to /reel/ path', () => {
    const res = parseInstagramUrl('https://instagram.com/reel/Dabc456?igsh=123');
    expect(res.valid).toBe(true);
    expect(res.shortcode).toBe('Dabc456');
    expect(res.mediaType).toBe('reel');
    expect(res.normalizedUrl).toBe('https://www.instagram.com/reel/Dabc456/');
  });

  it('parses Instagram reels plural path variant', () => {
    const res = parseInstagramUrl('https://www.instagram.com/reels/C9zKlmN1234/');
    expect(res.valid).toBe(true);
    expect(res.shortcode).toBe('C9zKlmN1234');
    expect(res.mediaType).toBe('reel');
    expect(res.normalizedUrl).toBe('https://www.instagram.com/reel/C9zKlmN1234/');
  });

  it('parses Instagram TV URL and canonicalizes to /tv/ path', () => {
    const res = parseInstagramUrl('https://www.instagram.com/tv/BvXYZ789012/');
    expect(res.valid).toBe(true);
    expect(res.shortcode).toBe('BvXYZ789012');
    expect(res.mediaType).toBe('tv');
    expect(res.normalizedUrl).toBe('https://www.instagram.com/tv/BvXYZ789012/');
  });

  it('parses mobile domain (m.instagram.com)', () => {
    const res = parseInstagramUrl('https://m.instagram.com/p/Mob12345/');
    expect(res.valid).toBe(true);
    expect(res.shortcode).toBe('Mob12345');
    expect(res.normalizedUrl).toBe('https://www.instagram.com/p/Mob12345/');
  });

  it('parses instagr.am short domain', () => {
    const res = parseInstagramUrl('https://instagr.am/p/Efg789/');
    expect(res.valid).toBe(true);
    expect(res.shortcode).toBe('Efg789');
    expect(res.normalizedUrl).toBe('https://www.instagram.com/p/Efg789/');
  });

  it('parses user-prefixed post URLs', () => {
    const res = parseInstagramUrl('https://www.instagram.com/natgeo/p/Cxyz123/');
    expect(res.valid).toBe(true);
    expect(res.shortcode).toBe('Cxyz123');
    expect(res.normalizedUrl).toBe('https://www.instagram.com/p/Cxyz123/');
  });

  it('removes query parameters, tracking tags, and hash fragments', () => {
    const res = parseInstagramUrl('https://www.instagram.com/p/Track123/?utm_source=ig_web_copy_link&igsh=NTc4MTIwNjQ2YQ==#comments');
    expect(res.valid).toBe(true);
    expect(res.shortcode).toBe('Track123');
    expect(res.normalizedUrl).toBe('https://www.instagram.com/p/Track123/');
  });

  it('correctly parses real reference post URL and strips utm_source and rpxt tracking params', () => {
    const realRefUrl = 'https://www.instagram.com/p/DfBnbDEGJSx/?utm_source=ig_web_copy_link&rpxt=NTc4MTIwNjQ2YQ==';
    const res = parseInstagramUrl(realRefUrl);
    expect(res.valid).toBe(true);
    expect(res.shortcode).toBe('DfBnbDEGJSx');
    expect(res.mediaType).toBe('post');
    expect(res.normalizedUrl).toBe('https://www.instagram.com/p/DfBnbDEGJSx/');
  });

  it('rejects deceptive domains and subdomains', () => {
    const deceptive = [
      'https://evil-instagram.com/p/Fake123/',
      'https://instagram.com.attacker.com/p/Fake123/',
      'https://notinstagram.com/p/Fake123/',
      'https://phishinginstagram.com/p/Fake123/',
      'https://api.instagram.com/p/Fake123/'
    ];

    for (const url of deceptive) {
      const res = parseInstagramUrl(url);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Unsupported domain');
    }
  });

  it('rejects embedded credentials in URL', () => {
    const res = parseInstagramUrl('https://admin:password123@instagram.com/p/Sec1234/');
    expect(res.valid).toBe(false);
    expect(res.error).toContain('embedded credentials');
  });

  it('rejects non-standard ports', () => {
    const res = parseInstagramUrl('https://www.instagram.com:8080/p/Port1234/');
    expect(res.valid).toBe(false);
    expect(res.error).toContain('Non-standard port');
  });

  it('rejects invalid shortcode lengths and characters', () => {
    // Too short (< 3 chars)
    const tooShort = parseInstagramUrl('https://www.instagram.com/p/ab/');
    expect(tooShort.valid).toBe(false);

    // Invalid characters (path traversal attempt)
    const traversal = parseInstagramUrl('https://www.instagram.com/p/../../etc/');
    expect(traversal.valid).toBe(false);
  });

  it('rejects non-Instagram paths', () => {
    const res = parseInstagramUrl('https://www.instagram.com/explore/');
    expect(res.valid).toBe(false);
    expect(res.error).toContain('Unrecognized Instagram path');
  });

  it('parses batch text with duplicates and invalid links', () => {
    const text = `
      https://www.instagram.com/p/AAA111/
      https://www.instagram.com/reel/BBB222/
      https://www.instagram.com/p/AAA111/?igsh=duplicate
      https://not-instagram.com/p/CCC333/
      invalid-string
    `;

    const { valid, invalid } = parseBatchUrls(text);

    // 2 unique valid URLs
    expect(valid).toHaveLength(2);
    expect(valid[0].shortcode).toBe('AAA111');
    expect(valid[0].mediaType).toBe('post');
    expect(valid[1].shortcode).toBe('BBB222');
    expect(valid[1].mediaType).toBe('reel');

    // 2 invalid URLs
    expect(invalid).toHaveLength(2);
  });

  it('parses space-separated and comma-separated batch URLs', () => {
    const text = 'https://www.instagram.com/p/AAA111/ https://www.instagram.com/reel/BBB222/,https://www.instagram.com/p/CCC333/';
    const { valid, invalid } = parseBatchUrls(text);
    expect(valid).toHaveLength(3);
    expect(invalid).toHaveLength(0);
  });

  it('parses valid Meta/Instagram direct CDN media URLs', () => {
    const cdnUrl = 'https://scontent-iad3-1.cdninstagram.com/v/t51.2885-15/e35/123456_n.jpg?_nc_ht=scontent-iad3-1.cdninstagram.com&_nc_cat=101&oh=abcdef123456&oe=65abcdef';
    const res = parseInstagramUrl(cdnUrl);
    expect(res.valid).toBe(true);
    expect(res.mediaType).toBe('direct_media');
    expect(res.directMediaInfo).toBeDefined();
    expect(res.directMediaInfo?.extension).toBe('jpg');
    expect(res.directMediaInfo?.hasCryptoTokens).toBe(true);
    expect(res.directMediaInfo?.expiresAtUnixHex).toBe('65abcdef');
    expect(res.normalizedUrl).toBe(cdnUrl);
  });

  it('parses fbcdn.net direct media URLs', () => {
    const fbcdnUrl = 'https://instagram.fdel1-1.fna.fbcdn.net/v/t51.2885-15/video.mp4?oh=123&oe=456';
    const res = parseInstagramUrl(fbcdnUrl);
    expect(res.valid).toBe(true);
    expect(res.mediaType).toBe('direct_media');
    expect(res.directMediaInfo?.extension).toBe('mp4');
  });

  it('identifies valid Instagram profile URLs', () => {
    const res = parseInstagramUrl('https://www.instagram.com/nature.photographer/');
    expect(res.valid).toBe(true);
    expect(res.mediaType).toBe('profile');
    expect(res.username).toBe('nature.photographer');
    expect(res.normalizedUrl).toBe('https://www.instagram.com/nature.photographer/');
  });

  it('rejects reserved system paths in profile detection', () => {
    expect(parseInstagramUrl('https://www.instagram.com/explore/').valid).toBe(false);
    expect(parseInstagramUrl('https://www.instagram.com/accounts/').valid).toBe(false);
  });
});

