export type PlatformId =
  | 'instagram'
  | 'youtube'
  | 'facebook'
  | 'tiktok'
  | 'pinterest'
  | 'twitter'
  | 'generic';

export type UnifiedMediaType =
  | 'post'
  | 'reel'
  | 'tv'
  | 'profile'
  | 'direct_media'
  | 'image'
  | 'video'
  | 'carousel'
  | 'audio'
  | 'collection';

export type ResolutionStatus =
  | 'url_validated'
  | 'live_preview_retrieved'
  | 'live_metadata_retrieved'
  | 'preview_unavailable'
  | 'authorized_media_source_available'
  | 'media_download_available'
  | 'authentication_required'
  | 'configuration_required'
  | 'unsupported_content'
  | 'invalid_url'
  | 'rate_limited'
  | 'temporarily_unavailable'
  | 'permanently_inaccessible'
  | 'unsupported_retrieval_method'
  | 'provider_error';

export type JobStatus =
  | 'queued'
  | 'validating'
  | 'fetching'
  | 'preview_ready'
  | 'ready'
  | 'failed';

export interface MediaItem {
  id?: string;
  postId?: string;
  platform?: PlatformId;
  type: 'image' | 'video';
  url: string;
  previewUrl?: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  filename: string;
  sizeBytes?: number;
  provider?: string;
  downloadable?: boolean;
  resolutionStatus?: ResolutionStatus;
  carouselPosition?: { index: number; total: number };
  status?: 'pending' | 'downloading' | 'completed' | 'failed';
  error?: string;
  takenAt?: number | string;
}

export interface CarouselItem {
  id: string;
  postId?: string;
  platform?: PlatformId;
  index: number;
  type: 'image' | 'video';
  url: string;
  previewUrl?: string;
  thumbnailUrl?: string;
  filename: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
  provider?: string;
  downloadable?: boolean;
  resolutionStatus?: ResolutionStatus;
  carouselPosition?: { index: number; total: number };
  status?: 'pending' | 'downloading' | 'completed' | 'failed';
  error?: string;
  takenAt?: number | string;
}

export interface PreviewData {
  type: 'embed' | 'thumbnail';
  html?: string;
  thumbnailUrl?: string;
  thumbnailWidth?: number;
  thumbnailHeight?: number;
  authorName?: string;
  authorUrl?: string;
  title?: string;
  providerName?: string;
  version?: string;
  embedUrl?: string;
  isEmbeddable?: boolean;
  embeddingAllowed?: boolean;
  embedStatus?: 'allowed' | 'disabled' | 'unknown';
  description?: string;
  durationSeconds?: number;
  durationFormatted?: string;
  publishedAt?: string;
  metadataCapability?: 'FULL_METADATA' | 'BASIC_METADATA' | 'EMBED_ONLY' | 'UNAVAILABLE';
  metadataFetchedAt?: string;
  metadataExpiresAt?: string;
  isStale?: boolean;
  thumbnails?: Array<{
    resolution: string;
    url: string;
    width?: number;
    height?: number;
    verified?: boolean;
  }>;
}

export interface QueueJob {
  id: string;
  url: string;
  normalizedUrl: string;
  shortcode: string;
  contentId?: string;
  platform?: PlatformId;
  mediaType?: 'post' | 'reel' | 'tv' | 'profile' | 'direct_media' | UnifiedMediaType;
  status: JobStatus;
  resolutionStatus?: ResolutionStatus;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  title?: string;
  author?: string;
  authorUrl?: string;
  description?: string;
  durationSeconds?: number;
  durationFormatted?: string;
  publishedAt?: string;
  embedUrl?: string;
  isEmbeddable?: boolean;
  embeddingAllowed?: boolean;
  embedStatus?: 'allowed' | 'disabled' | 'unknown';
  metadataCapability?: 'FULL_METADATA' | 'BASIC_METADATA' | 'EMBED_ONLY' | 'UNAVAILABLE';
  metadataFetchedAt?: string;
  metadataExpiresAt?: string;
  isStale?: boolean;
  notes?: string;
  tags?: string[];
  collections?: string[];
  takenAt?: number | string;
  provider?: string;
  downloadAvailable?: boolean;
  disclaimer?: string;
  preview?: PreviewData;
  media?: MediaItem[];
  carouselItems?: CarouselItem[];
  downloadProgressPercent?: number;
  bytesDownloaded?: number;
  totalBytes?: number;
  error?: {
    code: string;
    message: string;
    retryAfterSeconds?: number;
    rateLimitSource?: 'upstream' | 'snapora';
  };
  retryCount: number;
}

