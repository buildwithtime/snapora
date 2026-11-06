export interface YouTubeThumbnailItem {
  resolution: string;
  url: string;
  width?: number;
  height?: number;
  verified?: boolean;
}

export interface YouTubeResolvedData {
  videoId: string;
  canonicalUrl: string;
  title: string;
  author: string;
  authorUrl?: string;
  description?: string;
  durationSeconds?: number;
  durationFormatted?: string;
  publishedAt?: string;
  embedUrl?: string;
  isEmbeddable?: boolean;
  embeddingAllowed?: boolean;
  embedStatus: 'allowed' | 'disabled' | 'unknown';
  metadataCapability: 'FULL_METADATA' | 'BASIC_METADATA' | 'EMBED_ONLY' | 'UNAVAILABLE';
  metadataFetchedAt: string;
  metadataExpiresAt: string;
  thumbnails: YouTubeThumbnailItem[];
  isExpired?: boolean;
}

export interface YouTubeWorkspaceRecord {
  id: string;
  url: string;
  canonicalUrl: string;
  videoId: string;
  data: YouTubeResolvedData;
  notes?: string;
  tags?: string[];
  collections?: string[];
  createdAt: number;
  updatedAt: number;
}

export type YouTubeResolutionStatus =
  | 'idle'
  | 'validating'
  | 'resolving'
  | 'resolved'
  | 'failed'
  | 'cancelled';

export interface YouTubeResolutionError {
  code: string;
  message: string;
  retryAfterSeconds?: number;
}
