import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateMetadataExpiration,
  isMetadataExpired,
  isMetadataStale,
  purgeExpiredYouTubeMetadata,
  YOUTUBE_DATA_RETENTION_MS
} from './retention.js';
import { MetadataCache } from '../../utils/resilience.js';

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
      notes: 'User custom notes on YouTube video',
      tags: ['music', 'retro', 'favorites'],
      collections: ['col_888', 'col_999'],
      title: 'Rick Astley - Never Gonna Give You Up',
      description: 'Official Rick Astley video description...',
      author: 'Rick Astley',
      authorUrl: 'https://www.youtube.com/@RickAstleyYT',
      durationSeconds: 213,
      durationFormatted: '03:33',
      publishedAt: '2009-10-25T06:57:33Z',
      embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
      isEmbeddable: true,
      embeddingAllowed: true,
      embedStatus: 'allowed',
      thumbnails: [
        { resolution: 'hqdefault', url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg', width: 480, height: 360 }
      ],
      preview: {
        type: 'thumbnail',
        title: 'Rick Astley - Never Gonna Give You Up',
        embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
        isEmbeddable: true,
        embeddingAllowed: true,
        embedStatus: 'allowed',
        metadataExpiresAt: '2026-12-01T00:00:00.000Z'
      },
      metadataExpiresAt: '2026-12-01T00:00:00.000Z'
    };

    it('preserves entire record when within valid 30-day window', () => {
      const validTime = new Date('2026-11-15T00:00:00.000Z');
      const sanitized = purgeExpiredYouTubeMetadata(record, validTime);

      expect(sanitized.title).toBe('Rick Astley - Never Gonna Give You Up');
      expect(sanitized.description).toBeDefined();
      expect(sanitized.embedUrl).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
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
      expect(sanitized.notes).toBe('User custom notes on YouTube video');
      expect(sanitized.tags).toEqual(['music', 'retro', 'favorites']);
      expect(sanitized.collections).toEqual(['col_888', 'col_999']);

      // Provider-derived fields PURGED
      expect(sanitized.title).toBeUndefined();
      expect(sanitized.description).toBeUndefined();
      expect(sanitized.author).toBeUndefined();
      expect(sanitized.authorUrl).toBeUndefined();
      expect(sanitized.durationSeconds).toBeUndefined();
      expect(sanitized.thumbnails).toBeUndefined();
      expect(sanitized.embedUrl).toBeUndefined();
      expect(sanitized.isEmbeddable).toBe(false);
      expect(sanitized.embeddingAllowed).toBe(false);
      expect(sanitized.embedStatus).toBe('disabled');

      // State marked as stale/expired
      expect(sanitized.isStale).toBe(true);
      expect(sanitized.metadataCapability).toBe('UNAVAILABLE');
      expect(sanitized.preview.isStale).toBe(true);
      expect(sanitized.preview.embedUrl).toBeUndefined();
      expect(sanitized.preview.title).toContain('[Metadata Expired - Please Refresh]');
    });

    it('resets expiration timestamps to a new 30-day window upon refresh', () => {
      const initialFetch = new Date('2026-11-01T00:00:00.000Z');
      const initialTimestamps = calculateMetadataExpiration(initialFetch);
      expect(initialTimestamps.metadataExpiresAt).toBe('2026-12-01T00:00:00.000Z');

      // Refresh occurs 25 days later
      const refreshFetch = new Date('2026-11-26T00:00:00.000Z');
      const refreshedTimestamps = calculateMetadataExpiration(refreshFetch);
      expect(refreshedTimestamps.metadataFetchedAt).toBe('2026-11-26T00:00:00.000Z');
      expect(refreshedTimestamps.metadataExpiresAt).toBe('2026-12-26T00:00:00.000Z');
      expect(Date.parse(refreshedTimestamps.metadataExpiresAt) > Date.parse(initialTimestamps.metadataExpiresAt)).toBe(true);
    });
  });

  describe('MetadataCache Retention Integration', () => {
    let cache: MetadataCache;

    beforeEach(() => {
      cache = new MetadataCache(10);
    });

    it('rejects caching records whose metadata retention has already expired', () => {
      const expiredRecord: any = {
        ok: true,
        status: 'live_metadata_retrieved',
        provider: 'youtube',
        shortcode: '123',
        canonicalUrl: 'https://www.youtube.com/watch?v=123',
        metadataExpiresAt: new Date(Date.now() - 1000).toISOString() // 1 second ago
      };

      cache.set('youtube:123', expiredRecord, 'post');
      expect(cache.get('youtube:123')).toBeNull();
      expect(cache.size).toBe(0);
    });

    it('evicts and returns null when cached entry retention expires during storage', () => {
      const freshRecord: any = {
        ok: true,
        status: 'live_metadata_retrieved',
        provider: 'youtube',
        shortcode: '456',
        canonicalUrl: 'https://www.youtube.com/watch?v=456',
        metadataExpiresAt: new Date(Date.now() + 50000).toISOString() // fresh initially
      };

      cache.set('youtube:456', freshRecord, 'post');
      expect(cache.get('youtube:456')).not.toBeNull();

      // Simulate expiration of the stored metadata
      const entry = (cache as any).cache.get('youtube:456');
      entry.value.metadataExpiresAt = new Date(Date.now() - 1000).toISOString();

      expect(cache.get('youtube:456')).toBeNull();
      expect(cache.size).toBe(0);
    });
  });
});