export type DownloadMode = 'individual' | 'zip';

export type DownloadAllStats = {
  active: boolean;
  total: number;
  completed: number;
  failed: number;
  currentFilename?: string;
  mode?: DownloadMode;
  phase?: 'fetching' | 'compressing' | 'completed' | 'cancelled';
  archiveName?: string;
  error?: string;
};

export type QueueState = {
  jobs: QueueJob[];
  isPaused: boolean;
  activeJobId: string | null;
  downloadAllStats?: DownloadAllStats | null;
  upstreamCooldownUntil?: number | null;
  upstreamCooldownRemaining?: number | null;
  upstreamRateLimitSource?: 'upstream' | 'snapora' | null;
};

export type QueueAction =
  | { type: 'ADD_JOBS'; payload: Array<{ id?: string; url: string; normalizedUrl: string; shortcode: string; contentId?: string; platform?: PlatformId; mediaType?: 'post' | 'reel' | 'tv' | 'profile' | 'direct_media' | UnifiedMediaType }> }
  | { type: 'START_JOB'; payload: { jobId: string } }
  | {
      type: 'JOB_SUCCESS';
      payload: {
        jobId: string;
        resolutionStatus?: ResolutionStatus;
        provider?: string;
        platform?: PlatformId;
        contentId?: string;
        downloadAvailable?: boolean;
        disclaimer?: string;
        preview?: PreviewData;
        media?: MediaItem[];
        carouselItems?: CarouselItem[];
        title?: string;
        author?: string;
        takenAt?: number | string;
      };
    }
  | {
      type: 'JOB_FAILURE';
      payload: {
        jobId: string;
        code: string;
        message: string;
        resolutionStatus?: ResolutionStatus;
        retryAfterSeconds?: number;
        rateLimitSource?: 'upstream' | 'snapora';
      };
    }
  | { type: 'UPDATE_JOB_PROGRESS'; payload: { jobId: string; percent: number; bytesDownloaded?: number; totalBytes?: number } }
  | { type: 'PAUSE_QUEUE' }
  | { type: 'RESUME_QUEUE' }
  | { type: 'TRIGGER_COOLDOWN'; payload: { seconds: number; source?: 'upstream' | 'snapora' } }
  | { type: 'TICK_COOLDOWN' }
  | { type: 'CLEAR_COOLDOWN' }
  | { type: 'RETRY_JOB'; payload: { jobId: string } }
  | { type: 'REMOVE_JOB'; payload: { jobId: string } }
  | { type: 'CLEAR_COMPLETED' }
  | { type: 'CLEAR_FAILED' }
  | { type: 'HYDRATE_STATE'; payload: { jobs: QueueJob[] } }
  | {
      type: 'SET_ITEM_DOWNLOAD_STATUS';
      payload: {
        jobId: string;
        itemId: string;
        status: 'pending' | 'downloading' | 'completed' | 'failed';
        progress?: number;
        error?: string;
      };
    }
  | {
      type: 'REFRESH_JOB_MEDIA';
      payload: {
        jobId: string;
        media: MediaItem[];
        carouselItems?: CarouselItem[];
      };
    }
  | {
      type: 'SET_DOWNLOAD_ALL_STATS';
      payload: DownloadAllStats | null;
    };
