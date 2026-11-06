import { ApiDerivedYouTubeMetadata, UserCreatedMediaRecord } from './types.js';

export const YOUTUBE_DATA_RETENTION_DAYS = 30;
export const YOUTUBE_DATA_RETENTION_MS = YOUTUBE_DATA_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export interface ExpirationTimestamps {
  metadataFetchedAt: string;
  metadataExpiresAt: string;
}

/**
 * Calculates UTC ISO 8601 timestamps for YouTube API metadata retention.
 * Enforces YouTube's 30-day non-authorized caching limit.
 */
export function calculateMetadataExpiration(fetchedAtInput?: Date | string | number): ExpirationTimestamps {
  const fetched = fetchedAtInput
    ? typeof fetchedAtInput === 'number'
      ? new Date(fetchedAtInput)
      : new Date(fetchedAtInput)
    : new Date();

  const fetchedTime = isNaN(fetched.getTime()) ? Date.now() : fetched.getTime();
  const expiresTime = fetchedTime + YOUTUBE_DATA_RETENTION_MS;

  return {
    metadataFetchedAt: new Date(fetchedTime).toISOString(),
    metadataExpiresAt: new Date(expiresTime).toISOString()
  };
}

/**
 * Evaluates whether a YouTube API metadata record has exceeded its 30-day retention window.
 */
export function isMetadataExpired(metadataExpiresAt?: string | null, now: Date = new Date()): boolean {
  if (!metadataExpiresAt || typeof metadataExpiresAt !== 'string') {
    return true; // Treat unversioned or missing expiration as expired
  }

  const expiresTime = Date.parse(metadataExpiresAt);
  if (isNaN(expiresTime)) {
    return true;
  }

  return now.getTime() >= expiresTime;
}

/**
 * Checks whether metadata is nearing expiration (e.g. within 5 days) and should be proactively refreshed.
 */
export function isMetadataStale(
  metadataExpiresAt?: string | null,
  staleWindowDays = 5,
  now: Date = new Date()
): boolean {
  if (!metadataExpiresAt || typeof metadataExpiresAt !== 'string') {
    return true;
  }

  const expiresTime = Date.parse(metadataExpiresAt);
  if (isNaN(expiresTime)) {
    return true;
  }

  const remainingMs = expiresTime - now.getTime();
  const staleWindowMs = staleWindowDays * 24 * 60 * 60 * 1000;
  return remainingMs <= staleWindowMs;
}

/**
 * Purges API-derived metadata fields from an expired YouTube record,
 * preserving all user-created records (such as original submitted URL, notes, tags, collection membership).
 */
export function purgeExpiredYouTubeMetadata<T extends Record<string, any>>(
  record: T,
  now: Date = new Date()
): T {
  if (!record || typeof record !== 'object') {
    return record;
  }

  const expiresAt = record.metadataExpiresAt || (record.preview && record.preview.metadataExpiresAt);
  if (!isMetadataExpired(expiresAt, now)) {
    return record; // Still within 30-day valid window
  }

  // Clone record as Record<string, any> and strip/sanitize provider-derived fields
  const sanitized: Record<string, any> = { ...record };

  // Explicitly nullify or delete provider-derived fields
  delete sanitized.title;
  delete sanitized.description;
  delete sanitized.author;
  delete sanitized.authorUrl;
  delete sanitized.durationSeconds;
  delete sanitized.durationFormatted;
  delete sanitized.publishedAt;
  delete sanitized.thumbnails;

  if (sanitized.preview) {
    sanitized.preview = {
      type: 'thumbnail',
      providerName: 'YouTube',
      title: '[Metadata Expired - Please Refresh]',
      isStale: true,
      metadataCapability: 'UNAVAILABLE',
      metadataFetchedAt: sanitized.preview.metadataFetchedAt,
      metadataExpiresAt: sanitized.preview.metadataExpiresAt
    };
  }

  if (sanitized.media) {
    sanitized.media = [];
  }

  sanitized.isStale = true;
  sanitized.metadataCapability = 'UNAVAILABLE';

  return sanitized as T;
}
