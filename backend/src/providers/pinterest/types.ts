import { PlatformId, ResolutionStatus, PreviewData } from '../types.js';

export interface PinterestOEmbedResponse {
  version?: string;
  type?: string;
  provider_name?: string;
  provider_url?: string;
  width?: number;
  height?: number;
  title?: string;
  author_name?: string;
  author_url?: string;
  html?: string;
  thumbnail_url?: string;
  thumbnail_width?: number;
  thumbnail_height?: number;
}

export interface PinterestThumbnailItem {
  resolution: '236x';
  url: string;
  width?: number;
  height?: number;
  verified?: boolean;
}

export interface PinterestResolvedData {
  pinId: string;
  canonicalUrl: string;
  title?: string;
  author?: string;
  authorUrl?: string;
  description?: string;
  embedUrl?: string;
  embedStatus?: 'allowed' | 'disabled' | 'unknown';
  isEmbeddable?: boolean;
  embeddingAllowed?: boolean;
  metadataCapability?: 'FULL_METADATA' | 'BASIC_METADATA' | 'EMBED_ONLY' | 'UNAVAILABLE';
  metadataFetchedAt: string;
  metadataExpiresAt: string;
  thumbnails: PinterestThumbnailItem[];
  isExpired?: boolean;
}
