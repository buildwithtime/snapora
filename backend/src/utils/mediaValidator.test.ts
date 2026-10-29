import { describe, it, expect } from 'vitest';
import { validateMediaBytes } from './mediaValidator.js';

describe('Media Validator Utility', () => {
  it('validates authentic JPEG images via SOI marker (FF D8 FF)', () => {
    const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
    const result = validateMediaBytes(jpegHeader);
    expect(result.valid).toBe(true);
    expect(result.detectedType).toBe('image/jpeg');
  });

  it('validates authentic MP4 video via ftyp box signature', () => {
    // 4 bytes length, 'ftyp' (66 74 79 70), 'isom' brand (69 73 6f 6d)
    const mp4Header = Buffer.from([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00
    ]);
    const result = validateMediaBytes(mp4Header);
    expect(result.valid).toBe(true);
    expect(result.detectedType).toBe('video/mp4');
  });

  it('validates authentic WebP image header', () => {
    // RIFF....WEBP
    const webpHeader = Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0x20, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50
    ]);
    const result = validateMediaBytes(webpHeader);
    expect(result.valid).toBe(true);
    expect(result.detectedType).toBe('image/webp');
  });

  it('rejects HTML error pages disguised with media filenames', () => {
    const htmlPage = Buffer.from('<!DOCTYPE html><html><head><title>Error</title></head><body>404 Not Found</body></html>');
    const result = validateMediaBytes(htmlPage);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Received HTML/text/JSON response instead of binary media');
  });

  it('rejects JSON error responses disguised with media filenames', () => {
    const jsonError = Buffer.from('{"error":{"message":"User is private","code":100}}');
    const result = validateMediaBytes(jsonError);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Received HTML/text/JSON response instead of binary media');
  });

  it('rejects truncated header chunks smaller than 12 bytes', () => {
    const tiny = Buffer.from([0xff, 0xd8]);
    const result = validateMediaBytes(tiny);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Header chunk too short');
  });

  it('rejects unknown random binary garbage', () => {
    const garbage = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c]);
    const result = validateMediaBytes(garbage);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Unrecognized binary signature');
  });
});
