import { YouTubeResolvedData, YouTubeWorkspaceRecord } from '../types.js';
import { isYouTubeMetadataExpired } from '../../../utils/retention.js';

const STORAGE_KEY = 'snapora_youtube_workspace_history';
const MAX_HISTORY_RECORDS = 50;

/**
 * Loads persisted YouTube workspace records, automatically applying the 30-day retention policy.
 * When metadata expires, upstream API-derived fields are scrubbed while user-created notes, tags,
 * collections, original URLs, and record identities are strictly preserved.
 */
export function loadYouTubeRecords(): YouTubeWorkspaceRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    let modified = false;
    const records: YouTubeWorkspaceRecord[] = parsed.slice(0, MAX_HISTORY_RECORDS).map((record) => {
      const expiresAt = record.data?.metadataExpiresAt;
      const isExpired = expiresAt ? isYouTubeMetadataExpired(expiresAt) : false;

      if (isExpired && !record.data?.isExpired) {
        modified = true;
        return {
          ...record,
          data: {
            ...record.data,
            title: '[Metadata Expired - Please Refresh]',
            author: '[Expired]',
            description: undefined,
            thumbnails: [],
            isExpired: true
          }
        };
      }

      return {
        ...record,
        data: {
          ...record.data,
          isExpired
        }
      };
    });

    if (modified) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    }

    return records;
  } catch (err) {
    console.warn('Failed to load YouTube workspace records:', err);
    return [];
  }
}

/**
 * Saves or updates a YouTube record in workspace history.
 */
export function saveYouTubeRecord(
  data: YouTubeResolvedData,
  notes?: string,
  tags?: string[],
  collections?: string[]
): YouTubeWorkspaceRecord {
  try {
    const records = loadYouTubeRecords();
    const existingIndex = records.findIndex(
      (r) => r.videoId === data.videoId || r.canonicalUrl === data.canonicalUrl
    );

    const now = Date.now();
    let record: YouTubeWorkspaceRecord;

    if (existingIndex >= 0) {
      const existing = records[existingIndex];
      record = {
        ...existing,
        data,
        notes: notes !== undefined ? notes : existing.notes,
        tags: tags !== undefined ? tags : existing.tags,
        collections: collections !== undefined ? collections : existing.collections,
        updatedAt: now
      };
      records.splice(existingIndex, 1);
      records.unshift(record);
    } else {
      record = {
        id: `yt_${data.videoId}_${now}`,
        url: data.canonicalUrl,
        canonicalUrl: data.canonicalUrl,
        videoId: data.videoId,
        data,
        notes,
        tags,
        collections,
        createdAt: now,
        updatedAt: now
      };
      records.unshift(record);
    }

    const trimmed = records.slice(0, MAX_HISTORY_RECORDS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    return record;
  } catch (err) {
    console.warn('Failed to save YouTube record:', err);
    return {
      id: `yt_${data.videoId}_${Date.now()}`,
      url: data.canonicalUrl,
      canonicalUrl: data.canonicalUrl,
      videoId: data.videoId,
      data,
      notes,
      tags,
      collections,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }
}

/**
 * Updates user-created fields (notes, tags, collections) without altering upstream metadata.
 */
export function updateYouTubeRecordUserFields(
  id: string,
  updates: { notes?: string; tags?: string[]; collections?: string[] }
): YouTubeWorkspaceRecord | null {
  try {
    const records = loadYouTubeRecords();
    const index = records.findIndex((r) => r.id === id);
    if (index === -1) return null;

    const existing = records[index];
    const updated: YouTubeWorkspaceRecord = {
      ...existing,
      notes: updates.notes !== undefined ? updates.notes : existing.notes,
      tags: updates.tags !== undefined ? updates.tags : existing.tags,
      collections: updates.collections !== undefined ? updates.collections : existing.collections,
      updatedAt: Date.now()
    };

    records[index] = updated;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    return updated;
  } catch (err) {
    console.warn('Failed to update YouTube user fields:', err);
    return null;
  }
}

/**
 * Refreshes upstream metadata for an existing record while strictly preserving
 * user notes, tags, collections, and record identity.
 */
export function refreshYouTubeRecord(
  id: string,
  freshData: YouTubeResolvedData
): YouTubeWorkspaceRecord | null {
  try {
    const records = loadYouTubeRecords();
    const index = records.findIndex((r) => r.id === id);
    if (index === -1) return null;

    const existing = records[index];
    const refreshed: YouTubeWorkspaceRecord = {
      ...existing,
      data: freshData,
      updatedAt: Date.now()
    };

    records[index] = refreshed;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    return refreshed;
  } catch (err) {
    console.warn('Failed to refresh YouTube record:', err);
    return null;
  }
}

/**
 * Removes a record from YouTube workspace history.
 */
export function deleteYouTubeRecord(id: string): void {
  try {
    const records = loadYouTubeRecords();
    const filtered = records.filter((r) => r.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch (err) {
    console.warn('Failed to delete YouTube record:', err);
  }
}

/**
 * Clears all YouTube records from workspace history.
 */
export function clearAllYouTubeRecords(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}
