import { describe, it, expect } from 'vitest';
import {
  calculateMetadataExpiration,
  isMetadataExpired,
  isMetadataStale,
  purgeExpiredYouTubeMetadata,
  YOUTUBE_DATA_RETENTION_MS
} from './retention.js';

describe('YouTube Data Retention & 30-Day Expiration Policy Suite', () => {
  it('calculates exactly 30 days expiration window in UTC ISO format', () => {
    const baseTime = new Date('2026-11-01T12:00:00.000Z');
    const { metadataFetchedAt, metadataExpiresAt } = calculateMetadataExpiration(baseTime);

    expect(metadataFetchedAt).toBe('2026-11-01T12:00:00.000Z');
    const expectedExpires = new Date(baseTime.getTime() + YOUTUBE_DATA_RETENTION_MS).toISOString();
    expect(metadataExpiresAt).toBe(expectedExpires);
    // Confirm 30 days = 2592000000ms
    expect(Date.parse(metadataExpiresAt) - Date.parse(metadataFetchedAt)).toBe(30 * 24 * 60 * 60 * 1000);
  });

  describe('isMetadataExpired', () => {
    const fetchedAt = new Date('2026-11-01T00:00:00.000Z');
    const { metadataExpiresAt } = calculateMetadataExpiration(fetchedAt);

    it('returns false when current time is within 30 days', () => {
      const now = new Date('2026-11-15T00:00:00.000Z'); // 14 days in
      expect(isMetadataExpired(metadataExpiresAt, now)).toBe(false);
    });

    it('returns true when current time is past 30 days', () => {
      const now = new Date('2026-12-05T00:00:00.000Z'); // 34 days in
      expect(isMetadataExpired(metadataExpiresAt, now)).toBe(true);
    });

    it('treats missing, null, or unversioned expiration as expired (fail safe)', () => {
      expect(isMetadataExpired(null)).toBe(true);
      expect(isMetadataExpired(undefined)).toBe(true);
      expect(isMetadataExpired('invalid-date')).toBe(true);
    });
  });

  describe('isMetadataStale proactive refresh check', () => {
    const fetchedAt = new Date('2026-11-01T00:00:00.000Z');
    const { metadataExpiresAt } = calculateMetadataExpiration(fetchedAt);

    it('returns false when more than 5 days remain', () => {
      const now = new Date('2026-11-20T00:00:00.000Z'); // 11 days remaining
      expect(isMetadataStale(metadataExpiresAt, 5, now)).toBe(false);
    });

    it('returns true when less than 5 days remain', () => {
      const now = new Date('2026-11-27T00:00:00.000Z'); // 4 days remaining
      expect(isMetadataStale(metadataExpiresAt, 5, now)).toBe(true);
    });
  });

  describe('purgeExpiredYouTubeMetadata', () => {
    const record = {
      id: 'job_yt_123',
      originalUrl: 'https://youtu.be/dQw4w9WgXcQ',
      canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      contentId: 'dQw4w9WgXcQ',
      platform: 'youtube',
      createdAt: 1730000000000,
      userNotes: 'My favorite music video',
      userTags: ['music', 'retro'],
      collectionId: 'col_888',
      title: 'Rick Astley - Never Gonna Give You Up',
      description: 'Official Rick Astley video description...',
      author: 'Rick Astley',
      authorUrl: 'https://www.youtube.com/@RickAstleyYT',
      durationSeconds: 213,
      durationFormatted: '03:33',
      publishedAt: '2009-10-25T06:57:33Z',
      thumbnails: [
        { resolution: 'hqdefault', url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg', width: 480, height: 360 }
      ],
      preview: {
        type: 'thumbnail',
        title: 'Rick Astley - Never Gonna Give You Up',
        metadataExpiresAt: '2026-12-01T00:00:00.000Z'
      },
      metadataExpiresAt: '2026-12-01T00:00:00.000Z'
    };

    it('preserves entire record when within valid 30-day window', () => {
      const validTime = new Date('2026-11-15T00:00:00.000Z');
      const sanitized = purgeExpiredYouTubeMetadata(record, validTime);

      expect(sanitized.title).toBe('Rick Astley - Never Gonna Give You Up');
      expect(sanitized.description).toBeDefined();
      expect(sanitized.isStale).toBeUndefined();
    });

    it('purges API-derived fields while strictly preserving user-created records when expired', () => {
      const expiredTime = new Date('2026-12-05T00:00:00.000Z'); // After Dec 1, 2026
      const sanitized = purgeExpiredYouTubeMetadata(record, expiredTime);

      // User-created fields PRESERVED
      expect(sanitized.id).toBe('job_yt_123');
      expect(sanitized.originalUrl).toBe('https://youtu.be/dQw4w9WgXcQ');
      expect(sanitized.canonicalUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(sanitized.contentId).toBe('dQw4w9WgXcQ');
      expect(sanitized.platform).toBe('youtube');
      expect(sanitized.createdAt).toBe(1730000000000);
      expect(sanitized.userNotes).toBe('My favorite music video');
      expect(sanitized.userTags).toEqual(['music', 'retro']);
      expect(sanitized.collectionId).toBe('col_888');

      // Provider-derived fields PURGED
      expect(sanitized.title).toBeUndefined();
      expect(sanitized.description).toBeUndefined();
      expect(sanitized.author).toBeUndefined();
      expect(sanitized.authorUrl).toBeUndefined();
      expect(sanitized.durationSeconds).toBeUndefined();
      expect(sanitized.thumbnails).toBeUndefined();

      // State marked as stale/expired
      expect(sanitized.isStale).toBe(true);
      expect(sanitized.metadataCapability).toBe('UNAVAILABLE');
      expect(sanitized.preview.isStale).toBe(true);
      expect(sanitized.preview.title).toContain('[Metadata Expired - Please Refresh]');
    });
  });
});
