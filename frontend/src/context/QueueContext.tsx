import React, { createContext, useContext, useReducer, useEffect, useRef } from 'react';
import { QueueJob, QueueState, QueueAction, MediaItem } from '../types/queue.js';
import { parseBatchUrls } from '../utils/urlValidator.js';
import { saveJobsToStorage, loadJobsFromStorage } from '../utils/storage.js';
import { resolveClientMock } from '../utils/mockResolver.js';

interface QueueContextType {
  state: QueueState;
  addUrls: (rawText: string) => { addedCount: number; duplicateCount: number; invalidCount: number };
  pauseQueue: () => void;
  resumeQueue: () => void;
  retryJob: (jobId: string) => void;
  removeJob: (jobId: string) => void;
  clearCompleted: () => void;
  triggerDownload: (media: MediaItem) => void;
}

const QueueContext = createContext<QueueContextType | undefined>(undefined);

export function queueReducer(state: QueueState, action: QueueAction): QueueState {
  switch (action.type) {
    case 'HYDRATE_STATE':
      return {
        ...state,
        jobs: action.payload.jobs,
        activeJobId: null
      };

    case 'ADD_JOBS': {
      const now = Date.now();
      const newJobs: QueueJob[] = action.payload.map((item, index) => ({
        id: `job_${now}_${index}_${Math.random().toString(36).slice(2, 7)}`,
        url: item.url,
        normalizedUrl: item.normalizedUrl,
        shortcode: item.shortcode,
        status: 'queued',
        createdAt: now + index,
        retryCount: 0
      }));

      return {
        ...state,
        jobs: [...state.jobs, ...newJobs]
      };
    }

    case 'START_JOB':
      return {
        ...state,
        activeJobId: action.payload.jobId,
        jobs: state.jobs.map((job) =>
          job.id === action.payload.jobId
            ? { ...job, status: 'fetching', startedAt: Date.now() }
            : job
        )
      };

    case 'JOB_SUCCESS':
      return {
        ...state,
        activeJobId: null,
        jobs: state.jobs.map((job) =>
          job.id === action.payload.jobId
            ? {
                ...job,
                status: 'ready',
                completedAt: Date.now(),
                media: action.payload.media,
                title: action.payload.title,
                author: action.payload.author,
                error: undefined
              }
            : job
        )
      };

    case 'JOB_FAILURE':
      return {
        ...state,
        activeJobId: null,
        jobs: state.jobs.map((job) =>
          job.id === action.payload.jobId
            ? {
                ...job,
                status: 'failed',
                completedAt: Date.now(),
                error: {
                  code: action.payload.code,
                  message: action.payload.message
                }
              }
            : job
        )
      };

    case 'PAUSE_QUEUE':
      return {
        ...state,
        isPaused: true
      };

    case 'RESUME_QUEUE':
      return {
        ...state,
        isPaused: false
      };

    case 'RETRY_JOB':
      return {
        ...state,
        jobs: state.jobs.map((job) =>
          job.id === action.payload.jobId && job.status === 'failed'
            ? {
                ...job,
                status: 'queued',
                error: undefined,
                retryCount: job.retryCount + 1
              }
            : job
        )
      };

    case 'REMOVE_JOB':
      return {
        ...state,
        activeJobId: state.activeJobId === action.payload.jobId ? null : state.activeJobId,
        jobs: state.jobs.filter((job) => job.id !== action.payload.jobId)
      };

    case 'CLEAR_COMPLETED':
      return {
        ...state,
        jobs: state.jobs.filter((job) => job.status === 'queued' || job.status === 'fetching')
      };

    default:
      return state;
  }
}

