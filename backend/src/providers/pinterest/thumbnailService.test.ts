import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PinterestThumbnailService,
  isValidPinterestThumbnailUrl,
  APPROVED_PINTEREST_THUMBNAIL_HOSTS
} from './thumbnailService.js';
import * as ssrfClient from '../../utils/ssrfClient.js';
import { Readable } from 'node:stream';

function createMockJpegBuffer(width: number, height: number): Buffer {
  const buf = Buffer.alloc(128);
  // SOI
  buf[0] = 0xff;
  buf[1] = 0xd8;
  // APP0
  buf[2] = 0xff;
  buf[3] = 0xe0;
  buf[4] = 0x00;
  buf[5] = 0x10;
  buf.write('JFIF', 6, 'ascii');
  buf[10] = 0x00;

  // SOF0 marker at offset 20
  buf[20] = 0xff;
  buf[21] = 0xc0;
  buf[22] = 0x00;
  buf[23] = 0x11; // segment length
  buf[24] = 0x08; // data precision
  buf.writeUInt16BE(height, 25);
  buf.writeUInt16BE(width, 27);
  buf[29] = 0x03; // number of components

  return buf;
}

describe('PinterestThumbnailService Suite', () => {
  const service = new PinterestThumbnailService();
  const validThumbUrl = 'https://i.pinimg.com/236x/ab/cd/ef/abcdef1234567890.jpg';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('isValidPinterestThumbnailUrl', () => {
    it('accepts authorized Pinterest CDN thumbnail hosts and rejects legacy hosts', () => {
      expect(isValidPinterestThumbnailUrl('https://i.pinimg.com/236x/test.jpg')).toBe(true);
      expect(isValidPinterestThumbnailUrl('https://s-media-cache-ak0.pinimg.com/236x/test.jpg')).toBe(false);
    });

    it('rejects non-HTTPS URLs', () => {
      expect(isValidPinterestThumbnailUrl('http://i.pinimg.com/236x/test.jpg')).toBe(false);
    });

    it('rejects unapproved or foreign hostnames', () => {
      expect(isValidPinterestThumbnailUrl('https://evil.com/thumb.jpg')).toBe(false);
      expect(isValidPinterestThumbnailUrl('https://i.pinimg.com.evil.com/test.jpg')).toBe(false);
      expect(isValidPinterestThumbnailUrl('')).toBe(false);
      expect(isValidPinterestThumbnailUrl(null)).toBe(false);
    });
  });

  describe('verifyThumbnail', () => {
    it('successfully validates JPEG headers and extracts dimensions', async () => {
      const mockJpeg = createMockJpegBuffer(236, 354);
      const mockStream = new Readable({
        read() {
          this.push(mockJpeg);
          this.push(null);
        }
      });

      vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValueOnce({
        statusCode: 206,
        headers: { 'content-type': 'image/jpeg' },
        stream: mockStream as any,
        finalUrl: validThumbUrl
      });

      const res = await service.verifyThumbnail(validThumbUrl, { width: 200, height: 300 });
      expect(res.verified).toBe(true);
      expect(res.width).toBe(236);
      expect(res.height).toBe(354);
    });

    it('falls back to discovered dimensions when status code is not 200/206', async () => {
      const mockStream = new Readable({ read() { this.push(null); } });
      vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValueOnce({
        statusCode: 404,
        headers: {},
        stream: mockStream as any,
        finalUrl: validThumbUrl
      });

      const res = await service.verifyThumbnail(validThumbUrl, { width: 236, height: 300 });
      expect(res.verified).toBe(false);
      expect(res.width).toBe(236);
      expect(res.height).toBe(300);
    });

    it('falls back to discovered dimensions when Content-Type is invalid', async () => {
      const mockStream = new Readable({ read() { this.push(null); } });
      vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValueOnce({
        statusCode: 200,
        headers: { 'content-type': 'text/html' },
        stream: mockStream as any,
        finalUrl: validThumbUrl
      });

      const res = await service.verifyThumbnail(validThumbUrl, { width: 236, height: 300 });
      expect(res.verified).toBe(false);
      expect(res.width).toBe(236);
      expect(res.height).toBe(300);
    });

    it('gracefully handles network errors without throwing', async () => {
      vi.spyOn(ssrfClient, 'safeHttpsRequest').mockRejectedValueOnce(new Error('Network error'));

      const res = await service.verifyThumbnail(validThumbUrl, { width: 236, height: 300 });
      expect(res.verified).toBe(false);
      expect(res.width).toBe(236);
      expect(res.height).toBe(300);
    });
  });

  describe('buildThumbnailItems', () => {
    it('returns empty array when URL is invalid or empty', async () => {
      expect(await service.buildThumbnailItems('')).toEqual([]);
      expect(await service.buildThumbnailItems(null)).toEqual([]);
      expect(await service.buildThumbnailItems('https://untrusted.com/img.jpg')).toEqual([]);
    });

    it('constructs verified 236x thumbnail item array', async () => {
      const mockJpeg = createMockJpegBuffer(236, 400);
      const mockStream = new Readable({
        read() {
          this.push(mockJpeg);
          this.push(null);
        }
      });

      vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValueOnce({
        statusCode: 200,
        headers: { 'content-type': 'image/jpeg' },
        stream: mockStream as any,
        finalUrl: validThumbUrl
      });

      const items = await service.buildThumbnailItems(validThumbUrl, { width: 236, height: 400 });
      expect(items).toHaveLength(1);
      expect(items[0]).toEqual({
        resolution: '236x',
        url: validThumbUrl,
        width: 236,
        height: 400,
        verified: true
      });
    });
  });
});
