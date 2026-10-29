import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateClientMediaBytes,
  buildAndDownloadZip,
  MAX_ZIP_ITEMS
} from './zipDownloader.js';
import { MediaItem } from '../types/queue.js';
import JSZip from 'jszip';

describe('zipDownloader', () => {
  describe('Binary Media Byte Validation', () => {
    it('recognizes authentic JPEG file signatures (FF D8 FF)', () => {
      const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
      const res = validateClientMediaBytes(bytes);
      expect(res.valid).toBe(true);
      expect(res.detectedType).toBe('image/jpeg');
    });

    it('recognizes authentic MP4 file signatures (ftyp)', () => {
      // 4 bytes size + 'ftyp' (0x66, 0x74, 0x79, 0x70) + 'isom'
      const bytes = new Uint8Array([
        0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00
      ]);
      const res = validateClientMediaBytes(bytes);
      expect(res.valid).toBe(true);
      expect(res.detectedType).toBe('video/mp4');
    });

    it('recognizes authentic WebP file signatures (RIFF....WEBP)', () => {
      const bytes = new Uint8Array([
        0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20
      ]);
      const res = validateClientMediaBytes(bytes);
      expect(res.valid).toBe(true);
      expect(res.detectedType).toBe('image/webp');
    });

    it('recognizes authentic PNG file signatures', () => {
      const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
      const res = validateClientMediaBytes(bytes);
      expect(res.valid).toBe(true);
      expect(res.detectedType).toBe('image/png');
    });

    it('strictly rejects HTML error responses disguised as media', () => {
      const htmlText = '<!DOCTYPE html><html><body>Error 404 Not Found</body></html>';
      const bytes = new TextEncoder().encode(htmlText);
      const res = validateClientMediaBytes(bytes);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Received HTML/text/JSON response');
    });

    it('strictly rejects JSON error responses', () => {
      const jsonText = '{"error": {"code": "CONTENT_PRIVATE", "message": "Private"}}';
      const bytes = new TextEncoder().encode(jsonText);
      const res = validateClientMediaBytes(bytes);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Received HTML/text/JSON response');
    });

    it('rejects truncated header buffers shorter than 12 bytes', () => {
      const shortBytes = new Uint8Array([0xff, 0xd8, 0xff]);
      const res = validateClientMediaBytes(shortBytes);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('too short');
    });
  });

  describe('Archive Limits and Safeguards', () => {
    it('returns error when item list is empty', async () => {
      const res = await buildAndDownloadZip({
        items: [],
        apiBaseUrl: 'http://localhost:3000'
      });
      expect(res.success).toBe(false);
      expect(res.error).toBe('No items eligible for archive creation');
    });

    it('enforces maximum item count limit', async () => {
      const excessiveItems = Array.from({ length: MAX_ZIP_ITEMS + 1 }, (_, i) => ({
        jobId: `job_${i}`,
        item: {
          id: `item_${i}`,
          filename: `photo_${i}.jpg`,
          type: 'image' as const,
          url: `https://example.com/${i}.jpg`,
          downloadable: true
        } as MediaItem
      }));

      const res = await buildAndDownloadZip({
        items: excessiveItems,
        apiBaseUrl: 'http://localhost:3000'
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain(`maximum allowed archive limit of ${MAX_ZIP_ITEMS}`);
    });
  });

  describe('Archive Construction and Collision Avoidance', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('assembles valid ZIP archive with verified media bytes', async () => {
      const validJpegBytes = new Uint8Array([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48
      ]);

      // Mock global fetch to return valid JPEG bytes
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          headers: new Headers({ 'content-type': 'image/jpeg' }),
          blob: async () => new Blob([validJpegBytes], { type: 'image/jpeg' })
        })
      );

      // Mock document.createElement / appendChild / click to avoid DOM errors in test runner
      const mockClick = vi.fn();
      vi.spyOn(document, 'createElement').mockReturnValue({
        set href(_val: string) {},
        set download(_val: string) {},
        set target(_val: string) {},
        set rel(_val: string) {},
        click: mockClick
      } as any);
      vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
      vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);
      vi.stubGlobal('URL', {
        createObjectURL: vi.fn().mockReturnValue('blob:mock-url'),
        revokeObjectURL: vi.fn()
      });

      const items = [
        {
          jobId: 'job_1',
          item: {
            id: 'item_1',
            filename: 'creator_2026-10-25_shortcode_slide-01.jpg',
            type: 'image' as const,
            url: 'https://scontent.cdninstagram.com/photo1.jpg',
            downloadable: true
          } as MediaItem
        },
        {
          jobId: 'job_1',
          item: {
            id: 'item_2',
            filename: 'creator_2026-10-25_shortcode_slide-02.jpg',
            type: 'image' as const,
            url: 'https://scontent.cdninstagram.com/photo2.jpg',
            downloadable: true
          } as MediaItem
        }
      ];

      const res = await buildAndDownloadZip({
        items,
        apiBaseUrl: 'http://localhost:3000'
      });

      expect(res.success).toBe(true);
      expect(res.completed).toBe(2);
      expect(res.failed).toBe(0);
      expect(res.archiveName).toMatch(/^Snapora_Download_\d{4}-\d{2}-\d{2}_\d{6}\.zip$/);
      expect(mockClick).toHaveBeenCalledTimes(1);

      // Verify the generated ZIP is readable and contains our filenames
      expect(res.blob).toBeDefined();
      const loadedZip = await JSZip.loadAsync(res.blob!);
      expect(loadedZip.file('creator_2026-10-25_shortcode_slide-01.jpg')).not.toBeNull();
      expect(loadedZip.file('creator_2026-10-25_shortcode_slide-02.jpg')).not.toBeNull();
    });

    it('resolves duplicate filenames inside the archive without overwriting entries', async () => {
      const validJpegBytes = new Uint8Array([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48
      ]);

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          headers: new Headers({ 'content-type': 'image/jpeg' }),
          blob: async () => new Blob([validJpegBytes], { type: 'image/jpeg' })
        })
      );

      vi.spyOn(document, 'createElement').mockReturnValue({
        set href(_val: string) {},
        set download(_val: string) {},
        click: vi.fn()
      } as any);
      vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
      vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);
      vi.stubGlobal('URL', {
        createObjectURL: vi.fn().mockReturnValue('blob:mock-url'),
        revokeObjectURL: vi.fn()
      });

      // Intentionally passing duplicate filenames to test collision handling
      const items = [
        {
          jobId: 'job_1',
          item: {
            id: 'item_1',
            filename: 'photo.jpg',
            type: 'image' as const,
            url: 'https://example.com/1.jpg',
            downloadable: true
          } as MediaItem
        },
        {
          jobId: 'job_2',
          item: {
            id: 'item_2',
            filename: 'photo.jpg',
            type: 'image' as const,
            url: 'https://example.com/2.jpg',
            downloadable: true
          } as MediaItem
        }
      ];

      const res = await buildAndDownloadZip({
        items,
        apiBaseUrl: 'http://localhost:3000'
      });

      expect(res.success).toBe(true);
      expect(res.completed).toBe(2);

      const loadedZip = await JSZip.loadAsync(res.blob!);
      expect(loadedZip.file('photo.jpg')).not.toBeNull();
      expect(loadedZip.file('photo_1.jpg')).not.toBeNull();
    });

    it('excludes failed items from the archive and reports partial success', async () => {
      const validJpegBytes = new Uint8Array([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48
      ]);

      // First fetch succeeds, second fetch returns HTML error
      vi.stubGlobal(
        'fetch',
        vi.fn()
          .mockResolvedValueOnce({
            ok: true,
            headers: new Headers({ 'content-type': 'image/jpeg' }),
            blob: async () => new Blob([validJpegBytes], { type: 'image/jpeg' })
          })
          .mockResolvedValueOnce({
            ok: false,
            status: 404,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ error: { message: 'Item not found' } })
          })
      );

      vi.spyOn(document, 'createElement').mockReturnValue({
        set href(_val: string) {},
        set download(_val: string) {},
        click: vi.fn()
      } as any);
      vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
      vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);
      vi.stubGlobal('URL', {
        createObjectURL: vi.fn().mockReturnValue('blob:mock-url'),
        revokeObjectURL: vi.fn()
      });

      const items = [
        {
          jobId: 'job_1',
          item: {
            id: 'success_1',
            filename: 'good_photo.jpg',
            type: 'image' as const,
            url: 'https://example.com/good.jpg',
            downloadable: true
          } as MediaItem
        },
        {
          jobId: 'job_1',
          item: {
            id: 'fail_1',
            filename: 'bad_photo.jpg',
            type: 'image' as const,
            url: 'https://example.com/bad.jpg',
            downloadable: true
          } as MediaItem
        }
      ];

      const res = await buildAndDownloadZip({
        items,
        apiBaseUrl: 'http://localhost:3000'
      });

      expect(res.success).toBe(true);
      expect(res.completed).toBe(1);
      expect(res.failed).toBe(1);
      expect(res.failedItemIds).toEqual(['fail_1']);

      const loadedZip = await JSZip.loadAsync(res.blob!);
      expect(loadedZip.file('good_photo.jpg')).not.toBeNull();
      expect(loadedZip.file('bad_photo.jpg')).toBeNull();
    });
  });
});
