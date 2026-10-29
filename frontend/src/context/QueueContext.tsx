import React, { createContext, useContext, useReducer, useEffect, useRef, useState } from 'react';
import { QueueJob, QueueState, QueueAction, MediaItem, CarouselItem, DownloadMode } from '../types/queue.js';
import { parseBatchUrls } from '../utils/urlValidator.js';
import { saveJobsToStorage, loadJobsFromStorage } from '../utils/storage.js';
import { resolveClientMock } from '../utils/mockResolver.js';
import { generateMediaFilename, FilenameCollisionTracker } from '../utils/filenameGenerator.js';
import { buildAndDownloadZip } from '../utils/zipDownloader.js';

interface QueueContextType {
  state: QueueState;
  userAccessToken: string;
  setUserAccessToken: (token: string) => void;
  downloadMode: DownloadMode;
  setDownloadMode: (mode: DownloadMode) => void;
  addUrls: (rawText: string) => { addedCount: number; duplicateCount: number; invalidCount: number };
  pauseQueue: () => void;
  resumeQueue: () => void;
  retryJob: (jobId: string) => void;
  removeJob: (jobId: string) => void;
  clearCompleted: () => void;
  triggerDownload: (media: MediaItem) => void;
  downloadMediaItem: (jobId: string, item: MediaItem | CarouselItem) => Promise<boolean>;
  downloadAll: (jobId?: string, options?: { retryFailedOnly?: boolean; mode?: DownloadMode }) => Promise<void>;
  cancelDownloadAll: () => void;
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
        mediaType: item.mediaType,
        status: 'queued',
        resolutionStatus: 'url_validated',
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
                status: action.payload.downloadAvailable === false ? 'preview_ready' : 'ready',
                resolutionStatus:
                  action.payload.resolutionStatus ||
                  (action.payload.downloadAvailable === false
                    ? 'live_preview_retrieved'
                    : 'media_download_available'),
                completedAt: Date.now(),
                media: action.payload.media,
                carouselItems: action.payload.carouselItems,
                title: action.payload.title,
                author: action.payload.author,
                takenAt: action.payload.takenAt,
                provider: action.payload.provider,
                downloadAvailable: action.payload.downloadAvailable ?? true,
                disclaimer: action.payload.disclaimer,
                preview: action.payload.preview,
                error: undefined
              }
            : job
        )
      };

    case 'UPDATE_JOB_PROGRESS':
      return {
        ...state,
        jobs: state.jobs.map((job) =>
          job.id === action.payload.jobId
            ? {
                ...job,
                downloadProgressPercent: action.payload.percent,
                bytesDownloaded: action.payload.bytesDownloaded,
                totalBytes: action.payload.totalBytes
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
                resolutionStatus: action.payload.resolutionStatus || 'provider_error',
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

    case 'SET_ITEM_DOWNLOAD_STATUS':
      return {
        ...state,
        jobs: state.jobs.map((job) => {
          if (job.id !== action.payload.jobId) return job;
          const { itemId, status, error } = action.payload;
          const updatedMedia = job.media?.map((m) =>
            (m.id === itemId || m.filename === itemId)
              ? { ...m, status, error }
              : m
          );
          const updatedCarousel = job.carouselItems?.map((c) =>
            (c.id === itemId || c.filename === itemId)
              ? { ...c, status, error }
              : c
          );
          return {
            ...job,
            media: updatedMedia,
            carouselItems: updatedCarousel
          };
        })
      };

    case 'SET_DOWNLOAD_ALL_STATS':
      return {
        ...state,
        downloadAllStats: action.payload
      };

    default:
      return state;
  }
}

function applyStandardFilenames(
  media: MediaItem[] | undefined,
  carouselItems: CarouselItem[] | undefined,
  author: string | undefined,
  shortcode: string,
  takenAt?: number | string
): { media: MediaItem[]; carouselItems?: CarouselItem[] } {
  const tracker = new FilenameCollisionTracker();

  const normalizedCarousel = carouselItems?.map((c, idx) => {
    const candidate = generateMediaFilename({
      username: author,
      shortcode,
      takenAt: c.takenAt || takenAt,
      slideNumber: c.carouselPosition?.index || (idx + 1),
      isCarousel: true,
      mediaType: c.type,
      originalFilename: c.filename
    });
    const filename = tracker.getUniqueFilename(candidate);
    return {
      ...c,
      filename,
      takenAt: c.takenAt || takenAt
    };
  });

  const normalizedMedia = (media || []).map((m, idx) => {
    const matchingCarousel = normalizedCarousel?.find((c) => c.id === m.id || c.index === idx);
    if (matchingCarousel) {
      return {
        ...m,
        filename: matchingCarousel.filename,
        takenAt: matchingCarousel.takenAt
      };
    }
    const isCar = (media && media.length > 1) || Boolean(m.carouselPosition);
    const candidate = generateMediaFilename({
      username: author,
      shortcode,
      takenAt: m.takenAt || takenAt,
      slideNumber: m.carouselPosition?.index || (isCar ? idx + 1 : undefined),
      isCarousel: isCar,
      mediaType: m.type,
      originalFilename: m.filename
    });
    const filename = tracker.getUniqueFilename(candidate);
    return {
      ...m,
      filename,
      takenAt: m.takenAt || takenAt
    };
  });

  return { media: normalizedMedia, carouselItems: normalizedCarousel };
}

export const QueueProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(queueReducer, {
    jobs: [],
    isPaused: false,
    activeJobId: null
  });

  const [downloadMode, setDownloadMode] = useState<DownloadMode>('individual');

  const [userAccessToken, setUserAccessTokenState] = useState<string>(() => {
    try {
      return localStorage.getItem('snapora_user_token') || '';
    } catch {
      return '';
    }
  });

  const setUserAccessToken = (token: string) => {
    setUserAccessTokenState(token);
    try {
      if (token) {
        localStorage.setItem('snapora_user_token', token);
      } else {
        localStorage.removeItem('snapora_user_token');
      }
    } catch {
      // Storage unavailable
    }
  };

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
            const { media, carouselItems } = applyStandardFilenames(
              mockResult.media,
              mockResult.carouselItems,
              mockResult.author,
              nextJob.shortcode
            );
            dispatch({
              type: 'JOB_SUCCESS',
              payload: {
                jobId: nextJob.id,
                resolutionStatus: mockResult.status,
                provider: mockResult.provider,
                downloadAvailable: mockResult.downloadAvailable,
                disclaimer: mockResult.disclaimer,
                preview: mockResult.preview,
                media,
                carouselItems,
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
                message: mockResult.error?.message || 'Resolution failed in demo mode',
                resolutionStatus: mockResult.status || 'preview_unavailable'
              }
            });
          }
          return;
        }

        // Standard backend resolution
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (userAccessToken) {
          headers['Authorization'] = `Bearer ${userAccessToken}`;
        }

        const response = await fetch(`${apiBaseUrl}/api/resolve`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            url: nextJob.normalizedUrl,
            userAccessToken: userAccessToken || undefined
          }),
          signal: controller.signal
        });

        const data = await response.json();

        if (response.ok && data.ok) {
          const { media, carouselItems } = applyStandardFilenames(
            data.media,
            data.carouselItems,
            data.author,
            nextJob.shortcode,
            data.takenAt
          );
          dispatch({
            type: 'JOB_SUCCESS',
            payload: {
              jobId: nextJob.id,
              resolutionStatus: data.status,
              provider: data.provider,
              downloadAvailable: data.downloadAvailable,
              disclaimer: data.disclaimer,
              preview: data.preview,
              media,
              carouselItems,
              title: data.title,
              author: data.author,
              takenAt: data.takenAt
            }
          });
        } else {
          dispatch({
            type: 'JOB_FAILURE',
            payload: {
              jobId: nextJob.id,
              code: data.error?.code || 'FETCH_ERROR',
              message: data.error?.message || 'Failed to resolve media from upstream endpoint',
              resolutionStatus: data.status || 'provider_error'
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
            message: errorMessage,
            resolutionStatus: 'provider_error'
          }
        });
      } finally {
        processingRef.current = false;
        abortControllerRef.current = null;
      }
    })();
  }, [state.jobs, state.isPaused, state.activeJobId, apiBaseUrl, isDemoMode, userAccessToken]);

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
    if (!isDemoMode && apiBaseUrl && (media.url.startsWith('https://scontent') || media.url.includes('cdninstagram') || media.url.includes('fbcdn.net'))) {
      link.href = `${apiBaseUrl}/api/download?url=${encodeURIComponent(media.url)}&filename=${encodeURIComponent(media.filename)}`;
    } else {
      link.href = media.url;
    }
    link.download = media.filename;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadAbortControllerRef = useRef<AbortController | null>(null);

  const downloadMediaItem = async (jobId: string, item: MediaItem | CarouselItem): Promise<boolean> => {
    const itemId = item.id || item.filename;

    if (item.downloadable === false || !item.url) {
      dispatch({
        type: 'SET_ITEM_DOWNLOAD_STATUS',
        payload: {
          jobId,
          itemId,
          status: 'failed',
          error: 'Original media download is unavailable for this item (preview only).'
        }
      });
      return false;
    }

    dispatch({
      type: 'SET_ITEM_DOWNLOAD_STATUS',
      payload: {
        jobId,
        itemId,
        status: 'downloading',
        progress: 10
      }
    });

    try {
      let blob: Blob;

      if (!isDemoMode && (item.url.startsWith('https://scontent') || item.url.includes('cdninstagram') || item.url.includes('fbcdn.net') || item.url.includes('instagram.com'))) {
        const downloadUrl = `${apiBaseUrl}/api/download?url=${encodeURIComponent(item.url)}&filename=${encodeURIComponent(item.filename)}&expectedType=${encodeURIComponent(item.type)}`;
        const response = await fetch(downloadUrl);
        if (!response.ok) {
          let errMsg = `Download failed with HTTP ${response.status}`;
          try {
            const errJson = await response.json();
            errMsg = errJson.error?.message || errMsg;
          } catch {
            // fallback
          }
          dispatch({
            type: 'SET_ITEM_DOWNLOAD_STATUS',
            payload: {
              jobId,
              itemId,
              status: 'failed',
              error: errMsg
            }
          });
          return false;
        }
        blob = await response.blob();
      } else {
        // Direct or demo mode download
        const response = await fetch(item.url);
        if (!response.ok) {
          throw new Error(`Direct fetch failed (HTTP ${response.status})`);
        }
        blob = await response.blob();
      }

      // Download actual validated media bytes via object URL
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = item.filename;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);

      dispatch({
        type: 'SET_ITEM_DOWNLOAD_STATUS',
        payload: {
          jobId,
          itemId,
          status: 'completed',
          progress: 100
        }
      });
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Download failed';
      dispatch({
        type: 'SET_ITEM_DOWNLOAD_STATUS',
        payload: {
          jobId,
          itemId,
          status: 'failed',
          error: msg
        }
      });
      return false;
    }
  };

  const downloadAll = async (
    targetJobId?: string,
    options?: { retryFailedOnly?: boolean; mode?: DownloadMode }
  ) => {
    // Prevent duplicate concurrent execution
    if (downloadAbortControllerRef.current) {
      return;
    }

    const retryFailedOnly = Boolean(options?.retryFailedOnly);
    const activeMode = options?.mode || downloadMode;
    const jobsToProcess = targetJobId
      ? state.jobs.filter((j) => j.id === targetJobId)
      : state.jobs;

    const itemsToDownload: Array<{ jobId: string; item: MediaItem | CarouselItem }> = [];

    jobsToProcess.forEach((job) => {
      const candidates = job.carouselItems && job.carouselItems.length > 0
        ? job.carouselItems
        : job.media || [];

      candidates.forEach((item) => {
        if (item.downloadable === false || !item.url) return;
        if (retryFailedOnly) {
          if (item.status === 'failed') {
            itemsToDownload.push({ jobId: job.id, item });
          }
        } else {
          itemsToDownload.push({ jobId: job.id, item });
        }
      });
    });

    if (itemsToDownload.length === 0) {
      return;
    }

    // If downloading without retryFailedOnly, check if some items already completed
    if (!retryFailedOnly) {
      const hasUncompleted = itemsToDownload.some(({ item }) => item.status !== 'completed');
      if (hasUncompleted) {
        const pendingItems = itemsToDownload.filter(({ item }) => item.status !== 'completed');
        itemsToDownload.length = 0;
        itemsToDownload.push(...pendingItems);
      }
    }

    // Ensure all items in the download scope have unique, collision-free filenames
    const batchTracker = new FilenameCollisionTracker();
    itemsToDownload.forEach(({ item }) => {
      item.filename = batchTracker.getUniqueFilename(item.filename);
    });

    const abortController = new AbortController();
    downloadAbortControllerRef.current = abortController;

    // --- ZIP MODE BRANCH ---
    if (activeMode === 'zip') {
      const targetJob = targetJobId ? state.jobs.find((j) => j.id === targetJobId) : undefined;
      const archivePrefix = targetJob
        ? `Snapora_${targetJob.author || 'post'}_${targetJob.shortcode}`
        : undefined;

      try {
        await buildAndDownloadZip({
          items: itemsToDownload,
          apiBaseUrl,
          isDemoMode,
          archivePrefix,
          signal: abortController.signal,
          onProgress: (update) => {
            dispatch({
              type: 'SET_DOWNLOAD_ALL_STATS',
              payload: {
                active: update.phase === 'fetching' || update.phase === 'compressing',
                mode: 'zip',
                phase: update.phase,
                total: update.total,
                completed: update.completed,
                failed: update.failed,
                currentFilename: update.currentFilename,
                archiveName: update.archiveName
              }
            });
          },
          onItemStatus: (jobId, itemId, status, error) => {
            dispatch({
              type: 'SET_ITEM_DOWNLOAD_STATUS',
              payload: {
                jobId,
                itemId,
                status,
                error
              }
            });
          }
        });
      } finally {
        downloadAbortControllerRef.current = null;
      }
      return;
    }

    // --- INDIVIDUAL DOWNLOAD MODE BRANCH ---
    let completed = 0;
    let failed = 0;

    dispatch({
      type: 'SET_DOWNLOAD_ALL_STATS',
      payload: {
        active: true,
        mode: 'individual',
        phase: 'fetching',
        total: itemsToDownload.length,
        completed: 0,
        failed: 0,
        currentFilename: itemsToDownload[0].item.filename
      }
    });

    for (let i = 0; i < itemsToDownload.length; i++) {
      if (abortController.signal.aborted) {
        break;
      }

      const { jobId, item } = itemsToDownload[i];
      dispatch({
        type: 'SET_DOWNLOAD_ALL_STATS',
        payload: {
          active: true,
          mode: 'individual',
          phase: 'fetching',
          total: itemsToDownload.length,
          completed,
          failed,
          currentFilename: item.filename
        }
      });

      const success = await downloadMediaItem(jobId, item);
      if (success) {
        completed++;
      } else {
        failed++;
      }

      if (i < itemsToDownload.length - 1 && !abortController.signal.aborted) {
        await new Promise((r) => setTimeout(r, 400));
      }
    }

    dispatch({
      type: 'SET_DOWNLOAD_ALL_STATS',
      payload: {
        active: false,
        mode: 'individual',
        phase: abortController.signal.aborted ? 'cancelled' : 'completed',
        total: itemsToDownload.length,
        completed,
        failed
      }
    });
    downloadAbortControllerRef.current = null;
  };

  const cancelDownloadAll = () => {
    if (downloadAbortControllerRef.current) {
      downloadAbortControllerRef.current.abort();
      downloadAbortControllerRef.current = null;
    }
    if (state.downloadAllStats?.active) {
      dispatch({
        type: 'SET_DOWNLOAD_ALL_STATS',
        payload: {
          ...state.downloadAllStats,
          active: false,
          phase: 'cancelled'
        }
      });
    }
  };

  return (
    <QueueContext.Provider
      value={{
        state,
        userAccessToken,
        setUserAccessToken,
        downloadMode,
        setDownloadMode,
        addUrls,
        pauseQueue,
        resumeQueue,
        retryJob,
        removeJob,
        clearCompleted,
        triggerDownload,
        downloadMediaItem,
        downloadAll,
        cancelDownloadAll
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
