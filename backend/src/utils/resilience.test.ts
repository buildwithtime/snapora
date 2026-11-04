import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isMediaUrlExpired,
  hasExpiredMediaUrls,
  MetadataCache,
  UpstreamCooldownTracker,
  SingleFlightDeduplicator,
  UpstreamResilienceManager
} from './resilience.js';
import { ResolveResult, ProfileDiscoveryResult } from '../providers/types.js';

describe('Resilience Utilities Suite', () => {
  describe('isMediaUrlExpired & hasExpiredMediaUrls', () => {
    it('returns false for URLs without expiration tokens', () => {
      expect(isMediaUrlExpired('https://scontent.cdninstagram.com/v/test.jpg')).toBe(false);
      expect(isMediaUrlExpired('')).toBe(false);
    });

    it('identifies expired and valid hex oe parameters', () => {
      const pastSeconds = Math.floor(Date.now() / 1000) - 300;
      const pastHex = pastSeconds.toString(16);
      const expiredUrl = `https://scontent.cdninstagram.com/v/test.jpg?oe=${pastHex}`;
      expect(isMediaUrlExpired(expiredUrl)).toBe(true);

      const futureSeconds = Math.floor(Date.now() / 1000) + 3600;
      const futureHex = futureSeconds.toString(16);
      const validUrl = `https://scontent.cdninstagram.com/v/test.jpg?oe=${futureHex}`;
      expect(isMediaUrlExpired(validUrl)).toBe(false);
    });

    it('identifies expired decimal expires parameters', () => {
      const pastSeconds = Math.floor(Date.now() / 1000) - 100;
      const expiredUrl = `https://scontent.cdninstagram.com/v/test.mp4?expires=${pastSeconds}`;
      expect(isMediaUrlExpired(expiredUrl)).toBe(true);

      const futureSeconds = Math.floor(Date.now() / 1000) + 1200;
      const validUrl = `https://scontent.cdninstagram.com/v/test.mp4?expires=${futureSeconds}`;
      expect(isMediaUrlExpired(validUrl)).toBe(false);
    });

    it('detects expired media URLs in ResolveResult', () => {
      const pastHex = (Math.floor(Date.now() / 1000) - 60).toString(16);
      const expiredResult: ResolveResult = {
        ok: true,
        status: 'ready',
        provider: 'public',
        shortcode: 'ABC123xyz',
        media: [
          {
            id: 'm1',
            type: 'image',
            url: `https://scontent.cdninstagram.com/photo.jpg?oe=${pastHex}`
          }
        ]
      };
      expect(hasExpiredMediaUrls(expiredResult)).toBe(true);

      const futureHex = (Math.floor(Date.now() / 1000) + 3600).toString(16);
      const validResult: ResolveResult = {
        ok: true,
        status: 'ready',
        provider: 'public',
        shortcode: 'ABC123xyz',
        media: [
          {
            id: 'm1',
            type: 'image',
            url: `https://scontent.cdninstagram.com/photo.jpg?oe=${futureHex}`
          }
        ]
      };
      expect(hasExpiredMediaUrls(validResult)).toBe(false);
    });
  });

  describe('MetadataCache (Bounded LRU & TTL)', () => {
    let cache: MetadataCache;

    beforeEach(() => {
      cache = new MetadataCache(3); // Small capacity for LRU test
    });

    it('stores and retrieves valid results', () => {
      const result: ResolveResult = {
        ok: true,
        status: 'ready',
        provider: 'public',
        shortcode: 'post1',
        media: [{ id: '1', type: 'image', url: 'https://cdn.example.com/1.jpg' }]
      };

      cache.set('post:post1', result, 'post');
      const retrieved = cache.get<ResolveResult>('post:post1');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.shortcode).toBe('post1');
    });

    it('strictly does not cache failure responses', () => {
      const failureResult: ResolveResult = {
        ok: false,
        status: 'rate_limited',
        provider: 'public',
        shortcode: 'failed_post',
        error: { code: 'UPSTREAM_RATE_LIMITED', message: 'Rate limited' }
      };

      cache.set('post:failed', failureResult, 'post');
      expect(cache.get('post:failed')).toBeNull();
      expect(cache.size).toBe(0);
    });

    it('evicts least recently used items when capacity is exceeded', () => {
      const makePost = (id: string): ResolveResult => ({
        ok: true,
        status: 'ready',
        provider: 'public',
        shortcode: id,
        media: [{ id, type: 'image', url: `https://cdn.example.com/${id}.jpg` }]
      });

      cache.set('post:1', makePost('1'), 'post');
      cache.set('post:2', makePost('2'), 'post');
      cache.set('post:3', makePost('3'), 'post');

      expect(cache.size).toBe(3);

      // Access post:1 to make it most recently used; post:2 becomes oldest
      cache.get('post:1');

      // Add 4th item, should evict post:2
      cache.set('post:4', makePost('4'), 'post');

      expect(cache.get('post:2')).toBeNull();
      expect(cache.get('post:1')).not.toBeNull();
      expect(cache.get('post:3')).not.toBeNull();
      expect(cache.get('post:4')).not.toBeNull();
    });

    it('purges and returns null when signed media URL expires', () => {
      const futureHex = (Math.floor(Date.now() / 1000) + 1).toString(16);
      const postWithExpiringUrl: ResolveResult = {
        ok: true,
        status: 'ready',
        provider: 'public',
        shortcode: 'expiring',
        media: [{ id: '1', type: 'image', url: `https://cdn.example.com/1.jpg?oe=${futureHex}` }]
      };

      // Set item (bufferSeconds in hasExpiredMediaUrls checks within 60s, so +1s will be caught as expired)
      cache.set('post:expiring', postWithExpiringUrl, 'post');
      // Should not have cached since URL is already within bufferSeconds
      expect(cache.get('post:expiring')).toBeNull();
    });
  });

  describe('UpstreamCooldownTracker', () => {
    let tracker: UpstreamCooldownTracker;

    beforeEach(() => {
      tracker = new UpstreamCooldownTracker();
    });

    it('tracks cooldown state with Retry-After', () => {
      expect(tracker.isCoolingDown('www.instagram.com').coolingDown).toBe(false);

      const duration = tracker.record429('www.instagram.com', 45);
      expect(duration).toBe(45);

      const status = tracker.isCoolingDown('www.instagram.com');
      expect(status.coolingDown).toBe(true);
      expect(status.remainingSeconds).toBeGreaterThanOrEqual(44);
      expect(status.remainingSeconds).toBeLessThanOrEqual(45);
    });

    it('applies exponential backoff on repeated 429s when Retry-After is absent', () => {
      const d1 = tracker.record429('www.instagram.com');
      expect(d1).toBe(60);

      const d2 = tracker.record429('www.instagram.com');
      expect(d2).toBe(120);

      const d3 = tracker.record429('www.instagram.com');
      expect(d3).toBe(240);

      tracker.recordSuccess('www.instagram.com');
      const d4 = tracker.record429('www.instagram.com');
      expect(d4).toBe(60); // Reset after success
    });
  });

  describe('SingleFlightDeduplicator', () => {
    let deduplicator: SingleFlightDeduplicator;

    beforeEach(() => {
      deduplicator = new SingleFlightDeduplicator();
    });

    it('coalesces concurrent requests to the same key into a single invocation', async () => {
      let callCount = 0;
      const op = async () => {
        callCount++;
        await new Promise((r) => setTimeout(r, 30));
        return 'success';
      };

      let dedupeNotified = false;
      const [p1, p2, p3] = await Promise.all([
        deduplicator.execute('k1', op),
        deduplicator.execute('k1', op, undefined, () => {
          dedupeNotified = true;
        }),
        deduplicator.execute('k1', op)
      ]);

      expect(p1).toBe('success');
      expect(p2).toBe('success');
      expect(p3).toBe('success');
      expect(callCount).toBe(1);
      expect(dedupeNotified).toBe(true);
    });

    it('subscriber-aware cancellation: cancelling one subscriber does not abort operation for others', async () => {
      let executed = false;
      const op = async (signal: AbortSignal) => {
        await new Promise((resolve, reject) => {
          const t = setTimeout(() => {
            executed = true;
            resolve('done');
          }, 60);
          signal.addEventListener('abort', () => {
            clearTimeout(t);
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
        return 'done';
      };

      const c1 = new AbortController();
      const p1 = deduplicator.execute('k_cancel', op, c1.signal);
      const p2 = deduplicator.execute('k_cancel', op); // second subscriber does not abort

      // Abort first subscriber
      c1.abort();

      await expect(p1).rejects.toThrow();
      const res2 = await p2;
      expect(res2).toBe('done');
      expect(executed).toBe(true);
    });

    it('all subscribers cancelling aborts the upstream operation where supported', async () => {
      let upstreamAborted = false;
      const op = async (signal: AbortSignal) => {
        return new Promise<string>((resolve, reject) => {
          const t = setTimeout(() => {
            resolve('done');
          }, 100);
          signal.addEventListener('abort', () => {
            clearTimeout(t);
            upstreamAborted = true;
            reject(new DOMException('Operation was aborted', 'AbortError'));
          });
        });
      };

      const c1 = new AbortController();
      const c2 = new AbortController();
      const p1 = deduplicator.execute('k_all_cancel', op, c1.signal);
      const p2 = deduplicator.execute('k_all_cancel', op, c2.signal);

      // Abort both subscribers
      c1.abort();
      c2.abort();

      await expect(p1).rejects.toThrow();
      await expect(p2).rejects.toThrow();
      expect(upstreamAborted).toBe(true);
      expect(deduplicator.activeCount).toBe(0);
    });
  });

  describe('UpstreamResilienceManager Integration', () => {
    let manager: UpstreamResilienceManager;

    beforeEach(() => {
      manager = new UpstreamResilienceManager();
    });

    it('short-circuits during active cooldown without executing operation', async () => {
      manager.cooldownTracker.record429('www.instagram.com', 50);

      let opCalled = false;
      const result = await manager.executeResolve('https://www.instagram.com/p/test/', 'test', async () => {
        opCalled = true;
        return { ok: true, status: 'ready', provider: 'public', shortcode: 'test' };
      });

      expect(opCalled).toBe(false);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('UPSTREAM_RATE_LIMITED');
        expect(result.error.retryAfterSeconds).toBeGreaterThanOrEqual(49);
      }

      const metrics = manager.getMetrics();
      expect(metrics.cooldownShortCircuits).toBe(1);
    });

    it('retries eligible transient errors (502/503/timeout)', async () => {
      let attempts = 0;
      const result = await manager.executeResolve('https://www.instagram.com/p/test_retry/', 'test_retry', async () => {
        attempts++;
        if (attempts === 1) {
          return {
            ok: false,
            status: 'temporarily_unavailable',
            provider: 'public',
            shortcode: 'test_retry',
            error: { code: 'PAGE_FETCH_FAILED', message: 'ECONNRESET socket hang up' }
          };
        }
        return {
          ok: true,
          status: 'ready',
          provider: 'public',
          shortcode: 'test_retry',
          media: [{ id: '1', type: 'image', url: 'https://cdn.example.com/ok.jpg' }]
        };
      });

      expect(attempts).toBe(2);
      expect(result.ok).toBe(true);
      const metrics = manager.getMetrics();
      expect(metrics.retryCount).toBe(1);
      expect(metrics.successfulResolutions).toBe(1);
    });

    it('does not retry 429 errors and activates cooldown', async () => {
      let attempts = 0;
      const result = await manager.executeResolve('https://www.instagram.com/p/test_429/', 'test_429', async () => {
        attempts++;
        return {
          ok: false,
          status: 'rate_limited',
          provider: 'public',
          shortcode: 'test_429',
          error: { code: 'RATE_LIMITED', message: 'Throttled', retryAfterSeconds: 30 }
        };
      });

      expect(attempts).toBe(1); // No retry
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('UPSTREAM_RATE_LIMITED');
        expect(result.error.retryAfterSeconds).toBe(30);
      }

      const cooldown = manager.cooldownTracker.isCoolingDown('www.instagram.com');
      expect(cooldown.coolingDown).toBe(true);

      const metrics = manager.getMetrics();
      expect(metrics.upstream429Count).toBe(1);
      expect(metrics.retryCount).toBe(0);
    });

    it('collects aggregate operational metrics accurately', async () => {
      // 1. Initial resolution (cache miss + success)
      await manager.executeResolve('https://www.instagram.com/p/metrics_1/', 'metrics_1', async () => ({
        ok: true,
        status: 'ready',
        provider: 'public',
        shortcode: 'metrics_1',
        media: [{ id: '1', type: 'image', url: 'https://cdn.example.com/m.jpg' }]
      }));

      // 2. Second resolution for same post (cache hit)
      await manager.executeResolve('https://www.instagram.com/p/metrics_1/', 'metrics_1', async () => ({
        ok: true,
        status: 'ready',
        provider: 'public',
        shortcode: 'metrics_1'
      }));

      const metrics = manager.getMetrics();
      expect(metrics.cacheMisses).toBe(1);
      expect(metrics.cacheHits).toBe(1);
      expect(metrics.successfulResolutions).toBe(1);
      expect(metrics.cachedEntriesCount).toBe(1);
    });
  });
});

