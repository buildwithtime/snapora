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
}

export interface QueueJob {
  id: string;
  url: string;
  normalizedUrl: string;
  shortcode: string;
  mediaType?: 'post' | 'reel' | 'tv' | 'direct_media';
  status: JobStatus;
  resolutionStatus?: ResolutionStatus;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  title?: string;
  author?: string;
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
};

export type QueueState = {
  jobs: QueueJob[];
  isPaused: boolean;
  activeJobId: string | null;
  downloadAllStats?: DownloadAllStats | null;
};

export type QueueAction =
  | { type: 'ADD_JOBS'; payload: Array<{ url: string; normalizedUrl: string; shortcode: string; mediaType?: 'post' | 'reel' | 'tv' | 'direct_media' }> }
  | { type: 'START_JOB'; payload: { jobId: string } }
  | {
      type: 'JOB_SUCCESS';
      payload: {
        jobId: string;
        resolutionStatus?: ResolutionStatus;
        provider?: string;
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
  | { type: 'JOB_FAILURE'; payload: { jobId: string; code: string; message: string; resolutionStatus?: ResolutionStatus } }
  | { type: 'UPDATE_JOB_PROGRESS'; payload: { jobId: string; percent: number; bytesDownloaded?: number; totalBytes?: number } }
  | { type: 'PAUSE_QUEUE' }
  | { type: 'RESUME_QUEUE' }
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
      type: 'SET_DOWNLOAD_ALL_STATS';
      payload: DownloadAllStats | null;
    };
