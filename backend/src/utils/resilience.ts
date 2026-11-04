import { ResolveResult, ProfileDiscoveryResult } from '../providers/types.js';
import { formatRateLimitMessage } from './errors.js';

/**
 * Checks whether an Instagram CDN media URL contains an expiration parameter (e.g. `oe=` hex or `expires=` dec)
 * and whether that expiration timestamp has passed or is within bufferSeconds.
 */
export function isMediaUrlExpired(url: string, bufferSeconds = 60): boolean {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    // 1. Check `oe` parameter (standard hex Unix timestamp)
    const oeParam = parsed.searchParams.get('oe');
    if (oeParam) {
      const expiresAtSeconds = parseInt(oeParam, 16);
      if (!isNaN(expiresAtSeconds) && expiresAtSeconds > 0) {
        const currentSeconds = Math.floor(Date.now() / 1000);
        return currentSeconds + bufferSeconds >= expiresAtSeconds;
      }
    }

    // 2. Check `expires` parameter (decimal Unix timestamp)
    const expiresParam = parsed.searchParams.get('expires');
    if (expiresParam) {
      const expiresAtSeconds = parseInt(expiresParam, 10);
      if (!isNaN(expiresAtSeconds) && expiresAtSeconds > 0) {
        const currentSeconds = Math.floor(Date.now() / 1000);
        return currentSeconds + bufferSeconds >= expiresAtSeconds;
      }
    }
  } catch {
    // Malformed URL
    return false;
  }
  return false;
}

/**
 * Checks whether any media items in a ResolveResult or ProfileDiscoveryResult have expired CDN URLs.
 */
export function hasExpiredMediaUrls(result: ResolveResult | ProfileDiscoveryResult): boolean {
  if (!result || !result.ok) return false;

  // ResolveResult
  if ('media' in result && Array.isArray(result.media)) {
    for (const m of result.media) {
      if (m.url && isMediaUrlExpired(m.url)) return true;
      if (m.thumbnailUrl && isMediaUrlExpired(m.thumbnailUrl)) return true;
    }
  }

  if ('carouselItems' in result && Array.isArray(result.carouselItems)) {
    for (const c of result.carouselItems) {
      if (c.url && isMediaUrlExpired(c.url)) return true;
      if (c.thumbnailUrl && isMediaUrlExpired(c.thumbnailUrl)) return true;
    }
  }

  // ProfileDiscoveryResult
  if ('items' in result && Array.isArray(result.items)) {
    for (const item of result.items) {
      if (item.displayUrl && isMediaUrlExpired(item.displayUrl)) return true;
      if (item.thumbnailUrl && isMediaUrlExpired(item.thumbnailUrl)) return true;
      if (item.carouselMedia && Array.isArray(item.carouselMedia)) {
        for (const c of item.carouselMedia) {
          if (c.url && isMediaUrlExpired(c.url)) return true;
          if (c.thumbnailUrl && isMediaUrlExpired(c.thumbnailUrl)) return true;
        }
      }
    }
  }

  return false;
}

export interface CacheEntry<T> {
  value: T;
  type: 'post' | 'profile';
  expiresAt: number;
}

/**
 * Bounded LRU Cache for Instagram metadata.
 * - Maximum capacity (default 500 items).
 * - Profile TTL: 5 minutes.
 * - Post TTL: 15 minutes.
 * - Validates signed media URL expiration before returning cache hits.
 * - Never stores failures or error responses.
 */
export class MetadataCache {
  private cache = new Map<string, CacheEntry<ResolveResult | ProfileDiscoveryResult>>();
  private maxCapacity: number;

  static readonly PROFILE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  static readonly POST_TTL_MS = 15 * 60 * 1000;   // 15 minutes

  constructor(maxCapacity = 500) {
    this.maxCapacity = Math.max(1, maxCapacity);
  }

  get<T extends ResolveResult | ProfileDiscoveryResult>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    // TTL check
    if (Date.now() >= entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    // Validate signed URL freshness
    if (hasExpiredMediaUrls(entry.value)) {
      this.cache.delete(key);
      return null;
    }

    // Refresh LRU order (delete and re-insert)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return JSON.parse(JSON.stringify(entry.value)) as T;
  }

  set(key: string, value: ResolveResult | ProfileDiscoveryResult, type: 'post' | 'profile'): void {
    // Strictly do not cache failures, errors, 403, 429, or private content
    if (!value || !value.ok) {
      return;
    }

    // If media URLs are already expired, do not cache
    if (hasExpiredMediaUrls(value)) {
      return;
    }

    // Evict oldest LRU item if at max capacity
    if (this.cache.size >= this.maxCapacity && !this.cache.has(key)) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }

