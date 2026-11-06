import { PlatformId, ResolutionStatus } from '../types.js';

export type YouTubeMetadataCapability =
  | 'FULL_METADATA'
  | 'BASIC_METADATA'
  | 'EMBED_ONLY'
  | 'UNAVAILABLE';

export type YouTubeThumbnailResolution =
  | 'maxresdefault'
  | 'sddefault'
  | 'hqdefault'
  | 'mqdefault'
  | 'default';

export interface YouTubeThumbnailItem {
  resolution: YouTubeThumbnailResolution;
  url: string;
  width: number;
  height: number;
  verified: boolean;
}

export interface NormalizedYouTubeMetadata {
  platform: 'youtube';
  contentId: string;
  canonicalUrl: string;
  title: string;
  author: string;
  authorUrl: string;
  description?: string;
  durationSeconds?: number;
  durationFormatted?: string;
  publishedAt?: string;
  thumbnails: YouTubeThumbnailItem[];
  embedUrl?: string;
  isEmbeddable?: boolean;
  embeddingAllowed?: boolean;
  embedStatus: 'allowed' | 'disabled' | 'unknown';
  metadataCapability: YouTubeMetadataCapability;
  metadataFetchedAt: string;
  metadataExpiresAt: string;
}

/**
 * Distinguishes user-created records from API-derived metadata.
 * User-created records persist indefinitely and are not subject to the 30-day API cache purge.
 */
export interface UserCreatedMediaRecord {
  id: string;
  originalUrl: string;
  canonicalUrl: string;
  platform: PlatformId;
  contentId: string;
  createdAt: number;
  notes?: string;
  tags?: string[];
  collections?: string[];
}

/**
 * Provider-derived metadata subject to 30-day expiration per YouTube Developer Policies.
 */
export interface ApiDerivedYouTubeMetadata {
  title: string;
  author: string;
  authorUrl: string;
  description?: string;
  durationSeconds?: number;
  durationFormatted?: string;
  publishedAt?: string;
  thumbnails: YouTubeThumbnailItem[];
  embedUrl?: string;
  isEmbeddable?: boolean;
  embeddingAllowed?: boolean;
  embedStatus: 'allowed' | 'disabled' | 'unknown';
  metadataCapability: YouTubeMetadataCapability;
  metadataFetchedAt: string;
  metadataExpiresAt: string;
  isStale?: boolean;
}
