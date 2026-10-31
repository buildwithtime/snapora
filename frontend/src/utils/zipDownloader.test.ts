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

    it('recognizes authentic MP4 with ftyp preceded by wide atom or moov atom', () => {
      // 8 bytes 'wide' atom followed by 'ftyp'
      const wideBytes = new Uint8Array([
        0x00, 0x00, 0x00, 0x08, 0x77, 0x69, 0x64, 0x65,
        0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70,
        0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00
      ]);
      const resWide = validateClientMediaBytes(wideBytes);
      expect(resWide.valid).toBe(true);
      expect(resWide.detectedType).toBe('video/mp4');

      const moovBytes = new Uint8Array([
        0x00, 0x00, 0x01, 0x00, 0x6d, 0x6f, 0x6f, 0x76, 0x00, 0x00, 0x00, 0x6c
      ]);
      const resMoov = validateClientMediaBytes(moovBytes);
      expect(resMoov.valid).toBe(true);
      expect(resMoov.detectedType).toBe('video/mp4');
    });

    it('recognizes authentic WebM / Matroska video container (1A 45 DF A3)', () => {
      const webmBytes = new Uint8Array([
        0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81
      ]);
      const res = validateClientMediaBytes(webmBytes);
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

    it('strictly rejects arbitrary scripts or text containing "ftyp" without ISO atom headers', () => {
      const scriptBytes = new TextEncoder().encode('console.log("ftyp inside string"); var x = 42;');
      const res = validateClientMediaBytes(scriptBytes);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('does not match any supported media format');
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

    it('rejects queue with 225 items (large batch) with actionable guidance', async () => {
      const largeBatchItems = Array.from({ length: 225 }, (_, i) => ({
        jobId: `job_${i}`,
        item: {
          id: `item_${i}`,
          filename: `reel_${i}.mp4`,
          type: 'video' as const,
          url: `https://example.com/reel_${i}.mp4`,
          downloadable: true
        } as MediaItem
      }));

      const res = await buildAndDownloadZip({
        items: largeBatchItems,
        apiBaseUrl: 'http://localhost:3000'
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain(`maximum allowed archive limit of ${MAX_ZIP_ITEMS}`);
      expect(res.error).toContain('225 items');
    });

    it('reports progress updates through the onProgress callback during generation', async () => {
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
      vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
      vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);
      vi.stubGlobal('URL', {
        createObjectURL: vi.fn().mockReturnValue('blob:mock-url'),
        revokeObjectURL: vi.fn()
      });

      const progressUpdates: any[] = [];
      const items = [
        {
          jobId: 'job_p1',
          item: {
            id: 'item_p1',
            filename: 'photo1.jpg',
            type: 'image' as const,
            url: 'https://example.com/p1.jpg',
            downloadable: true
          } as MediaItem
        },
        {
          jobId: 'job_p2',
          item: {
            id: 'item_p2',
            filename: 'photo2.jpg',
            type: 'image' as const,
            url: 'https://example.com/p2.jpg',
            downloadable: true
          } as MediaItem
        }
      ];

      const res = await buildAndDownloadZip({
        items,
        apiBaseUrl: 'http://localhost:3000',
        onProgress: (p) => progressUpdates.push({ ...p })
      });

      expect(res.success).toBe(true);
      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates.some((p) => p.phase === 'fetching')).toBe(true);
      expect(progressUpdates.some((p) => p.phase === 'compressing' || p.phase === 'completed')).toBe(true);
    });
  });

  describe('Archive Construction and Collision Avoidance', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
      vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
      vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);
      vi.stubGlobal('URL', {
        createObjectURL: vi.fn().mockReturnValue('blob:mock-url'),
        revokeObjectURL: vi.fn()
      });
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

    it('successfully archives 3 photos with verified signatures into a single ZIP', async () => {
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

      const mockClick = vi.fn();
      vi.spyOn(document, 'createElement').mockReturnValue({
        set href(_val: string) {},
        set download(_val: string) {},
        click: mockClick
      } as any);
      vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
      vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);
      vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
      vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);

      const photoItems = [
        { jobId: 'j1', item: { id: 'p1', filename: 'photo_01.jpg', type: 'image' as const, url: 'https://cdn.example.com/p1.jpg', downloadable: true } as MediaItem },
        { jobId: 'j1', item: { id: 'p2', filename: 'photo_02.jpg', type: 'image' as const, url: 'https://cdn.example.com/p2.jpg', downloadable: true } as MediaItem },
        { jobId: 'j1', item: { id: 'p3', filename: 'photo_03.jpg', type: 'image' as const, url: 'https://cdn.example.com/p3.jpg', downloadable: true } as MediaItem }
      ];

      const res = await buildAndDownloadZip({
        items: photoItems,
        apiBaseUrl: 'http://localhost:3000'
      });

      expect(res.success).toBe(true);
      expect(res.completed).toBe(3);
      expect(res.failed).toBe(0);
      expect(mockClick).toHaveBeenCalledTimes(1);

      const zip = await JSZip.loadAsync(res.blob!);
      expect(zip.file('photo_01.jpg')).not.toBeNull();
      expect(zip.file('photo_02.jpg')).not.toBeNull();
      expect(zip.file('photo_03.jpg')).not.toBeNull();
    });

    it('successfully archives 2 MP4 videos with verified signatures into a single ZIP', async () => {
      const validMp4Bytes = new Uint8Array([
        0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00
      ]);

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          headers: new Headers({ 'content-type': 'video/mp4' }),
          blob: async () => new Blob([validMp4Bytes], { type: 'video/mp4' })
        })
      );

      const mockClick = vi.fn();
      vi.spyOn(document, 'createElement').mockReturnValue({
        set href(_val: string) {},
        set download(_val: string) {},
        click: mockClick
      } as any);
      vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
      vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);

      const videoItems = [
        { jobId: 'j2', item: { id: 'v1', filename: 'reel_01.mp4', type: 'video' as const, url: 'https://cdn.example.com/v1.mp4', downloadable: true } as MediaItem },
        { jobId: 'j2', item: { id: 'v2', filename: 'reel_02.mp4', type: 'video' as const, url: 'https://cdn.example.com/v2.mp4', downloadable: true } as MediaItem }
      ];

      const res = await buildAndDownloadZip({
        items: videoItems,
        apiBaseUrl: 'http://localhost:3000'
      });

      expect(res.success).toBe(true);
      expect(res.completed).toBe(2);
      expect(res.failed).toBe(0);
      expect(mockClick).toHaveBeenCalledTimes(1);

      const zip = await JSZip.loadAsync(res.blob!);
      expect(zip.file('reel_01.mp4')).not.toBeNull();
      expect(zip.file('reel_02.mp4')).not.toBeNull();
    });

    it('successfully archives mixed media (photos and videos)', async () => {
      const validJpegBytes = new Uint8Array([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01
      ]);
      const validMp4Bytes = new Uint8Array([
        0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d
      ]);

      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((url: string) => {
          if (url.includes('.mp4')) {
            return Promise.resolve({
              ok: true,
              headers: new Headers({ 'content-type': 'video/mp4' }),
              blob: async () => new Blob([validMp4Bytes], { type: 'video/mp4' })
            });
          }
          return Promise.resolve({
            ok: true,
            headers: new Headers({ 'content-type': 'image/jpeg' }),
            blob: async () => new Blob([validJpegBytes], { type: 'image/jpeg' })
          });
        })
      );

      vi.spyOn(document, 'createElement').mockReturnValue({
        set href(_val: string) {},
        set download(_val: string) {},
        click: vi.fn()
      } as any);
      vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
      vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);

      const mixedItems = [
        { jobId: 'j3', item: { id: 'p1', filename: 'photo1.jpg', type: 'image' as const, url: 'https://cdn.example.com/p1.jpg', downloadable: true } as MediaItem },
        { jobId: 'j3', item: { id: 'v1', filename: 'video1.mp4', type: 'video' as const, url: 'https://cdn.example.com/v1.mp4', downloadable: true } as MediaItem },
        { jobId: 'j3', item: { id: 'p2', filename: 'photo2.jpg', type: 'image' as const, url: 'https://cdn.example.com/p2.jpg', downloadable: true } as MediaItem },
        { jobId: 'j3', item: { id: 'v2', filename: 'video2.mp4', type: 'video' as const, url: 'https://cdn.example.com/v2.mp4', downloadable: true } as MediaItem }
      ];

      const res = await buildAndDownloadZip({
        items: mixedItems,
        apiBaseUrl: 'http://localhost:3000'
      });

      expect(res.success).toBe(true);
      expect(res.completed).toBe(4);
      expect(res.failed).toBe(0);

      const zip = await JSZip.loadAsync(res.blob!);
      expect(zip.file('photo1.jpg')).not.toBeNull();
      expect(zip.file('video1.mp4')).not.toBeNull();
      expect(zip.file('photo2.jpg')).not.toBeNull();
      expect(zip.file('video2.mp4')).not.toBeNull();
    });

    it('halts adding files and reports limit when aggregate size exceeds 500 MB', async () => {
      const validJpegBytes = new Uint8Array([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01
      ]);

      // Mock blob whose .size property reports 300 MB
      const createOversizedBlob = () => {
        const b = new Blob([validJpegBytes], { type: 'image/jpeg' });
        Object.defineProperty(b, 'size', { value: 300 * 1024 * 1024 }); // 300 MB
        return b;
      };

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          headers: new Headers({ 'content-type': 'image/jpeg' }),
          blob: async () => createOversizedBlob()
        })
      );

      vi.spyOn(document, 'createElement').mockReturnValue({
        set href(_val: string) {},
        set download(_val: string) {},
        click: vi.fn()
      } as any);
      vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
      vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);

      // Two 300 MB items = 600 MB > 500 MB limit
      const items = [
        { jobId: 'j4', item: { id: 'big_1', filename: 'big1.jpg', type: 'image' as const, url: 'https://cdn.example.com/b1.jpg', downloadable: true } as MediaItem },
        { jobId: 'j4', item: { id: 'big_2', filename: 'big2.jpg', type: 'image' as const, url: 'https://cdn.example.com/b2.jpg', downloadable: true } as MediaItem }
      ];

      const itemStatuses: any[] = [];
      const res = await buildAndDownloadZip({
        items,
        apiBaseUrl: 'http://localhost:3000',
        onItemStatus: (jobId, itemId, status, err) => {
          itemStatuses.push({ jobId, itemId, status, err });
        }
      });

      // First item succeeds (300 MB), second item exceeds 500 MB ceiling and is halted
      expect(res.success).toBe(true);
      expect(res.completed).toBe(1);
      expect(res.failed).toBe(1);
      expect(res.failedItemIds).toContain('big_2');
      expect(itemStatuses.some((s) => s.err?.includes('exceeds limit of 500 MB'))).toBe(true);
    });

    it('returns clear error when all media items in ZIP request fail', async () => {
      // Mock all fetches failing with 404
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 404,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ error: { message: 'Not found' } })
        })
      );

      const items = [
        { jobId: 'j5', item: { id: 'f1', filename: 'fail1.jpg', type: 'image' as const, url: 'https://cdn.example.com/f1.jpg', downloadable: true } as MediaItem },
        { jobId: 'j5', item: { id: 'f2', filename: 'fail2.jpg', type: 'image' as const, url: 'https://cdn.example.com/f2.jpg', downloadable: true } as MediaItem }
      ];

      const res = await buildAndDownloadZip({
        items,
        apiBaseUrl: 'http://localhost:3000'
      });

      expect(res.success).toBe(false);
      expect(res.completed).toBe(0);
      expect(res.failed).toBe(2);
      expect(res.error).toBe('All media items failed verification. No archive was generated.');
    });
  });
});