    const ttlMs = type === 'profile' ? MetadataCache.PROFILE_TTL_MS : MetadataCache.POST_TTL_MS;
    this.cache.set(key, {
      value: JSON.parse(JSON.stringify(value)),
      type,
      expiresAt: Date.now() + ttlMs
    });
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

/**
 * Tracks upstream host cooldown state.
 * When Instagram returns HTTP 429, a host cooldown is recorded for `www.instagram.com`.
 * Subsequent requests during active cooldown are short-circuited immediately.
 */
export class UpstreamCooldownTracker {
  private cooldownUntil = new Map<string, number>();
  private consecutive429s = new Map<string, number>();
  private defaultHost = 'www.instagram.com';

  record429(host = this.defaultHost, retryAfterSeconds?: number): number {
    const currentCount = (this.consecutive429s.get(host) || 0) + 1;
    this.consecutive429s.set(host, currentCount);

    let durationSeconds: number;
    if (typeof retryAfterSeconds === 'number' && retryAfterSeconds > 0) {
      durationSeconds = Math.min(retryAfterSeconds, 3600);
    } else {
      // Exponential backoff: 60s, 120s, 240s, 480s, 960s, max 1800s
      durationSeconds = Math.min(1800, 60 * Math.pow(2, Math.min(currentCount - 1, 5)));
    }

    const until = Date.now() + durationSeconds * 1000;
    this.cooldownUntil.set(host, until);
    return durationSeconds;
  }

  recordSuccess(host = this.defaultHost): void {
    this.consecutive429s.delete(host);
  }

  isCoolingDown(host = this.defaultHost): { coolingDown: boolean; remainingSeconds: number } {
    const until = this.cooldownUntil.get(host);
    if (!until) {
      return { coolingDown: false, remainingSeconds: 0 };
    }

    const diffMs = until - Date.now();
    if (diffMs <= 0) {
      this.cooldownUntil.delete(host);
      return { coolingDown: false, remainingSeconds: 0 };
    }

    return {
      coolingDown: true,
      remainingSeconds: Math.ceil(diffMs / 1000)
    };
  }

  reset(host?: string): void {
    if (host) {
      this.cooldownUntil.delete(host);
      this.consecutive429s.delete(host);
    } else {
      this.cooldownUntil.clear();
      this.consecutive429s.clear();
    }
  }
}

interface InFlightEntry<T> {
  promise: Promise<T>;
  abortController: AbortController;
  subscribers: Set<string>;
}

/**
 * Single-flight request deduplicator with subscriber-aware cancellation.
 * Ensures concurrent requests for identical keys share a single network call.
 * If one consumer aborts, upstream continues unless all subscribers have aborted.
 */
export class SingleFlightDeduplicator {
  private inFlight = new Map<string, InFlightEntry<any>>();

  async execute<T>(
    key: string,
    operation: (signal: AbortSignal) => Promise<T>,
    callerSignal?: AbortSignal,
    onDeduplicated?: () => void
  ): Promise<T> {
    const existing = this.inFlight.get(key);
    const subscriberId = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    if (existing) {
      if (onDeduplicated) {
        onDeduplicated();
      }

      return new Promise<T>((resolve, reject) => {
        if (callerSignal?.aborted) {
          return reject(
            callerSignal.reason || new DOMException('Operation was aborted', 'AbortError')
          );
        }

        existing.subscribers.add(subscriberId);

        const onAbort = () => {
          existing.subscribers.delete(subscriberId);
          if (callerSignal) callerSignal.removeEventListener('abort', onAbort);
          if (existing.subscribers.size === 0) {
            existing.abortController.abort();
          }
          reject(callerSignal?.reason || new DOMException('Operation was aborted', 'AbortError'));
        };

        if (callerSignal) {
          callerSignal.addEventListener('abort', onAbort, { once: true });
        }

        existing.promise.then(
          (result) => {
            if (callerSignal) callerSignal.removeEventListener('abort', onAbort);
            existing.subscribers.delete(subscriberId);
            resolve(result);
          },
          (err) => {
            if (callerSignal) callerSignal.removeEventListener('abort', onAbort);
            existing.subscribers.delete(subscriberId);
            reject(err);
          }
        );
      });
    }

    const abortController = new AbortController();
    const subscribers = new Set<string>([subscriberId]);

    const promise = (async () => {
      try {
        return await operation(abortController.signal);
      } finally {
        this.inFlight.delete(key);
      }
    })();
    // Guard root promise against unhandled rejection if all subscribers abort
    promise.catch(() => {});

    const entry: InFlightEntry<T> = {
      promise,
      abortController,
      subscribers
    };
    this.inFlight.set(key, entry);

    return new Promise<T>((resolve, reject) => {
      if (callerSignal?.aborted) {
        entry.subscribers.delete(subscriberId);
        if (entry.subscribers.size === 0) {
          entry.abortController.abort();
        }
        return reject(
          callerSignal.reason || new DOMException('Operation was aborted', 'AbortError')
        );
      }

      const onAbort = () => {
        entry.subscribers.delete(subscriberId);
        if (callerSignal) callerSignal.removeEventListener('abort', onAbort);
        if (entry.subscribers.size === 0) {
          entry.abortController.abort();
        }
        reject(callerSignal?.reason || new DOMException('Operation was aborted', 'AbortError'));
      };

      if (callerSignal) {
        callerSignal.addEventListener('abort', onAbort, { once: true });
      }

      entry.promise.then(
        (result) => {
          if (callerSignal) callerSignal.removeEventListener('abort', onAbort);
          entry.subscribers.delete(subscriberId);
          resolve(result);
        },
        (err) => {
          if (callerSignal) callerSignal.removeEventListener('abort', onAbort);
          entry.subscribers.delete(subscriberId);
          reject(err);
        }
      );
    });
  }

