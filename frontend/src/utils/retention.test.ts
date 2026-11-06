import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateMetadataExpiration,
  isMetadataExpired,
  isMetadataStale,
  purgeExpiredJobMetadata,
  YOUTUBE_DATA_RETENTION_MS
} from './retention.js';
import { QueueJob } from '../types/queue.js';
import { getRecentDownloads, addRecentDownload, clearRecentDownloads } from './recentHistory.js';

describe('Frontend YouTube Retention & Expiration Lifecycle Suite', () => {
  describe('Timestamps & Expiration Calculation', () => {
    it('calculates 30-day retention window in ISO string format', () => {
      const start = new Date('2026-11-01T00:00:00.000Z');
      const { metadataFetchedAt, metadataExpiresAt } = calculateMetadataExpiration(start);
      expect(metadataFetchedAt).toBe('2026-11-01T00:00:00.000Z');
      expect(Date.parse(metadataExpiresAt) - Date.parse(metadataFetchedAt)).toBe(YOUTUBE_DATA_RETENTION_MS);
    });

    it('identifies expired and fresh timestamps accurately', () => {
      const future = new Date(Date.now() + 100000).toISOString();
      const past = new Date(Date.now() - 100000).toISOString();

      expect(isMetadataExpired(future)).toBe(false);
      expect(isMetadataExpired(past)).toBe(true);
      expect(isMetadataExpired(null)).toBe(false); // only expires if metadataExpiresAt set
    });

    it('identifies stale timestamps within 5-day proactive refresh window', () => {
      const threeDaysLeft = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
      const tenDaysLeft = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();

      expect(isMetadataStale(threeDaysLeft, 5)).toBe(true);
      expect(isMetadataStale(tenDaysLeft, 5)).toBe(false);
    });
  });

  describe('purgeExpiredJobMetadata Lifecycle Operation', () => {
    const expiredDate = new Date(Date.now() - 10000).toISOString();
    const freshDate = new Date(Date.now() + 1000000).toISOString();

    const sampleJob: QueueJob = {
      id: 'job_test_1',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      normalizedUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      shortcode: 'dQw4w9WgXcQ',
      contentId: 'dQw4w9WgXcQ',
      platform: 'youtube',
      status: 'ready',
      createdAt: 1730000000000,
      title: 'Rick Astley - Never Gonna Give You Up',
      author: 'Rick Astley',
      authorUrl: 'https://www.youtube.com/@RickAstleyYT',
      description: 'Music video',
      durationSeconds: 213,
      durationFormatted: '03:33',
      publishedAt: '2009-10-25T06:57:33Z',
      embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
      isEmbeddable: true,
      embeddingAllowed: true,
      embedStatus: 'allowed',
      metadataCapability: 'FULL_METADATA',
      metadataExpiresAt: expiredDate,
      notes: 'User custom review notes',
      tags: ['80s', 'classic', 'pop'],
      collections: ['fav_music'],
      retryCount: 0,
      media: [
        {
          type: 'image',
          url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
          filename: 'youtube_dQw4w9WgXcQ_hqdefault.jpg'
        }
      ],
      preview: {
        type: 'thumbnail',
        title: 'Rick Astley - Never Gonna Give You Up',
        authorName: 'Rick Astley',
        thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
        embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
        metadataExpiresAt: expiredDate
      }
    };

    it('purges API-derived metadata while strictly preserving user notes, tags, and collections', () => {
      const purged = purgeExpiredJobMetadata(sampleJob);

      // User-created fields PRESERVED
      expect(purged.id).toBe('job_test_1');
      expect(purged.url).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(purged.normalizedUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(purged.shortcode).toBe('dQw4w9WgXcQ');
      expect(purged.contentId).toBe('dQw4w9WgXcQ');
      expect(purged.platform).toBe('youtube');
      expect(purged.createdAt).toBe(1730000000000);
      expect(purged.notes).toBe('User custom review notes');
      expect(purged.tags).toEqual(['80s', 'classic', 'pop']);
      expect(purged.collections).toEqual(['fav_music']);

      // API metadata PURGED
      expect(purged.title).toBeUndefined();
      expect(purged.author).toBeUndefined();
      expect(purged.authorUrl).toBeUndefined();
      expect(purged.description).toBeUndefined();
      expect(purged.durationSeconds).toBeUndefined();
      expect(purged.embedUrl).toBeUndefined();
      expect(purged.media).toEqual([]);
      expect(purged.isEmbeddable).toBe(false);
      expect(purged.embeddingAllowed).toBe(false);
      expect(purged.embedStatus).toBe('disabled');

      // State marked as stale & unavailable
      expect(purged.isStale).toBe(true);
      expect(purged.metadataCapability).toBe('UNAVAILABLE');
      expect(purged.preview?.title).toBe('[Metadata Expired - Please Refresh]');
      expect(purged.preview?.thumbnailUrl).toBeUndefined();
      expect(purged.preview?.embedUrl).toBeUndefined();
    });

    it('does not purge or modify jobs that are still within their 30-day window', () => {
      const freshJob: QueueJob = {
        ...sampleJob,
        metadataExpiresAt: freshDate,
        preview: {
          ...sampleJob.preview!,
          metadataExpiresAt: freshDate
        }
      };

      const result = purgeExpiredJobMetadata(freshJob);
      expect(result.title).toBe('Rick Astley - Never Gonna Give You Up');
      expect(result.embedUrl).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
      expect(result.isStale).toBeUndefined();
    });
  });

  describe('Recent History Retention Sanitization', () => {
    beforeEach(() => {
      clearRecentDownloads();
    });

    it('sanitizes expired history items while preserving URL and record ID', () => {
      const expiredAt = new Date(Date.now() - 5000).toISOString();
      addRecentDownload({
        id: 'hist_1',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        shortcode: 'dQw4w9WgXcQ',
        title: 'Old Title',
        author: 'Old Author',
        metadataExpiresAt: expiredAt,
        platform: 'youtube'
      });

      const history = getRecentDownloads();
      expect(history).toHaveLength(1);
      expect(history[0].id).toBe('hist_1');
      expect(history[0].url).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      // Expired metadata scrubbed
      expect(history[0].title).toBeUndefined();
      expect(history[0].author).toBeUndefined();
      expect(history[0].isStale).toBe(true);
    });
  });
});
