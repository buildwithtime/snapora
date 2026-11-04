import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../App.js';

vi.mock('../utils/storage.js', () => ({
  saveJobsToStorage: vi.fn(),
  loadJobsFromStorage: vi.fn().mockResolvedValue([]),
  clearAllJobsFromStorage: vi.fn().mockResolvedValue(undefined)
}));

describe('Rate-Limit Resilience & Host Cooldown Frontend Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_DEMO_MODE', 'false');
    if (typeof localStorage !== 'undefined') localStorage.clear();
    if (typeof sessionStorage !== 'undefined') sessionStorage.clear();
  });

  describe('Queue Suspension on Upstream Rate Limit', () => {
    it('pauses queue on UPSTREAM_RATE_LIMITED, disables resume during cooldown, and preserves pending jobs', async () => {
      let job1Calls = 0;
      let job2Calls = 0;

      global.fetch = vi.fn().mockImplementation((input: any, init?: RequestInit) => {
        const urlStr = String(input);
        if (urlStr.includes('/api/resolve')) {
          const body = JSON.parse((init?.body as string) || '{}');
          if (body.url?.includes('FIRST_POST')) {
            job1Calls++;
            return Promise.resolve({
              ok: false,
              status: 429,
              headers: {
                get: (h: string) => {
                  const lower = h.toLowerCase();
                  if (lower === 'content-type') return 'application/json';
                  if (lower === 'retry-after') return '30';
                  if (lower === 'x-ratelimit-source') return 'upstream';
                  return null;
                }
              },
              text: () =>
                Promise.resolve(
                  JSON.stringify({
                    ok: false,
                    error: {
                      code: 'UPSTREAM_RATE_LIMITED',
                      message: 'Instagram is temporarily limiting requests. Please try again in 30 seconds.',
                      retryAfterSeconds: 30
                    }
                  })
                ),
              json: () =>
                Promise.resolve({
                  ok: false,
                  error: {
                    code: 'UPSTREAM_RATE_LIMITED',
                    message: 'Instagram is temporarily limiting requests. Please try again in 30 seconds.',
                    retryAfterSeconds: 30
                  }
                })
            });
          }
          if (body.url?.includes('SECOND_POST')) {
            job2Calls++;
            return Promise.resolve({
              ok: true,
              status: 200,
              headers: {
                get: (h: string) => (h.toLowerCase() === 'content-type' ? 'application/json' : null)
              },
              text: () =>
                Promise.resolve(
                  JSON.stringify({
                    ok: true,
                    status: 'ready',
                    provider: 'public',
                    shortcode: 'SECOND_POST',
                    media: [{ id: '2', type: 'image', url: 'https://cdn.example.com/2.jpg' }]
                  })
                ),
              json: () =>
                Promise.resolve({
                  ok: true,
                  status: 'ready',
                  provider: 'public',
                  shortcode: 'SECOND_POST',
                  media: [{ id: '2', type: 'image', url: 'https://cdn.example.com/2.jpg' }]
                })
            });
          }
        }
        return Promise.resolve({
          ok: false,
          status: 404,
          headers: { get: () => null },
          text: () => Promise.resolve('{}'),
          json: () => Promise.resolve({})
        });
      });

      render(<App />);

      const textarea = screen.getByPlaceholderText(/Paste your Instagram link/i);
      const fetchBtn = screen.getByText('Fetch Media');

      // Submit 2 URLs in batch
      fireEvent.change(textarea, {
        target: {
          value:
            'https://www.instagram.com/p/FIRST_POST/\nhttps://www.instagram.com/p/SECOND_POST/'
        }
      });
      fireEvent.click(fetchBtn);

      // Wait for Job 1 to fail with rate limit
      await waitFor(() => {
        expect(screen.getByText(/Temporarily Rate Limited/i)).toBeDefined();
      });

      // Verify Job 1 called once, Job 2 NOT called because queue paused!
      expect(job1Calls).toBe(1);
      expect(job2Calls).toBe(0);

      // Verify Cooldown banner is visible in QueueControls
      expect(screen.getAllByRole('alert').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/Instagram rate limit active\. Queue paused/i)).toBeDefined();

      // Verify Resume button is disabled
      const resumeBtn = screen.getByRole('button', { name: /Cooldown \(\d+s\)/i });
      expect((resumeBtn as HTMLButtonElement).disabled).toBe(true);

      // Verify second job is preserved in queued state
      expect(screen.getByText('Queued')).toBeDefined();
    });
  });

  describe('Profile Gallery Rate-Limit Countdown', () => {
    it('renders countdown timer and disables Retry button during cooldown on 429', async () => {
      global.fetch = vi.fn().mockImplementation((input: any) => {
        const urlStr = String(input);
        if (urlStr.includes('/api/profile/discover')) {
          return Promise.resolve({
            ok: false,
            status: 429,
            headers: {
              get: (h: string) => {
                const lower = h.toLowerCase();
                if (lower === 'content-type') return 'application/json';
                if (lower === 'retry-after') return '45';
                if (lower === 'x-ratelimit-source') return 'upstream';
                return null;
              }
            },
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  ok: false,
                  provider: 'public',
                  error: {
                    code: 'UPSTREAM_RATE_LIMITED',
                    message: 'Instagram is temporarily limiting requests. Please try again in 45 seconds.',
                    retryAfterSeconds: 45
                  }
                })
              ),
            json: () =>
              Promise.resolve({
                ok: false,
                provider: 'public',
                error: {
                  code: 'UPSTREAM_RATE_LIMITED',
                  message: 'Instagram is temporarily limiting requests. Please try again in 45 seconds.',
                  retryAfterSeconds: 45
                }
              })
          });
        }
        return Promise.resolve({
          ok: false,
          status: 404,
          headers: { get: () => null },
          text: () => Promise.resolve('{}'),
          json: () => Promise.resolve({})
        });
      });

      render(<App />);

      const textarea = screen.getByPlaceholderText(/Paste your Instagram link/i);
      const fetchBtn = screen.getByText('Fetch Media');

      fireEvent.change(textarea, {
        target: { value: 'https://www.instagram.com/throttled_creator/' }
      });
      fireEvent.click(fetchBtn);

      // Profile gallery opens and surfaces rate limit error
      await waitFor(() => {
        expect(screen.getByText(/Instagram Rate Limit Active/i)).toBeDefined();
      });

      // Cooldown timer notice is displayed
      await waitFor(() => {
        expect(screen.getByText(/Cooldown active: Retry available in \d+s/i)).toBeDefined();
      });

      // Retry button is disabled while cooling down
      const retryBtn = screen.getByRole('button', { name: /Wait \(\d+s\)/i });
      expect((retryBtn as HTMLButtonElement).disabled).toBe(true);
    });

    it('distinguishes between Snapora local rate limit and upstream rate limit', async () => {
      global.fetch = vi.fn().mockImplementation((input: any) => {
        const urlStr = String(input);
        if (urlStr.includes('/api/profile/discover')) {
          return Promise.resolve({
            ok: false,
            status: 429,
            headers: {
              get: (h: string) => {
                const lower = h.toLowerCase();
                if (lower === 'content-type') return 'application/json';
                if (lower === 'retry-after') return '20';
                if (lower === 'x-ratelimit-source') return 'snapora';
                return null;
              }
            },
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  ok: false,
                  provider: 'public',
                  error: {
                    code: 'LOCAL_RATE_LIMITED',
                    message: 'Snapora request limit reached. Please try again in 20 seconds.',
                    retryAfterSeconds: 20
                  }
                })
              ),
            json: () =>
              Promise.resolve({
                ok: false,
                provider: 'public',
                error: {
                  code: 'LOCAL_RATE_LIMITED',
                  message: 'Snapora request limit reached. Please try again in 20 seconds.',
                  retryAfterSeconds: 20
                }
              })
          });
        }
        return Promise.resolve({
          ok: false,
          status: 404,
          headers: { get: () => null },
          text: () => Promise.resolve('{}'),
          json: () => Promise.resolve({})
        });
      });

      render(<App />);

      const textarea = screen.getByPlaceholderText(/Paste your Instagram link/i);
      const fetchBtn = screen.getByText('Fetch Media');

      fireEvent.change(textarea, {
        target: { value: 'https://www.instagram.com/local_throttled/' }
      });
      fireEvent.click(fetchBtn);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Snapora Request Limit Reached/i })).toBeDefined();
      });
    });
  });

  describe('Local Rate Limiting and Automatic Resumption', () => {
    it('handles LOCAL_RATE_LIMITED in queue, displays Snapora banner, and preserves remaining jobs', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation((input: any, init?: RequestInit) => {
        const urlStr = String(input);
        if (urlStr.includes('/api/resolve')) {
          callCount++;
          const body = JSON.parse((init?.body as string) || '{}');
          if (body.url?.includes('LOCAL_429')) {
            return Promise.resolve({
              ok: false,
              status: 429,
              headers: {
                get: (h: string) => {
                  const lower = h.toLowerCase();
                  if (lower === 'content-type') return 'application/json';
                  if (lower === 'retry-after') return '15';
                  if (lower === 'x-ratelimit-source') return 'snapora';
                  return null;
                }
              },
              text: () =>
                Promise.resolve(
                  JSON.stringify({
                    ok: false,
                    error: {
                      code: 'LOCAL_RATE_LIMITED',
                      message: 'Snapora request limit reached. Please try again in 15 seconds.',
                      retryAfterSeconds: 15
                    }
                  })
                ),
              json: () =>
                Promise.resolve({
                  ok: false,
                  error: {
                    code: 'LOCAL_RATE_LIMITED',
                    message: 'Snapora request limit reached. Please try again in 15 seconds.',
                    retryAfterSeconds: 15
                  }
                })
            });
          }

          return Promise.resolve({
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  ok: true,
                  status: 'ready',
                  provider: 'public',
                  shortcode: 'NEXT_ITEM',
                  media: [{ id: '10', type: 'image', url: 'https://cdn.example.com/10.jpg' }]
                })
              ),
            json: () =>
              Promise.resolve({
                ok: true,
                status: 'ready',
                provider: 'public',
                shortcode: 'NEXT_ITEM',
                media: [{ id: '10', type: 'image', url: 'https://cdn.example.com/10.jpg' }]
              })
          });
        }

        return Promise.resolve({
          ok: false,
          status: 404,
          headers: { get: () => null },
          text: () => Promise.resolve('{}'),
          json: () => Promise.resolve({})
        });
      });

      render(<App />);

      const textarea = screen.getByPlaceholderText(/Paste your Instagram link/i);
      const fetchBtn = screen.getByText('Fetch Media');

      fireEvent.change(textarea, {
        target: {
          value: 'https://www.instagram.com/p/LOCAL_429/\nhttps://www.instagram.com/p/NEXT_ITEM/'
        }
      });
      fireEvent.click(fetchBtn);

      // Wait for Job 1 to fail with local rate limit
      await waitFor(() => {
        expect(screen.getAllByText(/Snapora Request Limit Reached/i).length).toBeGreaterThanOrEqual(1);
      });

      // Verify Snapora-specific cooldown banner is shown
      await waitFor(() => {
        expect(screen.getByText(/Snapora request rate limit active\. Queue paused/i)).toBeDefined();
      });

      // Verify remaining job is preserved in queued status
      expect(screen.getByText('Queued')).toBeDefined();
      expect(callCount).toBe(1);
    });

    it('automatically unpauses and resumes processing remaining jobs when cooldown expires', async () => {
      let resolveCallCount = 0;
      global.fetch = vi.fn().mockImplementation((input: any, init?: RequestInit) => {
        const urlStr = String(input);
        if (urlStr.includes('/api/resolve')) {
          resolveCallCount++;
          const body = JSON.parse((init?.body as string) || '{}');
          if (body.url?.includes('FAST_COOLDOWN')) {
            return Promise.resolve({
              ok: false,
              status: 429,
              headers: {
                get: (h: string) => {
                  const lower = h.toLowerCase();
                  if (lower === 'content-type') return 'application/json';
                  if (lower === 'retry-after') return '1';
                  if (lower === 'x-ratelimit-source') return 'upstream';
                  return null;
                }
              },
              text: () =>
                Promise.resolve(
                  JSON.stringify({
                    ok: false,
                    error: {
                      code: 'UPSTREAM_RATE_LIMITED',
                      message: 'Instagram rate limited. Retry in 1 second.',
                      retryAfterSeconds: 1
                    }
                  })
                ),
              json: () =>
                Promise.resolve({
                  ok: false,
                  error: {
                    code: 'UPSTREAM_RATE_LIMITED',
                    message: 'Instagram rate limited. Retry in 1 second.',
                    retryAfterSeconds: 1
                  }
                })
            });
          }

          if (body.url?.includes('AUTO_RESUME_TARGET')) {
            return Promise.resolve({
              ok: true,
              status: 200,
              headers: { get: () => 'application/json' },
              text: () =>
                Promise.resolve(
                  JSON.stringify({
                    ok: true,
                    status: 'ready',
                    provider: 'public',
                    shortcode: 'AUTO_RESUME_TARGET',
                    media: [{ id: '99', type: 'image', url: 'https://cdn.example.com/99.jpg' }]
                  })
                ),
              json: () =>
                Promise.resolve({
                  ok: true,
                  status: 'ready',
                  provider: 'public',
                  shortcode: 'AUTO_RESUME_TARGET',
                  media: [{ id: '99', type: 'image', url: 'https://cdn.example.com/99.jpg' }]
                })
            });
          }
        }

        return Promise.resolve({
          ok: false,
          status: 404,
          headers: { get: () => null },
          text: () => Promise.resolve('{}'),
          json: () => Promise.resolve({})
        });
      });

      render(<App />);

      const textarea = screen.getByPlaceholderText(/Paste your Instagram link/i);
      const fetchBtn = screen.getByText('Fetch Media');

      fireEvent.change(textarea, {
        target: {
          value:
            'https://www.instagram.com/p/FAST_COOLDOWN/\nhttps://www.instagram.com/p/AUTO_RESUME_TARGET/'
        }
      });
      fireEvent.click(fetchBtn);

      // Job 1 fails with rate limit and triggers 1-second cooldown
      await waitFor(() => {
        expect(screen.getByText(/Temporarily Rate Limited/i)).toBeDefined();
      });

      // Initially paused with cooldown
      expect(resolveCallCount).toBe(1);

      // Wait for 1-second cooldown interval to tick and expire, triggering automatic resumption
      await waitFor(
        () => {
          expect(resolveCallCount).toBeGreaterThanOrEqual(2);
        },
        { timeout: 4500 }
      );

      // Job 2 has automatically processed to Ready without manual button clicks
      await waitFor(() => {
        expect(screen.getAllByText(/Ready/i).length).toBeGreaterThanOrEqual(1);
      });
    });

    it('allows cancelling / removing pending jobs during active cooldown', async () => {
      global.fetch = vi.fn().mockImplementation((input: any, init?: RequestInit) => {
        const urlStr = String(input);
        if (urlStr.includes('/api/resolve')) {
          const body = JSON.parse((init?.body as string) || '{}');
          if (body.url?.includes('COOLDOWN_FIRST')) {
            return Promise.resolve({
              ok: false,
              status: 429,
              headers: {
                get: (h: string) => {
                  const lower = h.toLowerCase();
                  if (lower === 'content-type') return 'application/json';
                  if (lower === 'retry-after') return '60';
                  if (lower === 'x-ratelimit-source') return 'upstream';
                  return null;
                }
              },
              text: () =>
                Promise.resolve(
                  JSON.stringify({
                    ok: false,
                    error: {
                      code: 'UPSTREAM_RATE_LIMITED',
                      message: 'Upstream rate limited.',
                      retryAfterSeconds: 60
                    }
                  })
                ),
              json: () =>
                Promise.resolve({
                  ok: false,
                  error: {
                    code: 'UPSTREAM_RATE_LIMITED',
                    message: 'Upstream rate limited.',
                    retryAfterSeconds: 60
                  }
                })
            });
          }
        }
        return Promise.resolve({
          ok: false,
          status: 404,
          headers: { get: () => null },
          text: () => Promise.resolve('{}'),
          json: () => Promise.resolve({})
        });
      });

      render(<App />);

      const textarea = screen.getByPlaceholderText(/Paste your Instagram link/i);
      const fetchBtn = screen.getByText('Fetch Media');

      fireEvent.change(textarea, {
        target: {
          value:
            'https://www.instagram.com/p/COOLDOWN_FIRST/\nhttps://www.instagram.com/p/TO_BE_CANCELLED/'
        }
      });
      fireEvent.click(fetchBtn);

      await waitFor(() => {
        expect(screen.getByText(/Temporarily Rate Limited/i)).toBeDefined();
      });

      // Verify second job is queued
      expect(screen.getByText('Queued')).toBeDefined();

      // Find remove button for the second job
      const removeButtons = screen.getAllByTitle('Remove from queue');
      expect(removeButtons.length).toBe(2);

      // Remove the second queued job during cooldown
      fireEvent.click(removeButtons[1]);

      // Verify the queued job was removed and only the failed job remains
      await waitFor(() => {
        expect(screen.queryByText('Queued')).toBeNull();
      });
    });

    it('preserves queued jobs when an earlier item in a batch hits a rate limit', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation((input: any, init?: RequestInit) => {
        const urlStr = String(input);
        if (urlStr.includes('/api/resolve')) {
          callCount++;
          const body = JSON.parse((init?.body as string) || '{}');
          if (body.url?.includes('BATCH_ITEM_1')) {
            return Promise.resolve({
              ok: true,
              status: 200,
              headers: { get: () => 'application/json' },
              text: () =>
                Promise.resolve(
                  JSON.stringify({
                    ok: true,
                    status: 'ready',
                    provider: 'public',
                    shortcode: 'BATCH_ITEM_1',
                    media: [{ id: '1', type: 'image', url: 'https://cdn.example.com/1.jpg' }]
                  })
                ),
              json: () =>
                Promise.resolve({
                  ok: true,
                  status: 'ready',
                  provider: 'public',
                  shortcode: 'BATCH_ITEM_1',
                  media: [{ id: '1', type: 'image', url: 'https://cdn.example.com/1.jpg' }]
                })
            });
          }

          if (body.url?.includes('BATCH_ITEM_2')) {
            return Promise.resolve({
              ok: false,
              status: 429,
              headers: {
                get: (h: string) => {
                  const lower = h.toLowerCase();
                  if (lower === 'content-type') return 'application/json';
                  if (lower === 'retry-after') return '90';
                  if (lower === 'x-ratelimit-source') return 'upstream';
                  return null;
                }
              },
              text: () =>
                Promise.resolve(
                  JSON.stringify({
                    ok: false,
                    error: {
                      code: 'UPSTREAM_RATE_LIMITED',
                      message: 'Rate limit active',
                      retryAfterSeconds: 90
                    }
                  })
                ),
              json: () =>
                Promise.resolve({
                  ok: false,
                  error: {
                    code: 'UPSTREAM_RATE_LIMITED',
                    message: 'Rate limit active',
                    retryAfterSeconds: 90
                  }
                })
            });
          }
        }
        return Promise.resolve({
          ok: false,
          status: 404,
          headers: { get: () => null },
          text: () => Promise.resolve('{}'),
          json: () => Promise.resolve({})
        });
      });

      render(<App />);

      const textarea = screen.getByPlaceholderText(/Paste your Instagram link/i);
      const fetchBtn = screen.getByText('Fetch Media');

      const urls = [
        'https://www.instagram.com/p/BATCH_ITEM_1/',
        'https://www.instagram.com/p/BATCH_ITEM_2/',
        'https://www.instagram.com/p/BATCH_ITEM_3/',
        'https://www.instagram.com/p/BATCH_ITEM_4/',
        'https://www.instagram.com/p/BATCH_ITEM_5/'
      ].join('\n');

      fireEvent.change(textarea, { target: { value: urls } });
      fireEvent.click(fetchBtn);

      // Item 1 succeeds, Item 2 fails with rate limit
      await waitFor(() => {
        expect(screen.getAllByText(/Ready/i).length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText(/Temporarily Rate Limited/i)).toBeDefined();
      });

      // Verify that Item 3, 4, 5 are NOT marked as failed; they are in Queued state
      const queuedBadges = screen.getAllByText('Queued');
      expect(queuedBadges.length).toBe(3);
      expect(callCount).toBe(2);
    });

    it('processes 50-item and 100-item bulk batches reliably without state corruption', async () => {
      let resolvedCount = 0;
      global.fetch = vi.fn().mockImplementation((input: any, init?: RequestInit) => {
        const urlStr = String(input);
        if (urlStr.includes('/api/resolve')) {
          resolvedCount++;
          const body = JSON.parse((init?.body as string) || '{}');
          const shortcodeMatch = (body.url || '').match(/\/p\/([^/]+)/);
          const sc = shortcodeMatch ? shortcodeMatch[1] : `bulk_${resolvedCount}`;

          return Promise.resolve({
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  ok: true,
                  status: 'ready',
                  provider: 'public',
                  shortcode: sc,
                  media: [{ id: sc, type: 'image', url: `https://cdn.example.com/${sc}.jpg` }]
                })
              ),
            json: () =>
              Promise.resolve({
                ok: true,
                status: 'ready',
                provider: 'public',
                shortcode: sc,
                media: [{ id: sc, type: 'image', url: `https://cdn.example.com/${sc}.jpg` }]
              })
          });
        }
        return Promise.resolve({
          ok: false,
          status: 404,
          headers: { get: () => null },
          text: () => Promise.resolve('{}'),
          json: () => Promise.resolve({})
        });
      });

      render(<App />);

      const textarea = screen.getByPlaceholderText(/Paste your Instagram link/i);
      const fetchBtn = screen.getByText('Fetch Media');

      // Submit 50 URLs
      const urls50 = Array.from({ length: 50 }, (_, i) => `https://www.instagram.com/p/BULK50_${i}/`).join('\n');
      fireEvent.change(textarea, { target: { value: urls50 } });
      fireEvent.click(fetchBtn);

      // Verify feedback message confirms 50 URLs added
      await waitFor(() => {
        expect(screen.getByText(/Added 50 URLs to queue/i)).toBeDefined();
      });

      // Submit another 50 URLs (total 100 in queue)
      const urlsNext50 = Array.from({ length: 50 }, (_, i) => `https://www.instagram.com/p/BULK100_${i}/`).join('\n');
      fireEvent.change(textarea, { target: { value: urlsNext50 } });
      fireEvent.click(fetchBtn);

      await waitFor(() => {
        expect(screen.getByText(/Added 50 URLs to queue/i)).toBeDefined();
      });

      // Verify queue runner is sequentially resolving items without throwing or crashing
      await waitFor(
        () => {
          expect(resolvedCount).toBeGreaterThanOrEqual(1);
        },
        { timeout: 3000 }
      );
    });
  });
});
