import { describe, it, expect } from 'vitest';
import { QueueState } from '../types/queue.js';
import { queueReducer } from './QueueContext.js';

describe('Queue State Machine Transitions', () => {
  const initialState: QueueState = {
    jobs: [],
    isPaused: false,
    activeJobId: null
  };

  it('handles ADD_JOBS action', () => {
    const state = queueReducer(initialState, {
      type: 'ADD_JOBS',
      payload: [
        { url: 'https://instagram.com/p/123/', normalizedUrl: 'https://www.instagram.com/p/123/', shortcode: '123' }
      ]
    });

    expect(state.jobs).toHaveLength(1);
    expect(state.jobs[0].status).toBe('queued');
    expect(state.jobs[0].shortcode).toBe('123');
  });

  it('handles START_JOB and transitions status to fetching', () => {
    const withJobState: QueueState = {
      jobs: [
        {
          id: 'job_1',
          url: 'test',
          normalizedUrl: 'test',
          shortcode: '123',
          status: 'queued',
          createdAt: 100,
          retryCount: 0
        }
      ],
      isPaused: false,
      activeJobId: null
    };

    const state = queueReducer(withJobState, {
      type: 'START_JOB',
      payload: { jobId: 'job_1' }
    });

    expect(state.activeJobId).toBe('job_1');
    expect(state.jobs[0].status).toBe('fetching');
  });

  it('handles JOB_SUCCESS and clears activeJobId', () => {
    const runningState: QueueState = {
      jobs: [
        {
          id: 'job_1',
          url: 'test',
          normalizedUrl: 'test',
          shortcode: '123',
          status: 'fetching',
          createdAt: 100,
          retryCount: 0
        }
      ],
      isPaused: false,
      activeJobId: 'job_1'
    };

    const state = queueReducer(runningState, {
      type: 'JOB_SUCCESS',
      payload: {
        jobId: 'job_1',
        media: [{ type: 'image', url: 'https://example.com/img.jpg', filename: 'img.jpg' }]
      }
    });

    expect(state.activeJobId).toBeNull();
    expect(state.jobs[0].status).toBe('ready');
    expect(state.jobs[0].media).toHaveLength(1);
  });

  it('handles JOB_FAILURE and records error code', () => {
    const runningState: QueueState = {
      jobs: [
        {
          id: 'job_1',
          url: 'test',
          normalizedUrl: 'test',
          shortcode: '123',
          status: 'fetching',
          createdAt: 100,
          retryCount: 0
        }
      ],
      isPaused: false,
      activeJobId: 'job_1'
    };

    const state = queueReducer(runningState, {
      type: 'JOB_FAILURE',
      payload: {
        jobId: 'job_1',
        code: 'PRIVATE_ACCOUNT',
        message: 'Account is private'
      }
    });

    expect(state.activeJobId).toBeNull();
    expect(state.jobs[0].status).toBe('failed');
    expect(state.jobs[0].error?.code).toBe('PRIVATE_ACCOUNT');
  });

  it('handles PAUSE_QUEUE and RESUME_QUEUE', () => {
    let state = queueReducer(initialState, { type: 'PAUSE_QUEUE' });
    expect(state.isPaused).toBe(true);

    state = queueReducer(state, { type: 'RESUME_QUEUE' });
    expect(state.isPaused).toBe(false);
  });

  it('handles RETRY_JOB only on failed jobs', () => {
    const mixedState: QueueState = {
      jobs: [
        {
          id: 'job_failed',
          url: 'test',
          normalizedUrl: 'test',
          shortcode: '123',
          status: 'failed',
          createdAt: 100,
          retryCount: 0
        },
        {
          id: 'job_fetching',
          url: 'test2',
          normalizedUrl: 'test2',
          shortcode: '456',
          status: 'fetching',
          createdAt: 200,
          retryCount: 0
        }
      ],
      isPaused: false,
      activeJobId: 'job_fetching'
    };

    // Retrying a failed job should transition it to queued
    const retryFailed = queueReducer(mixedState, {
      type: 'RETRY_JOB',
      payload: { jobId: 'job_failed' }
    });
    expect(retryFailed.jobs[0].status).toBe('queued');
    expect(retryFailed.jobs[0].retryCount).toBe(1);

    // Retrying an in-flight fetching job must NOT reset it
    const retryFetching = queueReducer(mixedState, {
      type: 'RETRY_JOB',
      payload: { jobId: 'job_fetching' }
    });
    expect(retryFetching.jobs[1].status).toBe('fetching');
  });

  it('handles REMOVE_JOB and clears activeJobId if matching', () => {
    const stateWithActive: QueueState = {
      jobs: [
        {
          id: 'job_active',
          url: 'test',
          normalizedUrl: 'test',
          shortcode: '123',
          status: 'fetching',
          createdAt: 100,
          retryCount: 0
        }
      ],
      isPaused: false,
      activeJobId: 'job_active'
    };

    const removed = queueReducer(stateWithActive, {
      type: 'REMOVE_JOB',
      payload: { jobId: 'job_active' }
    });

    expect(removed.jobs).toHaveLength(0);
    expect(removed.activeJobId).toBeNull();
  });

  it('handles CLEAR_COMPLETED removing only completed jobs and not silently removing failed items', () => {
    const mixedState: QueueState = {
      jobs: [
        { id: '1', url: '1', normalizedUrl: '1', shortcode: '1', status: 'ready', createdAt: 1, retryCount: 0 },
        { id: '2', url: '2', normalizedUrl: '2', shortcode: '2', status: 'failed', createdAt: 2, retryCount: 0 },
        { id: '3', url: '3', normalizedUrl: '3', shortcode: '3', status: 'queued', createdAt: 3, retryCount: 0 },
        { id: '4', url: '4', normalizedUrl: '4', shortcode: '4', status: 'fetching', createdAt: 4, retryCount: 0 }
      ],
      isPaused: false,
      activeJobId: '4'
    };

    const cleared = queueReducer(mixedState, { type: 'CLEAR_COMPLETED' });
    // Only completed job '1' (ready) is cleared. Failed ('2'), queued ('3'), fetching ('4') are preserved.
    expect(cleared.jobs.map((j) => j.id)).toEqual(['2', '3', '4']);
  });

  it('handles CLEAR_FAILED removing only failed jobs', () => {
    const mixedState: QueueState = {
      jobs: [
        { id: '1', url: '1', normalizedUrl: '1', shortcode: '1', status: 'ready', createdAt: 1, retryCount: 0 },
        { id: '2', url: '2', normalizedUrl: '2', shortcode: '2', status: 'failed', createdAt: 2, retryCount: 0 },
        { id: '3', url: '3', normalizedUrl: '3', shortcode: '3', status: 'queued', createdAt: 3, retryCount: 0 }
      ],
      isPaused: false,
      activeJobId: null
    };

    const cleared = queueReducer(mixedState, { type: 'CLEAR_FAILED' });
    expect(cleared.jobs.map((j) => j.id)).toEqual(['1', '3']);
  });

  it('handles HYDRATE_STATE and resets activeJobId', () => {
    const hydrated = queueReducer(initialState, {
      type: 'HYDRATE_STATE',
      payload: {
        jobs: [
          { id: 'saved_1', url: '1', normalizedUrl: '1', shortcode: '1', status: 'queued', createdAt: 1, retryCount: 0 }
        ]
      }
    });

    expect(hydrated.jobs).toHaveLength(1);
    expect(hydrated.activeJobId).toBeNull();
  });

  it('transitions to preview_ready when live preview is retrieved without direct media download', () => {
    const runningState: QueueState = {
      jobs: [
        {
          id: 'job_preview_1',
          url: 'https://instagram.com/p/Prev123/',
          normalizedUrl: 'https://www.instagram.com/p/Prev123/',
          shortcode: 'Prev123',
          status: 'fetching',
          createdAt: 100,
          retryCount: 0
        }
      ],
      isPaused: false,
      activeJobId: 'job_preview_1'
    };

    const nextState = queueReducer(runningState, {
      type: 'JOB_SUCCESS',
      payload: {
        jobId: 'job_preview_1',
        resolutionStatus: 'live_preview_retrieved',
        provider: 'InstagramOEmbedProvider',
        downloadAvailable: false,
        preview: {
          type: 'embed',
          thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
          authorName: 'photographer'
        },
        media: []
      }
    });

    expect(nextState.activeJobId).toBeNull();
    expect(nextState.jobs[0].status).toBe('preview_ready');
    expect(nextState.jobs[0].resolutionStatus).toBe('live_preview_retrieved');
    expect(nextState.jobs[0].downloadAvailable).toBe(false);
    expect(nextState.jobs[0].preview?.authorName).toBe('photographer');
  });

  it('records classified resolutionStatus on failure', () => {
    const runningState: QueueState = {
      jobs: [
        {
          id: 'job_fail_1',
          url: 'https://instagram.com/p/Priv123/',
          normalizedUrl: 'https://www.instagram.com/p/Priv123/',
          shortcode: 'Priv123',
          status: 'fetching',
          createdAt: 100,
          retryCount: 0
        }
      ],
      isPaused: false,
      activeJobId: 'job_fail_1'
    };

    const nextState = queueReducer(runningState, {
      type: 'JOB_FAILURE',
      payload: {
        jobId: 'job_fail_1',
        code: 'PROVIDER_NOT_CONFIGURED',
        message: 'Meta API credentials missing',
        resolutionStatus: 'preview_unavailable'
      }
    });

    expect(nextState.activeJobId).toBeNull();
    expect(nextState.jobs[0].status).toBe('failed');
    expect(nextState.jobs[0].resolutionStatus).toBe('preview_unavailable');
    expect(nextState.jobs[0].error?.code).toBe('PROVIDER_NOT_CONFIGURED');
  });

  it('updates item download status on SET_ITEM_DOWNLOAD_STATUS', () => {
    const readyState: QueueState = {
      jobs: [
        {
          id: 'job_dl_1',
          url: 'https://instagram.com/p/DL123/',
          normalizedUrl: 'https://www.instagram.com/p/DL123/',
          shortcode: 'DL123',
          status: 'ready',
          createdAt: 100,
          retryCount: 0,
          media: [
            { id: 'item_1', type: 'image', url: 'https://cdn.example.com/photo.jpg', filename: 'photo.jpg', status: 'pending' }
          ]
        }
      ],
      isPaused: false,
      activeJobId: null
    };

    const downloadingState = queueReducer(readyState, {
      type: 'SET_ITEM_DOWNLOAD_STATUS',
      payload: {
        jobId: 'job_dl_1',
        itemId: 'item_1',
        status: 'downloading',
        progress: 50
      }
    });

    expect(downloadingState.jobs[0].media?.[0].status).toBe('downloading');

    const completedState = queueReducer(downloadingState, {
      type: 'SET_ITEM_DOWNLOAD_STATUS',
      payload: {
        jobId: 'job_dl_1',
        itemId: 'item_1',
        status: 'completed',
        progress: 100
      }
    });

    expect(completedState.jobs[0].media?.[0].status).toBe('completed');
  });

  it('updates overall downloadAllStats on SET_DOWNLOAD_ALL_STATS', () => {
    const state = queueReducer(initialState, {
      type: 'SET_DOWNLOAD_ALL_STATS',
      payload: {
        active: true,
        total: 5,
        completed: 2,
        failed: 0,
        currentFilename: 'photo_3.jpg'
      }
    });

    expect(state.downloadAllStats?.active).toBe(true);
    expect(state.downloadAllStats?.total).toBe(5);
    expect(state.downloadAllStats?.completed).toBe(2);
    expect(state.downloadAllStats?.currentFilename).toBe('photo_3.jpg');
  });
});
