import { describe, it, expect } from 'vitest';
import { QueueState } from '../types/queue.js';
import { queueReducer, isMediaUrlExpired } from './QueueContext.js';

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

  it('handles REFRESH_JOB_MEDIA action to update URLs and clear error states', () => {
    const failedState: QueueState = {
      jobs: [
        {
          id: 'job_refresh_1',
          url: 'https://instagram.com/p/REF123/',
          normalizedUrl: 'https://www.instagram.com/p/REF123/',
          shortcode: 'REF123',
          status: 'failed',
          createdAt: 100,
          retryCount: 1,
          error: { code: 'EXPIRED_MEDIA_URL', message: 'Expired' },
          media: [
            { id: 'm1', type: 'image', url: 'https://cdn.example.com/stale.jpg', filename: 'photo.jpg', status: 'failed' }
          ]
        }
      ],
      isPaused: false,
      activeJobId: null
    };

    const refreshedState = queueReducer(failedState, {
      type: 'REFRESH_JOB_MEDIA',
      payload: {
        jobId: 'job_refresh_1',
        media: [
          { id: 'm1', type: 'image', url: 'https://cdn.example.com/fresh.jpg', filename: 'photo.jpg', status: 'pending' }
        ]
      }
    });

    expect(refreshedState.jobs[0].media?.[0].url).toBe('https://cdn.example.com/fresh.jpg');
    expect(refreshedState.jobs[0].media?.[0].status).toBe('pending');
    expect(refreshedState.jobs[0].error).toBeUndefined();
    expect(refreshedState.jobs[0].status).toBe('ready');
  });

  describe('isMediaUrlExpired utility', () => {
    it('returns false when URL does not contain an oe parameter', () => {
      expect(isMediaUrlExpired('https://example.com/photo.jpg')).toBe(false);
      expect(isMediaUrlExpired('')).toBe(false);
      expect(isMediaUrlExpired(undefined)).toBe(false);
    });

    it('returns true when oe hex timestamp has expired in the past', () => {
      // 1000 seconds in the past
      const pastSec = Math.floor(Date.now() / 1000) - 1000;
      const pastHex = pastSec.toString(16);
      const expiredUrl = `https://scontent.cdninstagram.com/v/t51/photo.jpg?oh=abc&oe=${pastHex}`;
      expect(isMediaUrlExpired(expiredUrl)).toBe(true);
    });

    it('returns true when oe timestamp expires within 60 seconds (safety margin)', () => {
      // 30 seconds into the future (within the 60s buffer)
      const nearSec = Math.floor(Date.now() / 1000) + 30;
      const nearHex = nearSec.toString(16);
      const nearUrl = `https://scontent.cdninstagram.com/v/t51/photo.jpg?oh=abc&oe=${nearHex}`;
      expect(isMediaUrlExpired(nearUrl)).toBe(true);
    });

    it('returns false when oe timestamp is comfortably in the future', () => {
      // 24 hours into the future
      const futureSec = Math.floor(Date.now() / 1000) + 86400;
      const futureHex = futureSec.toString(16);
      const freshUrl = `https://scontent.cdninstagram.com/v/t51/photo.jpg?oh=abc&oe=${futureHex}`;
      expect(isMediaUrlExpired(freshUrl)).toBe(false);
    });
  });

  describe('Bounded Retry & Refresh Guarantees', () => {
    it('updates carousel items and media simultaneously on REFRESH_JOB_MEDIA', () => {
      const state: QueueState = {
        jobs: [
          {
            id: 'job_carousel',
            url: 'https://instagram.com/p/CAROUSEL1/',
            normalizedUrl: 'https://www.instagram.com/p/CAROUSEL1/',
            shortcode: 'CAROUSEL1',
            status: 'failed',
            createdAt: 100,
            retryCount: 1,
            media: [
              { id: 'm1', type: 'image', url: 'https://cdn.example.com/stale_slide1.jpg', filename: 'slide1.jpg' }
            ],
            carouselItems: [
              { id: 'c1', index: 0, type: 'image', url: 'https://cdn.example.com/stale_slide1.jpg', filename: 'slide1.jpg' },
              { id: 'c2', index: 1, type: 'video', url: 'https://cdn.example.com/stale_slide2.mp4', filename: 'slide2.mp4' }
            ]
          }
        ],
        isPaused: false,
        activeJobId: null
      };

      const refreshed = queueReducer(state, {
        type: 'REFRESH_JOB_MEDIA',
        payload: {
          jobId: 'job_carousel',
          media: [
            { id: 'm1', type: 'image', url: 'https://cdn.example.com/fresh_slide1.jpg', filename: 'slide1.jpg' }
          ],
          carouselItems: [
            { id: 'c1', index: 0, type: 'image', url: 'https://cdn.example.com/fresh_slide1.jpg', filename: 'slide1.jpg' },
            { id: 'c2', index: 1, type: 'video', url: 'https://cdn.example.com/fresh_slide2.mp4', filename: 'slide2.mp4' }
          ]
        }
      });

      expect(refreshed.jobs[0].media?.[0].url).toBe('https://cdn.example.com/fresh_slide1.jpg');
      expect(refreshed.jobs[0].carouselItems?.[0].url).toBe('https://cdn.example.com/fresh_slide1.jpg');
      expect(refreshed.jobs[0].carouselItems?.[1].url).toBe('https://cdn.example.com/fresh_slide2.mp4');
      expect(refreshed.jobs[0].status).toBe('ready');
      expect(refreshed.jobs[0].error).toBeUndefined();
    });

    it('strictly bounds retry counter and only transitions failed jobs', () => {
      const state: QueueState = {
        jobs: [
          {
            id: 'job_bounds',
            url: 'https://instagram.com/p/TEST_BOUNDS/',
            normalizedUrl: 'https://www.instagram.com/p/TEST_BOUNDS/',
            shortcode: 'TEST_BOUNDS',
            status: 'failed',
            createdAt: 100,
            retryCount: 2,
            error: { code: 'HTTP_403_FORBIDDEN', message: 'Forbidden' }
          }
        ],
        isPaused: false,
        activeJobId: null
      };

      const retried = queueReducer(state, {
        type: 'RETRY_JOB',
        payload: { jobId: 'job_bounds' }
      });

      expect(retried.jobs[0].status).toBe('queued');
      expect(retried.jobs[0].retryCount).toBe(3);
      expect(retried.jobs[0].error).toBeUndefined();

      // Attempting to retry an already queued job must NOT increment retryCount or re-trigger
      const retriedAgain = queueReducer(retried, {
        type: 'RETRY_JOB',
        payload: { jobId: 'job_bounds' }
      });
      expect(retriedAgain.jobs[0].status).toBe('queued');
      expect(retriedAgain.jobs[0].retryCount).toBe(3);
    });
  });
});
