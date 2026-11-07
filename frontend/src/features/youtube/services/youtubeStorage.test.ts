import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveYouTubeRecord,
  loadYouTubeRecords,
  updateYouTubeRecordUserFields,
  refreshYouTubeRecord,
  deleteYouTubeRecord,
  clearAllYouTubeRecords
} from './youtubeStorage.js';
import { YouTubeResolvedData } from '../types.js';

describe('YouTube Storage & Retention Lifecycle Suite', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const sampleData: YouTubeResolvedData = {
    videoId: 'dQw4w9WgXcQ',
    canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    title: 'Never Gonna Give You Up',
    author: 'Rick Astley',
    embedStatus: 'allowed',
    metadataCapability: 'FULL_METADATA',
    metadataFetchedAt: new Date().toISOString(),
    metadataExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    thumbnails: [{ resolution: 'hqdefault', url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg' }],
    isExpired: false
  };

  it('saves and reloads a fresh YouTube workspace record', () => {
    const saved = saveYouTubeRecord(sampleData, 'Great 80s song', ['music'], ['Favorites']);
    expect(saved.id).toContain('yt_dQw4w9WgXcQ');
    expect(saved.notes).toBe('Great 80s song');
    expect(saved.tags).toEqual(['music']);

    const loaded = loadYouTubeRecords();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].videoId).toBe('dQw4w9WgXcQ');
    expect(loaded[0].data.title).toBe('Never Gonna Give You Up');
    expect(loaded[0].notes).toBe('Great 80s song');
    expect(loaded[0].data.isExpired).toBe(false);
  });

  it('updates user notes and tags without altering upstream metadata or record identity', () => {
    const saved = saveYouTubeRecord(sampleData, 'Initial note', ['tag1']);
    const updated = updateYouTubeRecordUserFields(saved.id, {
      notes: 'Updated study note',
      tags: ['tag1', 'tag2'],
      collections: ['Research']
    });

    expect(updated).not.toBeNull();
    expect(updated?.id).toBe(saved.id);
    expect(updated?.notes).toBe('Updated study note');
    expect(updated?.tags).toEqual(['tag1', 'tag2']);
    expect(updated?.collections).toEqual(['Research']);
    expect(updated?.data.title).toBe('Never Gonna Give You Up');
  });

  it('enforces 30-day retention on load: scrubs upstream metadata while preserving user notes and identity', () => {
    // Expired 31 days ago
    const expiredData: YouTubeResolvedData = {
      ...sampleData,
      metadataFetchedAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString(),
      metadataExpiresAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
    };

    const saved = saveYouTubeRecord(expiredData, 'My preserved notes', ['preserved_tag'], ['PreservedCollection']);

    // When loaded from storage, retention policy purges upstream API data
    const loaded = loadYouTubeRecords();
    expect(loaded).toHaveLength(1);
    const item = loaded[0];

    // Preserved user workspace identity & fields
    expect(item.id).toBe(saved.id);
    expect(item.videoId).toBe('dQw4w9WgXcQ');
    expect(item.canonicalUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(item.notes).toBe('My preserved notes');
    expect(item.tags).toEqual(['preserved_tag']);
    expect(item.collections).toEqual(['PreservedCollection']);

    // Upstream API metadata is scrubbed and marked expired
    expect(item.data.isExpired).toBe(true);
    expect(item.data.title).toContain('Expired');
    expect(item.data.thumbnails).toHaveLength(0);
  });

  it('refreshes an expired record with fresh metadata while strictly keeping user notes, tags, and record ID', () => {
    const expiredData: YouTubeResolvedData = {
      ...sampleData,
      metadataExpiresAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
    };

    const saved = saveYouTubeRecord(expiredData, 'User note before refresh', ['tag1']);

    const freshData: YouTubeResolvedData = {
      ...sampleData,
      title: 'Refreshed Title',
      author: 'Refreshed Author',
      metadataFetchedAt: new Date().toISOString(),
      metadataExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      isExpired: false
    };

    const refreshed = refreshYouTubeRecord(saved.id, freshData);
    expect(refreshed).not.toBeNull();
    expect(refreshed?.id).toBe(saved.id);
    expect(refreshed?.notes).toBe('User note before refresh');
    expect(refreshed?.tags).toEqual(['tag1']);
    expect(refreshed?.data.title).toBe('Refreshed Title');
    expect(refreshed?.data.isExpired).toBe(false);
  });

  it('deletes a record from history', () => {
    const record = saveYouTubeRecord(sampleData);
    expect(loadYouTubeRecords()).toHaveLength(1);

    deleteYouTubeRecord(record.id);
    expect(loadYouTubeRecords()).toHaveLength(0);
  });

  it('clears all records', () => {
    saveYouTubeRecord({ ...sampleData, videoId: 'vid1', canonicalUrl: 'https://youtube.com/watch?v=vid1' });
    saveYouTubeRecord({ ...sampleData, videoId: 'vid2', canonicalUrl: 'https://youtube.com/watch?v=vid2' });
    expect(loadYouTubeRecords()).toHaveLength(2);

    clearAllYouTubeRecords();
    expect(loadYouTubeRecords()).toHaveLength(0);
  });
});