  get activeCount(): number {
    return this.inFlight.size;
  }

  clear(): void {
    for (const entry of this.inFlight.values()) {
      entry.abortController.abort();
    }
    this.inFlight.clear();
  }
}

export interface ResilienceMetrics {
  upstream429Count: number;
  upstream403Count: number;
  successfulResolutions: number;
  cacheHits: number;
  cacheMisses: number;
  cooldownShortCircuits: number;
  deduplicatedRequests: number;
  retryCount: number;
  avgResolutionTimeMs: number;
  totalResolutions: number;
  activeSingleFlights: number;
  cachedEntriesCount: number;
  cooldownRemainingSeconds: number;
}

/**
 * Centralized Upstream Resilience Manager.
 * Orchestrates caching, deduplication, host cooldowns, retry policies, and operational metrics.
 */
export class UpstreamResilienceManager {
  readonly cache: MetadataCache;
  readonly cooldownTracker: UpstreamCooldownTracker;
  readonly deduplicator: SingleFlightDeduplicator;

  private metrics: Omit<ResilienceMetrics, 'activeSingleFlights' | 'cachedEntriesCount' | 'cooldownRemainingSeconds'> = {
    upstream429Count: 0,
    upstream403Count: 0,
    successfulResolutions: 0,
    cacheHits: 0,
    cacheMisses: 0,
    cooldownShortCircuits: 0,
    deduplicatedRequests: 0,
    retryCount: 0,
    avgResolutionTimeMs: 0,
    totalResolutions: 0
  };

  private totalResolutionTimeMs = 0;

  constructor(maxCacheCapacity = 500) {
    this.cache = new MetadataCache(maxCacheCapacity);
    this.cooldownTracker = new UpstreamCooldownTracker();
    this.deduplicator = new SingleFlightDeduplicator();
  }

  /**
   * Evaluates whether an error is eligible for transient retry.
   * Eligible: 502, 503, connection timeouts / socket resets.
   * Non-eligible: 400, 401, 403, 404, 429, SSRF, login wall, invalid URL.
   */
  shouldRetry(error: any, attempt: number, maxRetries = 2): boolean {
    if (attempt >= maxRetries) return false;

    // Check status code or error code
    const statusCode = error?.statusCode || error?.status;
    if (statusCode === 502 || statusCode === 503) {
      return true;
    }

    const code = error?.code || error?.error?.code;
    if (
      code === 'TIMEOUT' ||
      code === 'PAGE_FETCH_FAILED' ||
      code === 'NETWORK_ERROR' ||
      code === 'ECONNRESET' ||
      code === 'ETIMEDOUT' ||
      code === 'EAI_AGAIN'
    ) {
      return true;
    }

    const msg = String(error?.message || '').toLowerCase();
    if (
      msg.includes('socket hang up') ||
      msg.includes('econnreset') ||
      msg.includes('etimedout') ||
      msg.includes('network error')
    ) {
      return true;
    }

    return false;
  }

  getBackoffDelayMs(attempt: number): number {
    const baseDelay = 300;
    const maxDelay = 2000;
    const exp = Math.min(maxDelay, baseDelay * Math.pow(2, attempt));
    // Full jitter (0.5 to 1.0 multiplier)
    return Math.floor(exp * (0.5 + Math.random() * 0.5));
  }

