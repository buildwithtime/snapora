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

  it('validates authentic MP4 with ftyp preceded by wide or free atom', () => {
    // 8 bytes 'wide' atom (size 8 + 'wide') followed by 'ftyp' box
    const wideAtomMp4 = Buffer.from([
      0x00, 0x00, 0x00, 0x08, 0x77, 0x69, 0x64, 0x65, // wide
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, // ftyp
      0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00
    ]);
    const resultWide = validateMediaBytes(wideAtomMp4);
    expect(resultWide.valid).toBe(true);
    expect(resultWide.detectedType).toBe('video/mp4');

    // 8 bytes 'free' atom (size 8 + 'free') followed by 'ftyp' box
    const freeAtomMp4 = Buffer.from([
      0x00, 0x00, 0x00, 0x08, 0x66, 0x72, 0x65, 0x65, // free
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, // ftyp
      0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00
    ]);
    const resultFree = validateMediaBytes(freeAtomMp4);
    expect(resultFree.valid).toBe(true);
    expect(resultFree.detectedType).toBe('video/mp4');
  });

  it('strictly rejects text or script files containing the characters "ftyp" outside atom structure', () => {
    // A script or text payload where "ftyp" appears randomly in content
    const spoofedScript = Buffer.from('console.log("ftyp is a format"); var a = 123456789;');
    const result = validateMediaBytes(spoofedScript);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Unrecognized binary signature');
  });

  it('validates QuickTime / MP4 container with moov or mdat atom', () => {
    const moovHeader = Buffer.from([
      0x00, 0x00, 0x01, 0x00, 0x6d, 0x6f, 0x6f, 0x76, 0x00, 0x00, 0x00, 0x6c
    ]);
    const result = validateMediaBytes(moovHeader);
    expect(result.valid).toBe(true);
    expect(result.detectedType).toBe('video/mp4');
  });

  it('validates WebM / Matroska EBML container signature (1A 45 DF A3)', () => {
    const webmHeader = Buffer.from([
      0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01
    ]);
    const result = validateMediaBytes(webmHeader);
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

  it('rejects HTML login redirect pages disguised with media filenames', () => {
    const loginHtml = Buffer.from('<html><head><script>window.location.href="https://www.instagram.com/accounts/login/";</script></head></html>');
    const result = validateMediaBytes(loginHtml);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Received HTML/text/JSON response instead of binary media');
  });

  it('rejects empty or null buffers', () => {
    const emptyResult = validateMediaBytes(Buffer.alloc(0));
    expect(emptyResult.valid).toBe(false);
    expect(emptyResult.error).toContain('Header chunk too short');

    const nullResult = validateMediaBytes(null as any);
    expect(nullResult.valid).toBe(false);
    expect(nullResult.error).toContain('Header chunk too short');
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
