export type JobStatus =
  | 'queued'
  | 'validating'
  | 'fetching'
  | 'ready'
  | 'failed';

export interface MediaItem {
  type: 'image' | 'video';
  url: string;
  width?: number;
  height?: number;
  filename: string;
  thumbnailUrl?: string;
}

export interface QueueJob {
  id: string;
  url: string;
  normalizedUrl: string;
  shortcode: string;
  status: JobStatus;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  title?: string;
  author?: string;
  media?: MediaItem[];
  error?: {
    code: string;
    message: string;
  };
  retryCount: number;
}

export type QueueState = {
  jobs: QueueJob[];
  isPaused: boolean;
  activeJobId: string | null;
};

export type QueueAction =
  | { type: 'ADD_JOBS'; payload: Array<{ url: string; normalizedUrl: string; shortcode: string }> }
  | { type: 'START_JOB'; payload: { jobId: string } }
  | { type: 'JOB_SUCCESS'; payload: { jobId: string; media: MediaItem[]; title?: string; author?: string } }
  | { type: 'JOB_FAILURE'; payload: { jobId: string; code: string; message: string } }
  | { type: 'PAUSE_QUEUE' }
  | { type: 'RESUME_QUEUE' }
  | { type: 'RETRY_JOB'; payload: { jobId: string } }
  | { type: 'REMOVE_JOB'; payload: { jobId: string } }
  | { type: 'CLEAR_COMPLETED' }
  | { type: 'HYDRATE_STATE'; payload: { jobs: QueueJob[] } };
