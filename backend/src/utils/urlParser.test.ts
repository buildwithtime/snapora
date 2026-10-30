import { describe, it, expect } from 'vitest';
import { parseInstagramUrl, isInstagramCdnHostname } from './urlParser.js';

describe('Backend Instagram URL Parser', () => {
  it('parses standard Instagram post with query parameters stripped', () => {
    const res = parseInstagramUrl('https://www.instagram.com/p/Cxyz123/?utm_source=ig_web_copy_link&igsh=123#ref');
    expect(res.valid).toBe(true);
    expect(res.contentType).toBe('post');
    expect(res.shortcode).toBe('Cxyz123');
    expect(res.canonicalUrl).toBe('https://www.instagram.com/p/Cxyz123/');
  });

  it('parses real reference URL, strips utm_source and rpxt tracking params, and preserves shortcode', () => {
    const realRefUrl = 'https://www.instagram.com/p/DfBnbDEGJSx/?utm_source=ig_web_copy_link&rpxt=NTc4MTIwNjQ2YQ==';
    const res = parseInstagramUrl(realRefUrl);
    expect(res.valid).toBe(true);
    expect(res.contentType).toBe('post');
    expect(res.shortcode).toBe('DfBnbDEGJSx');
    expect(res.canonicalUrl).toBe('https://www.instagram.com/p/DfBnbDEGJSx/');
  });

  it('parses Reels and IGTV URLs into canonical paths', () => {
    const reel = parseInstagramUrl('https://instagram.com/reel/Reel123/');
    expect(reel.valid).toBe(true);
    expect(reel.contentType).toBe('reel');
    expect(reel.canonicalUrl).toBe('https://www.instagram.com/reel/Reel123/');

    const tv = parseInstagramUrl('https://m.instagram.com/tv/Tv123/');
    expect(tv.valid).toBe(true);
    expect(tv.contentType).toBe('tv');
    expect(tv.canonicalUrl).toBe('https://www.instagram.com/tv/Tv123/');
  });

  it('identifies and parses direct Meta CDN media links', () => {
    const cdnUrl = 'https://scontent-iad3-2.cdninstagram.com/v/t51.2885-15/photo.jpg?_nc_cat=1&oh=test_oh&oe=65test';
    const res = parseInstagramUrl(cdnUrl);
    expect(res.valid).toBe(true);
    expect(res.contentType).toBe('direct_media');
    expect(res.directMediaInfo?.extension).toBe('jpg');
    expect(res.directMediaInfo?.hasCryptoTokens).toBe(true);
    expect(res.directMediaInfo?.expiresAtUnixHex).toBe('65test');
  });

  it('rejects unsupported domains, non-standard ports, and embedded credentials', () => {
    expect(parseInstagramUrl('https://attacker.com/p/123/').valid).toBe(false);
    expect(parseInstagramUrl('https://user:pass@instagram.com/p/123/').valid).toBe(false);
    expect(parseInstagramUrl('https://instagram.com:8443/p/123/').valid).toBe(false);
    expect(parseInstagramUrl('ftp://instagram.com/p/123/').valid).toBe(false);
  });

  it('recognizes CDN host patterns correctly', () => {
    expect(isInstagramCdnHostname('scontent-iad3-1.cdninstagram.com')).toBe(true);
    expect(isInstagramCdnHostname('scontent.cdninstagram.com')).toBe(true);
    expect(isInstagramCdnHostname('instagram.fdel1-1.fna.fbcdn.net')).toBe(true);
    expect(isInstagramCdnHostname('evil-cdninstagram.com')).toBe(false);
    expect(isInstagramCdnHostname('cdninstagram.com.attacker.com')).toBe(false);
  });

  it('correctly identifies and canonicalizes Instagram profile URLs', () => {
    const p1 = parseInstagramUrl('https://www.instagram.com/natgeo/');
    expect(p1.valid).toBe(true);
    expect(p1.contentType).toBe('profile');
    expect(p1.username).toBe('natgeo');
    expect(p1.canonicalUrl).toBe('https://www.instagram.com/natgeo/');

    const p2 = parseInstagramUrl('https://instagram.com/travel_blogger.99');
    expect(p2.valid).toBe(true);
    expect(p2.contentType).toBe('profile');
    expect(p2.username).toBe('travel_blogger.99');
    expect(p2.canonicalUrl).toBe('https://www.instagram.com/travel_blogger.99/');

    const p3 = parseInstagramUrl('https://m.instagram.com/artist/');
    expect(p3.valid).toBe(true);
    expect(p3.contentType).toBe('profile');
    expect(p3.username).toBe('artist');
    expect(p3.canonicalUrl).toBe('https://www.instagram.com/artist/');
  });

  it('rejects reserved top-level paths from being parsed as profiles', () => {
    const reserved = ['explore', 'accounts', 'stories', 'direct', 'create', 'settings', 'legal'];
    for (const r of reserved) {
      const res = parseInstagramUrl(`https://www.instagram.com/${r}/`);
      expect(res.valid).toBe(false);
    }
  });

  it('rejects malformed usernames with leading/trailing dots or consecutive dots', () => {
    expect(parseInstagramUrl('https://www.instagram.com/.invalidname/').valid).toBe(false);
    expect(parseInstagramUrl('https://www.instagram.com/invalidname./').valid).toBe(false);
    expect(parseInstagramUrl('https://www.instagram.com/invalid..name/').valid).toBe(false);
  });
});