  /**
   * Helper to delay with cancellation support.
   */
  private async delay(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        return reject(signal.reason || new DOMException('Aborted', 'AbortError'));
      }
      const timer = setTimeout(() => resolve(), ms);
      const onAbort = () => {
        clearTimeout(timer);
        reject(signal?.reason || new DOMException('Aborted', 'AbortError'));
      };
      if (signal) {
        signal.addEventListener('abort', onAbort, { once: true });
      }
    });
  }

  /**
   * Executes a post/media resolution operation with full resilience protection.
   */
  async executeResolve(
    canonicalUrl: string,
    shortcode: string,
    operation: (signal: AbortSignal) => Promise<ResolveResult>,
    signal?: AbortSignal
  ): Promise<ResolveResult> {
    const startTime = Date.now();
    const cacheKey = `post:${shortcode}`;

    // 1. Check Metadata Cache
    const cached = this.cache.get<ResolveResult>(cacheKey);
    if (cached) {
      this.metrics.cacheHits++;
      return cached;
    }
    this.metrics.cacheMisses++;

    // 2. Check Upstream Cooldown
    const cooldown = this.cooldownTracker.isCoolingDown('www.instagram.com');
    if (cooldown.coolingDown) {
      this.metrics.cooldownShortCircuits++;
      return {
        ok: false,
        status: 'rate_limited',
        provider: 'public',
        shortcode,
        error: {
          code: 'UPSTREAM_RATE_LIMITED' as const,
          message: formatRateLimitMessage(cooldown.remainingSeconds),
          retryAfterSeconds: cooldown.remainingSeconds
        }
      };
    }

    // 3. Execute with Deduplication and Retry Policy
    try {
      const result = await this.deduplicator.execute(
        cacheKey,
        async (flightSignal) => {
          let attempt = 0;
          const maxRetries = 2;

          while (true) {
            try {
              const res = await operation(flightSignal);

              // Handle rate limiting in result
              if (!res.ok) {
                if (
                  res.error?.code === 'RATE_LIMITED' ||
                  res.error?.code === 'HTTP_429_RATE_LIMITED' ||
                  res.error?.code === 'UPSTREAM_RATE_LIMITED' ||
                  res.status === 'rate_limited'
                ) {
                  this.metrics.upstream429Count++;
                  const cooldownSec = this.cooldownTracker.record429(
                    'www.instagram.com',
                    res.error?.retryAfterSeconds
                  );
                  return {
                    ...res,
                    error: {
                      ...res.error,
                      code: 'UPSTREAM_RATE_LIMITED' as const,
                      message: formatRateLimitMessage(cooldownSec),
                      retryAfterSeconds: cooldownSec
                    }
                  };
                }

                if (
                  res.error?.code === 'CONTENT_PRIVATE' ||
                  res.error?.code === 'HTTP_403_FORBIDDEN' ||
                  res.error?.code === 'LOGIN_WALL_ENCOUNTERED'
                ) {
                  this.metrics.upstream403Count++;
                }

                // Check if transient error warrants retry
                if (this.shouldRetry(res, attempt, maxRetries)) {
                  this.metrics.retryCount++;
                  attempt++;
                  const delayMs = this.getBackoffDelayMs(attempt);
                  await this.delay(delayMs, flightSignal);
                  continue;
                }
              } else {
                // Successful resolution
                this.cooldownTracker.recordSuccess('www.instagram.com');
                this.cache.set(cacheKey, res, 'post');
              }

              return res;
            } catch (err: any) {
              if (flightSignal.aborted) throw err;

              if (this.shouldRetry(err, attempt, maxRetries)) {
                this.metrics.retryCount++;
                attempt++;
                const delayMs = this.getBackoffDelayMs(attempt);
                await this.delay(delayMs, flightSignal);
                continue;
              }

              throw err;
            }
          }
        },
        signal,
        () => {
          this.metrics.deduplicatedRequests++;
        }
      );

      // Record metrics
      const durationMs = Date.now() - startTime;
      this.recordResolutionDuration(durationMs);
      if (result.ok) {
        this.metrics.successfulResolutions++;
      }

      return result;
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      this.recordResolutionDuration(durationMs);
      throw err;
    }
  }

  /**
   * Executes a profile discovery operation with full resilience protection.
   */
  async executeDiscoverProfile(
    canonicalProfileUrl: string,
    cleanUsername: string,
    operation: (signal: AbortSignal) => Promise<ProfileDiscoveryResult>,
    signal?: AbortSignal
  ): Promise<ProfileDiscoveryResult> {
    const startTime = Date.now();
    const cacheKey = `profile:${cleanUsername.toLowerCase()}`;

    // 1. Check Metadata Cache
    const cached = this.cache.get<ProfileDiscoveryResult>(cacheKey);
    if (cached) {
      this.metrics.cacheHits++;
      return cached;
    }
    this.metrics.cacheMisses++;

    // 2. Check Upstream Cooldown
    const cooldown = this.cooldownTracker.isCoolingDown('www.instagram.com');
    if (cooldown.coolingDown) {
      this.metrics.cooldownShortCircuits++;
      return {
        ok: false,
        provider: 'Instagram Public Web Provider',
        error: {
          code: 'UPSTREAM_RATE_LIMITED' as const,
          message: formatRateLimitMessage(cooldown.remainingSeconds),
          retryAfterSeconds: cooldown.remainingSeconds
        }
      };
    }

    // 3. Execute with Deduplication and Retry Policy
    try {
      const result = await this.deduplicator.execute(
        cacheKey,
        async (flightSignal) => {
          let attempt = 0;
          const maxRetries = 2;

          while (true) {
            try {
              const res = await operation(flightSignal);

              if (!res.ok) {
                if (
                  res.error?.code === 'RATE_LIMITED' ||
                  res.error?.code === 'HTTP_429_RATE_LIMITED' ||
                  res.error?.code === 'UPSTREAM_RATE_LIMITED'
                ) {
                  this.metrics.upstream429Count++;
                  const cooldownSec = this.cooldownTracker.record429(
                    'www.instagram.com',
                    res.error?.retryAfterSeconds
                  );
                  return {
                    ...res,
                    error: {
                      ...res.error,
                      code: 'UPSTREAM_RATE_LIMITED' as const,
                      message: formatRateLimitMessage(cooldownSec),
                      retryAfterSeconds: cooldownSec
                    }
                  };
                }

                if (
                  res.error?.code === 'PRIVATE_ACCOUNT' ||
                  res.error?.code === 'HTTP_403_FORBIDDEN' ||
                  res.error?.code === 'LOGIN_WALL_ENCOUNTERED'
                ) {
                  this.metrics.upstream403Count++;
                }

                if (this.shouldRetry(res, attempt, maxRetries)) {
                  this.metrics.retryCount++;
                  attempt++;
                  const delayMs = this.getBackoffDelayMs(attempt);
                  await this.delay(delayMs, flightSignal);
                  continue;
                }
              } else {
                this.cooldownTracker.recordSuccess('www.instagram.com');
                this.cache.set(cacheKey, res, 'profile');
              }

              return res;
            } catch (err: any) {
              if (flightSignal.aborted) throw err;

              if (this.shouldRetry(err, attempt, maxRetries)) {
                this.metrics.retryCount++;
                attempt++;
                const delayMs = this.getBackoffDelayMs(attempt);
                await this.delay(delayMs, flightSignal);
                continue;
              }

              throw err;
            }
          }
        },
        signal,
        () => {
          this.metrics.deduplicatedRequests++;
        }
      );

      const durationMs = Date.now() - startTime;
      this.recordResolutionDuration(durationMs);
      if (result.ok) {
        this.metrics.successfulResolutions++;
      }

      return result;
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      this.recordResolutionDuration(durationMs);
      throw err;
    }
  }

  private recordResolutionDuration(durationMs: number): void {
    this.metrics.totalResolutions++;
    this.totalResolutionTimeMs += durationMs;
    this.metrics.avgResolutionTimeMs = Math.round(
      this.totalResolutionTimeMs / this.metrics.totalResolutions
    );
  }

  getMetrics(): ResilienceMetrics {
    const cooldown = this.cooldownTracker.isCoolingDown('www.instagram.com');
    return {
      ...this.metrics,
      activeSingleFlights: this.deduplicator.activeCount,
      cachedEntriesCount: this.cache.size,
      cooldownRemainingSeconds: cooldown.remainingSeconds
    };
  }

  resetMetrics(): void {
    this.metrics = {
      upstream429Count: 0,
      upstream403Count: 0,
      successfulResolutions: 0,
      cacheHits: 0,
      cacheMisses: 0,
      cooldownShortCircuits: 0,
      deduplicatedRequests: 0,
      retryCount: 0,
      avgResolutionTimeMs: 0,
      totalResolutions: 0
    };
    this.totalResolutionTimeMs = 0;
  }
}

/**
 * Singleton instance of UpstreamResilienceManager.
 */
export const upstreamResilienceManager = new UpstreamResilienceManager();
