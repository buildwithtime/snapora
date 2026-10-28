import { describe, it, expect } from 'vitest';
import { parseInstagramUrl, parseBatchUrls } from './urlValidator.js';

describe('Frontend URL Validator', () => {
  it('parses standard Instagram photo post', () => {
    const res = parseInstagramUrl('https://www.instagram.com/p/Cxyz123/');
    expect(res.valid).toBe(true);
    expect(res.shortcode).toBe('Cxyz123');
    expect(res.normalizedUrl).toBe('https://www.instagram.com/p/Cxyz123/');
  });

  it('parses Instagram reel URL', () => {
    const res = parseInstagramUrl('https://instagram.com/reel/Dabc456?igsh=123');
    expect(res.valid).toBe(true);
    expect(res.shortcode).toBe('Dabc456');
    expect(res.normalizedUrl).toBe('https://www.instagram.com/p/Dabc456/');
  });

  it('parses instagr.am short domain', () => {
    const res = parseInstagramUrl('https://instagr.am/p/Efg789/');
    expect(res.valid).toBe(true);
    expect(res.shortcode).toBe('Efg789');
  });

  it('rejects unsupported domains', () => {
    const res = parseInstagramUrl('https://example.com/p/fake123/');
    expect(res.valid).toBe(false);
    expect(res.error).toContain('Unsupported domain');
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
      https://www.instagram.com/p/AAA111/
      https://not-instagram.com/p/CCC333/
      invalid-string
    `;

    const { valid, invalid } = parseBatchUrls(text);

    // 2 unique valid URLs
    expect(valid).toHaveLength(2);
    expect(valid[0].shortcode).toBe('AAA111');
    expect(valid[1].shortcode).toBe('BBB222');

    // 2 invalid URLs
    expect(invalid).toHaveLength(2);
  });
});
