import { describe, it, expect, vi } from 'vitest';
import { Readable } from 'node:stream';
import {
  parseImageDimensions,
  isPlaceholderThumbnail,
  isValidThumbnailUrl,
  APPROVED_YOUTUBE_THUMBNAIL_HOSTS,
  youTubeThumbnailService,
  YouTubeThumbnailService
} from './thumbnailService.js';
import * as ssrfClient from '../../utils/ssrfClient.js';

describe('YouTube Thumbnail Service & Image Validation Suite', () => {
  const service = new YouTubeThumbnailService();

  // Fixture: JPEG with SOF0 marker (Width: 1280, Height: 720)
  const validJpegMaxres = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x60,
    0x00, 0x60, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0xd0, 0x05, 0x00, 0x03, 0x01, 0x22,
    0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9
  ]);

  // Fixture: JPEG with SOF0 marker (Width: 120, Height: 90) - YouTube's classic missing thumbnail placeholder
  const placeholderJpeg = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x60,
    0x00, 0x60, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x5a, 0x00, 0x78, 0x03, 0x01, 0x22,
    0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9
  ]);

  // Fixture: WebP Lossy (VP8) (Width: 640, Height: 480)
  // Width 640 = 0x0280 (LE: 0x80, 0x02), Height 480 = 0x01E0 (LE: 0xE0, 0x01)
  const validWebp = Buffer.from([
    0x52, 0x49, 0x46, 0x46, 0x28, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
    0x1c, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x9d, 0x01, 0x2a, 0x80, 0x02, 0xe0, 0x01, 0x00, 0x00
  ]);

  // Fixture: PNG with IHDR (Width: 320, Height: 180)
  const validPng = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x01, 0x40, 0x00, 0x00, 0x00, 0xb4, 0x08, 0x02, 0x00, 0x00, 0x00
  ]);

  describe('Host & Protocol Validation (isValidThumbnailUrl)', () => {
    it('accepts HTTPS URLs on approved YouTube CDN hosts', () => {
      expect(isValidThumbnailUrl('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg')).toBe(true);
      expect(isValidThumbnailUrl('https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg')).toBe(true);
    });

    it('rejects unencrypted HTTP URLs', () => {
      expect(isValidThumbnailUrl('http://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg')).toBe(false);
      expect(isValidThumbnailUrl('http://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg')).toBe(false);
    });

    it('rejects unapproved hosts, webpage domains, and malicious domains', () => {
      expect(isValidThumbnailUrl('https://youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg')).toBe(false);
      expect(isValidThumbnailUrl('https://www.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg')).toBe(false);
      expect(isValidThumbnailUrl('https://evil.com/vi/dQw4w9WgXcQ/hqdefault.jpg')).toBe(false);
      expect(isValidThumbnailUrl('https://attacker.i.ytimg.com/vi/123/hqdefault.jpg')).toBe(false);
    });

    it('handles null, undefined, and non-string inputs safely', () => {
      expect(isValidThumbnailUrl(null)).toBe(false);
      expect(isValidThumbnailUrl(undefined)).toBe(false);
      expect(isValidThumbnailUrl('')).toBe(false);
      expect(isValidThumbnailUrl('not-a-url')).toBe(false);
    });
  });

  describe('parseImageDimensions', () => {
    it('parses genuine dimensions from JPEG binary headers', () => {
      const dims = parseImageDimensions(validJpegMaxres);
      expect(dims).not.toBeNull();
      expect(dims?.format).toBe('jpeg');
      expect(dims?.width).toBe(1280);
      expect(dims?.height).toBe(720);
    });

    it('parses genuine dimensions from WebP binary headers', () => {
      const dims = parseImageDimensions(validWebp);
      expect(dims).not.toBeNull();
      expect(dims?.format).toBe('webp');
      expect(dims?.width).toBe(640);
      expect(dims?.height).toBe(480);
    });

    it('parses genuine dimensions from PNG binary headers', () => {
      const dims = parseImageDimensions(validPng);
      expect(dims).not.toBeNull();
      expect(dims?.format).toBe('png');
      expect(dims?.width).toBe(320);
      expect(dims?.height).toBe(180);
    });

    it('returns null for truncated or corrupted headers', () => {
      expect(parseImageDimensions(Buffer.from([0xff, 0xd8]))).toBeNull();
      expect(parseImageDimensions(Buffer.from('not an image at all'))).toBeNull();
    });
  });

  describe('isPlaceholderThumbnail Detection', () => {
    it('flags 120x90 image as placeholder when requested for maxresdefault', () => {
      expect(isPlaceholderThumbnail('maxresdefault', 120, 90)).toBe(true);
    });

    it('flags 120x90 image as placeholder when requested for sddefault', () => {
      expect(isPlaceholderThumbnail('sddefault', 120, 90)).toBe(true);
    });

    it('flags 120x90 image as placeholder when requested for hqdefault', () => {
      expect(isPlaceholderThumbnail('hqdefault', 120, 90)).toBe(true);
    });

    it('does NOT flag 120x90 image as placeholder for standard default variant', () => {
      expect(isPlaceholderThumbnail('default', 120, 90)).toBe(false);
    });

    it('does NOT flag true 1280x720 image as placeholder for maxresdefault', () => {
      expect(isPlaceholderThumbnail('maxresdefault', 1280, 720)).toBe(false);
    });
  });

  describe('validateThumbnailBuffer', () => {
    it('accepts authentic 1280x720 maxresdefault image buffer', () => {
      const res = service.validateThumbnailBuffer(validJpegMaxres, 'maxresdefault');
      expect(res.valid).toBe(true);
      expect(res.dimensions?.width).toBe(1280);
      expect(res.dimensions?.height).toBe(720);
    });

    it('rejects 120x90 placeholder when validating maxresdefault', () => {
      const res = service.validateThumbnailBuffer(placeholderJpeg, 'maxresdefault');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('placeholder');
    });

    it('accepts 120x90 image when validating standard default variant', () => {
      const res = service.validateThumbnailBuffer(placeholderJpeg, 'default');
      expect(res.valid).toBe(true);
      expect(res.dimensions?.width).toBe(120);
      expect(res.dimensions?.height).toBe(90);
    });

    it('rejects HTML error pages disguised as thumbnail images', () => {
      const htmlBuffer = Buffer.from('<!DOCTYPE html><html><body>Error 404 Not Found</body></html>');
      const res = service.validateThumbnailBuffer(htmlBuffer, 'hqdefault');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('HTML');
    });
  });

  describe('discoverThumbnails & Verification Accuracy', () => {
    it('marks API metadata thumbnails as unverified (verified: false)', async () => {
      const dataApiSnippetThumbs = {
        maxres: { url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg', width: 1280, height: 720 },
        high: { url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg', width: 480, height: 360 },
        medium: { url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg', width: 320, height: 180 },
        default: { url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/default.jpg', width: 120, height: 90 }
      };

      const thumbs = await service.discoverThumbnails('dQw4w9WgXcQ', dataApiSnippetThumbs);
      expect(thumbs).toHaveLength(4);
      expect(thumbs[0].resolution).toBe('maxresdefault');
      expect(thumbs[0].width).toBe(1280);
      // Confirms Data API thumbnails are NOT marked binary-verified
      expect(thumbs[0].verified).toBe(false);
      expect(thumbs[1].verified).toBe(false);
      expect(thumbs[2].verified).toBe(false);
      expect(thumbs[3].verified).toBe(false);
    });

    it('filters out thumbnail URLs with invalid hostnames or insecure protocols from API metadata', async () => {
      const mixedThumbs = {
        maxres: { url: 'http://i.ytimg.com/vi/123/maxresdefault.jpg', width: 1280, height: 720 }, // insecure http
        high: { url: 'https://attacker.com/vi/123/hqdefault.jpg', width: 480, height: 360 },       // unapproved host
        medium: { url: 'https://i.ytimg.com/vi/123/mqdefault.jpg', width: 320, height: 180 }        // approved HTTPS
      };

      const thumbs = await service.discoverThumbnails('123', mixedThumbs);
      expect(thumbs).toHaveLength(1);
      expect(thumbs[0].resolution).toBe('mqdefault');
      expect(thumbs[0].url).toBe('https://i.ytimg.com/vi/123/mqdefault.jpg');
      expect(thumbs[0].verified).toBe(false);
    });

    it('safely generates standard variants without assuming maxresdefault when Data API is unavailable', async () => {
      const thumbs = await service.discoverThumbnails('dQw4w9WgXcQ');
      expect(thumbs).toHaveLength(3);
      // Confirms maxresdefault is NOT assumed without verification
      expect(thumbs.some((t) => t.resolution === 'maxresdefault')).toBe(false);
      expect(thumbs[0].resolution).toBe('hqdefault');
      expect(thumbs[0].verified).toBe(false);
      expect(thumbs[1].resolution).toBe('mqdefault');
      expect(thumbs[2].resolution).toBe('default');
    });
  });

  describe('Binary Verification (probeThumbnailVariant)', () => {
    it('marks thumbnail as verified: true only upon successful binary inspection', async () => {
      const spy = vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValueOnce({
        statusCode: 200,
        headers: { 'content-type': 'image/jpeg', 'content-length': String(validJpegMaxres.length) },
        stream: Readable.from([validJpegMaxres]) as any
      });

      const probed = await service.probeThumbnailVariant('dQw4w9WgXcQ', 'maxresdefault');
      expect(probed).not.toBeNull();
      expect(probed?.resolution).toBe('maxresdefault');
      expect(probed?.width).toBe(1280);
      expect(probed?.height).toBe(720);
      expect(probed?.verified).toBe(true);

      spy.mockRestore();
    });

    it('returns null and does not verify when binary inspection detects placeholder', async () => {
      const spy = vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValueOnce({
        statusCode: 200,
        headers: { 'content-type': 'image/jpeg', 'content-length': String(placeholderJpeg.length) },
        stream: Readable.from([placeholderJpeg]) as any
      });

      const probed = await service.probeThumbnailVariant('dQw4w9WgXcQ', 'maxresdefault');
      expect(probed).toBeNull();

      spy.mockRestore();
    });
  });
});
