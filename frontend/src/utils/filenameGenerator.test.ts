import { describe, it, expect } from 'vitest';
import {
  generateMediaFilename,
  resolveFilenameCollision,
  FilenameCollisionTracker,
  generateZipArchiveFilename,
  sanitizeComponent,
  parseValidDate,
  deriveMediaExtension
} from './filenameGenerator.js';

describe('filenameGenerator', () => {
  describe('Date Parsing', () => {
    it('parses valid dates from seconds, ms, strings, and Date objects', () => {
      expect(parseValidDate(1761400000)?.getUTCFullYear()).toBe(2025);
      expect(parseValidDate(1761400000000)?.getUTCFullYear()).toBe(2025);
      expect(parseValidDate('2026-10-25T00:00:00Z')?.getUTCFullYear()).toBe(2026);
      expect(parseValidDate(new Date('2026-10-25'))?.getUTCFullYear()).toBe(2026);
    });

    it('returns null for missing or invalid dates', () => {
      expect(parseValidDate(null)).toBeNull();
      expect(parseValidDate(undefined)).toBeNull();
      expect(parseValidDate('not-a-date')).toBeNull();
      expect(parseValidDate(-10)).toBeNull();
      expect(parseValidDate(100)).toBeNull(); // Year outside 2005-2099
    });
  });

  describe('Sanitization & Security', () => {
    it('strips leading @ from handles', () => {
      expect(sanitizeComponent('@shreya.1147')).toBe('shreya.1147');
      expect(sanitizeComponent('@@shreya.1147')).toBe('shreya.1147');
    });

    it('strips path traversal sequences (../, ..\\)', () => {
      expect(sanitizeComponent('../../etc/passwd')).toBe('etc_passwd');
      expect(sanitizeComponent('..\\..\\windows\\system32')).toBe('windows_system32');
    });

    it('removes forbidden characters and control codes', () => {
      expect(sanitizeComponent('user<name>:test"file|bar?*')).toBe('user_name_test_file_bar');
    });

    it('falls back to safe default if component is empty or only invalid characters', () => {
      expect(sanitizeComponent('')).toBe('unknown');
      expect(sanitizeComponent(null)).toBe('unknown');
      expect(sanitizeComponent('///')).toBe('unknown');
      expect(sanitizeComponent('   ')).toBe('unknown');
    });

    it('prevents Windows reserved device names', () => {
      expect(sanitizeComponent('CON')).toBe('snapora_CON');
      expect(sanitizeComponent('prn')).toBe('snapora_prn');
      expect(sanitizeComponent('NUL')).toBe('snapora_NUL');
      expect(sanitizeComponent('COM1')).toBe('snapora_COM1');
    });
  });

  describe('Extension Derivation', () => {
    it('derives mp4 for video types', () => {
      expect(deriveMediaExtension('video')).toBe('mp4');
      expect(deriveMediaExtension('video/mp4')).toBe('mp4');
    });

    it('derives jpg for image types and normalizes jpeg', () => {
      expect(deriveMediaExtension('image')).toBe('jpg');
      expect(deriveMediaExtension('image/jpeg')).toBe('jpg');
      expect(deriveMediaExtension(null, 'file.jpeg')).toBe('jpg');
    });

    it('derives webp when specified', () => {
      expect(deriveMediaExtension('image/webp')).toBe('webp');
      expect(deriveMediaExtension(null, 'asset.webp')).toBe('webp');
    });

    it('prefers explicit extension when supplied', () => {
      expect(deriveMediaExtension('image', null, 'mp4')).toBe('mp4');
      expect(deriveMediaExtension('image', null, '.png')).toBe('png');
    });
  });

  describe('Publication Date vs. Download Timestamp', () => {
    it('generates filename with publication date when takenAt is valid (Single Post)', () => {
      // shreya.1147_2026-10-25_DfBnbDEGJSx.jpg
      const result = generateMediaFilename({
        username: 'shreya.1147',
        shortcode: 'DfBnbDEGJSx',
        takenAt: '2026-10-25T12:00:00Z',
        mediaType: 'image'
      });
      expect(result).toBe('shreya.1147_2026-10-25_DfBnbDEGJSx.jpg');
    });

    it('generates filename with carousel slide number when takenAt is valid (Slide 1)', () => {
      // shreya.1147_2026-10-25_DfBnbDEGJSx_slide-01.jpg
      const result = generateMediaFilename({
        username: 'shreya.1147',
        shortcode: 'DfBnbDEGJSx',
        takenAt: '2026-10-25T12:00:00Z',
        slideNumber: 1,
        mediaType: 'image'
      });
      expect(result).toBe('shreya.1147_2026-10-25_DfBnbDEGJSx_slide-01.jpg');
    });

    it('formats epoch seconds into correct UTC date', () => {
      // 1761400000 = 2025-10-25T13:46:40Z
      const result = generateMediaFilename({
        username: 'travel_lover',
        shortcode: 'XYZ123',
        takenAt: 1761400000,
        mediaType: 'video'
      });
      expect(result).toBe('travel_lover_2025-10-25_XYZ123.mp4');
    });

    it('falls back to local download timestamp when takenAt is unavailable', () => {
      // shreya.1147_downloaded_2026-10-29_162845_DfBnbDEGJSx_slide-01.jpg
      const fixedDownloadDate = new Date(2026, 9, 29, 16, 28, 45); // Oct = month index 9
      const result = generateMediaFilename({
        username: 'shreya.1147',
        shortcode: 'DfBnbDEGJSx',
        takenAt: null,
        downloadedAt: fixedDownloadDate,
        slideNumber: 1,
        mediaType: 'image'
      });
      expect(result).toBe('shreya.1147_downloaded_2026-10-29_162845_DfBnbDEGJSx_slide-01.jpg');
    });

    it('supports 0-based slideIndex', () => {
      const fixedDownloadDate = new Date(2026, 9, 29, 16, 28, 45);
      const slide0 = generateMediaFilename({
        username: 'user',
        shortcode: 'CODE',
        slideIndex: 0,
        downloadedAt: fixedDownloadDate,
        mediaType: 'image'
      });
      expect(slide0).toBe('user_downloaded_2026-10-29_162845_CODE_slide-01.jpg');

      const slide9 = generateMediaFilename({
        username: 'user',
        shortcode: 'CODE',
        slideIndex: 9,
        downloadedAt: fixedDownloadDate,
        mediaType: 'image'
      });
      expect(slide9).toBe('user_downloaded_2026-10-29_162845_CODE_slide-10.jpg');
    });

    it('handles missing username and shortcode with safe fallbacks', () => {
      const fixedDownloadDate = new Date(2026, 9, 29, 12, 0, 0);
      const result = generateMediaFilename({
        downloadedAt: fixedDownloadDate,
        mediaType: 'image'
      });
      expect(result).toBe('instagram_user_downloaded_2026-10-29_120000_post.jpg');
    });
  });

  describe('Collision Handling', () => {
    it('returns candidate unchanged if no collision exists', () => {
      const existing = new Set(['foo.jpg', 'bar.jpg']);
      expect(resolveFilenameCollision('shreya_post.jpg', existing)).toBe('shreya_post.jpg');
    });

    it('appends incrementing suffix before extension on collision', () => {
      const existing = new Set([
        'shreya_post.jpg',
        'shreya_post_1.jpg',
        'shreya_post_2.jpg'
      ]);
      const result = resolveFilenameCollision('shreya_post.jpg', existing);
      expect(result).toBe('shreya_post_3.jpg');
    });

    it('works correctly with FilenameCollisionTracker', () => {
      const tracker = new FilenameCollisionTracker();
      const first = tracker.getUniqueFilename('photo.jpg');
      const second = tracker.getUniqueFilename('photo.jpg');
      const third = tracker.getUniqueFilename('photo.jpg');

      expect(first).toBe('photo.jpg');
      expect(second).toBe('photo_1.jpg');
      expect(third).toBe('photo_2.jpg');
      expect(tracker.size).toBe(3);
    });
  });

  describe('ZIP Archive Filename', () => {
    it('formats default ZIP archive filename with local timestamp', () => {
      const testDate = new Date(2026, 9, 29, 16, 30, 0);
      expect(generateZipArchiveFilename(testDate)).toBe('Snapora_Download_2026-10-29_163000.zip');
    });

    it('supports custom prefix for album downloads', () => {
      const testDate = new Date(2026, 9, 29, 16, 30, 0);
      expect(generateZipArchiveFilename(testDate, 'shreya_DfBnbDEGJSx')).toBe(
        'shreya_DfBnbDEGJSx_2026-10-29_163000.zip'
      );
    });
  });
});