export const QueueProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(queueReducer, {
    jobs: [],
    isPaused: false,
    activeJobId: null
  });

  const processingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
  const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true';

  // Hydrate from IndexedDB on startup
  useEffect(() => {
    let mounted = true;
    loadJobsFromStorage().then((savedJobs) => {
      if (mounted && savedJobs.length > 0) {
        // Reset any leftover 'fetching' status to 'queued' to safely recover interrupted jobs
        const normalized = savedJobs.map((j) =>
          j.status === 'fetching' ? { ...j, status: 'queued' as const } : j
        );
        dispatch({ type: 'HYDRATE_STATE', payload: { jobs: normalized } });
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Persist jobs to IndexedDB whenever jobs list changes
  useEffect(() => {
    saveJobsToStorage(state.jobs);
  }, [state.jobs]);

  // Queue runner: strictly sequential processing (concurrency = 1)
  useEffect(() => {
    if (state.isPaused || processingRef.current) {
      return;
    }

    const nextJob = state.jobs.find((job) => job.status === 'queued');
    if (!nextJob) {
      return;
    }

    processingRef.current = true;
    dispatch({ type: 'START_JOB', payload: { jobId: nextJob.id } });

    const controller = new AbortController();
    abortControllerRef.current = controller;

    (async () => {
      try {
        if (isDemoMode) {
          // Client-side standalone demo resolution
          const mockResult = await resolveClientMock(nextJob.shortcode);
          if (mockResult.ok) {
            dispatch({
              type: 'JOB_SUCCESS',
              payload: {
                jobId: nextJob.id,
                media: mockResult.media || [],
                title: mockResult.title,
                author: mockResult.author
              }
            });
          } else {
            dispatch({
              type: 'JOB_FAILURE',
              payload: {
                jobId: nextJob.id,
                code: mockResult.error?.code || 'FETCH_ERROR',
                message: mockResult.error?.message || 'Resolution failed in demo mode'
              }
            });
          }
          return;
        }

        // Standard backend resolution
        const response = await fetch(`${apiBaseUrl}/api/resolve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: nextJob.normalizedUrl }),
          signal: controller.signal
        });

        const data = await response.json();

        if (response.ok && data.ok) {
          dispatch({
            type: 'JOB_SUCCESS',
            payload: {
              jobId: nextJob.id,
              media: data.media || [],
              title: data.title,
              author: data.author
            }
          });
        } else {
          dispatch({
            type: 'JOB_FAILURE',
            payload: {
              jobId: nextJob.id,
              code: data.error?.code || 'FETCH_ERROR',
              message: data.error?.message || 'Failed to resolve media from upstream endpoint'
            }
          });
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          // Job was cancelled by user
          return;
        }

        const errorMessage = err instanceof Error ? err.message : 'Network connection failed';
        dispatch({
          type: 'JOB_FAILURE',
          payload: {
            jobId: nextJob.id,
            code: 'NETWORK_ERROR',
            message: errorMessage
          }
        });
      } finally {
        processingRef.current = false;
        abortControllerRef.current = null;
      }
    })();
  }, [state.jobs, state.isPaused, state.activeJobId, apiBaseUrl, isDemoMode]);

  const addUrls = (rawText: string) => {
    const { valid, invalid } = parseBatchUrls(rawText);

    // Check duplicates against currently active jobs in queue
    const currentShortcodes = new Set(state.jobs.map((j) => j.shortcode));
    const nonDuplicates = valid.filter((v) => !currentShortcodes.has(v.shortcode));
    const duplicateCount = valid.length - nonDuplicates.length;

    if (nonDuplicates.length > 0) {
      dispatch({ type: 'ADD_JOBS', payload: nonDuplicates });
    }

    return {
      addedCount: nonDuplicates.length,
      duplicateCount,
      invalidCount: invalid.length
    };
  };

  const pauseQueue = () => dispatch({ type: 'PAUSE_QUEUE' });
  const resumeQueue = () => dispatch({ type: 'RESUME_QUEUE' });

  const retryJob = (jobId: string) => {
    const job = state.jobs.find((j) => j.id === jobId);
    if (job && job.status === 'failed') {
      dispatch({ type: 'RETRY_JOB', payload: { jobId } });
    }
  };

  const removeJob = (jobId: string) => {
    if (state.activeJobId === jobId && abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    dispatch({ type: 'REMOVE_JOB', payload: { jobId } });
  };

  const clearCompleted = () => dispatch({ type: 'CLEAR_COMPLETED' });

  const triggerDownload = (media: MediaItem) => {
    const link = document.createElement('a');
    link.href = media.url;
    link.download = media.filename;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <QueueContext.Provider
      value={{
        state,
        addUrls,
        pauseQueue,
        resumeQueue,
        retryJob,
        removeJob,
        clearCompleted,
        triggerDownload
      }}
    >
      {children}
    </QueueContext.Provider>
  );
};

export function useQueue(): QueueContextType {
  const context = useContext(QueueContext);
  if (!context) {
    throw new Error('useQueue must be used within a QueueProvider');
  }
  return context;
}
