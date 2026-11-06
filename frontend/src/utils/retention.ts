import { QueueJob } from '../types/queue.js';

export const YOUTUBE_DATA_RETENTION_DAYS = 30;
export const YOUTUBE_DATA_RETENTION_MS = YOUTUBE_DATA_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export interface ExpirationTimestamps {
  metadataFetchedAt: string;
  metadataExpiresAt: string;
}

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

export function isMetadataExpired(metadataExpiresAt?: string | null, now: Date = new Date()): boolean {
  if (!metadataExpiresAt || typeof metadataExpiresAt !== 'string') {
    return false;
  }

  const expiresTime = Date.parse(metadataExpiresAt);
  if (isNaN(expiresTime)) {
    return false;
  }

  return now.getTime() >= expiresTime;
}

export function isMetadataStale(
  metadataExpiresAt?: string | null,
  staleWindowDays = 5,
  now: Date = new Date()
): boolean {
  if (!metadataExpiresAt || typeof metadataExpiresAt !== 'string') {
    return false;
  }

  const expiresTime = Date.parse(metadataExpiresAt);
  if (isNaN(expiresTime)) {
    return false;
  }

  const remainingMs = expiresTime - now.getTime();
  const staleWindowMs = staleWindowDays * 24 * 60 * 60 * 1000;
  return remainingMs <= staleWindowMs;
}

/**
 * Purges expired API-derived metadata from a QueueJob,
 * while strictly preserving user-created state (notes, tags, collections, originalUrl, id, createdAt, etc.).
 */
export function purgeExpiredJobMetadata(job: QueueJob, now: Date = new Date()): QueueJob {
  if (!job || typeof job !== 'object') {
    return job;
  }

  // Check if job or preview has an expired metadata retention window
  const expiresAt = job.metadataExpiresAt || job.preview?.metadataExpiresAt;
  if (!isMetadataExpired(expiresAt, now)) {
    return job;
  }

  // Shallow clone job preserving all user attributes
  const purged: QueueJob = {
    ...job,
    // Preserve user records
    notes: job.notes,
    tags: job.tags ? [...job.tags] : undefined,
    collections: job.collections ? [...job.collections] : undefined,
    // Purge API-derived fields
    title: undefined,
    author: undefined,
    authorUrl: undefined,
    description: undefined,
    durationSeconds: undefined,
    durationFormatted: undefined,
    publishedAt: undefined,
    embedUrl: undefined,
    isEmbeddable: false,
    embeddingAllowed: false,
    embedStatus: 'disabled',
    media: [],
    carouselItems: undefined,
    metadataCapability: 'UNAVAILABLE',
    isStale: true
  };

  if (job.preview) {
    purged.preview = {
      ...job.preview,
      title: '[Metadata Expired - Please Refresh]',
      authorName: undefined,
      authorUrl: undefined,
      thumbnailUrl: undefined,
      embedUrl: undefined,
      isEmbeddable: false,
      embeddingAllowed: false,
      embedStatus: 'disabled',
      description: undefined,
      durationSeconds: undefined,
      durationFormatted: undefined,
      publishedAt: undefined,
      metadataCapability: 'UNAVAILABLE',
      isStale: true,
      thumbnails: []
    };
  }

  return purged;
}
