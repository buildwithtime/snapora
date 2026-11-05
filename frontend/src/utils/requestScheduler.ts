/**
 * Client-Side Request Scheduler with Token Bucket and Rolling Window Rate Limiting.
 *
 * Designed to pace outbound queue requests under backend rate limits:
 * - Token Bucket Capacity: 10 (allows immediate snappy processing for small everyday batches).
 * - Refill Interval: 2,000ms (1 token refilled every 2s = 30 tokens/minute steady state).
 * - Rolling Window Ceiling: 28 requests per 60,000ms (prevents burst exhaustion with safety margin).
 * - Multi-Tab Synchronization & Concurrency: Coordinates atomically across open tabs.
 *   Uses the W3C Web Locks API (navigator.locks.request) as the primary cross-tab mechanism.
 * - Explicit Web Locks Boundary: When Web Locks API is unavailable (e.g. legacy browsers or
 *   restricted webviews), cross-tab coordination is disabled explicitly rather than silently
 *   using an unsafe localStorage fallback. Single-tab request pacing operates independently
 *   without cross-tab state sharing.
 * - Abort-aware: Cleanly cancels sleep timers on pause, job cancellation, or component unmount.
 */

export class CrossTabCoordinationUnavailableError extends Error {
  constructor(
    message = 'Cross-tab coordination requires Web Locks API (navigator.locks), which is unavailable in this environment'
  ) {
    super(message);
    this.name = 'CrossTabCoordinationUnavailableError';
  }
}

export class StaleLockError extends Error {
  constructor(message = 'Lock lease expired or was superseded by another tab') {
    super(message);
    this.name = 'StaleLockError';
  }
}

export interface LockContext {
  isValid: () => boolean;
  ensureValid: () => void;
  commitRecords: (records: RequestRecord[]) => void;
}

export interface RequestSchedulerConfig {
  bucketCapacity?: number;
  refillIntervalMs?: number;
  rollingWindowMax?: number;
  rollingWindowMs?: number;
  minPacingMs?: number;
  syncStorageKey?: string;
  leaseDurationMs?: number;
}

export interface SchedulerSnapshot {
  tokens: number;
  rollingWindowCount: number;
  maxRollingWindow: number;
  cooldownRemainingSeconds: number;
  isCoolingDown: boolean;
  lockMechanism: 'web-locks' | 'unsupported';
  isCrossTabSupported: boolean;
}

export interface RequestRecord {
  id: string;
  timestamp: number;
}

export interface SharedStoragePayload {
  version: number;
  fenceToken: string;
  owner: string;
  updatedAt: number;
  records: RequestRecord[];
}

export class ClientRequestScheduler {
  private readonly bucketCapacity: number;
  private readonly refillIntervalMs: number;
  private readonly rollingWindowMax: number;
  private readonly rollingWindowMs: number;
  private readonly minPacingMs: number;
  private readonly syncStorageKey: string;
  private readonly tabId: string;

  private tokens: number;
  private lastRefillTime: number;
  private lastRequestTime: number;
  private localRecords: RequestRecord[];
  private activeReservations: string[];
  private cooldownUntil: number;
  private inTabQueue: Promise<void>;

  constructor(config: RequestSchedulerConfig = {}) {
    this.bucketCapacity = config.bucketCapacity ?? 10;
    this.refillIntervalMs = config.refillIntervalMs ?? 2000;
    this.rollingWindowMax = config.rollingWindowMax ?? 28;
    this.rollingWindowMs = config.rollingWindowMs ?? 60000;
    this.minPacingMs = config.minPacingMs ?? 50;
    this.syncStorageKey = config.syncStorageKey ?? 'snapora_shared_rate_window';
    this.tabId = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    this.tokens = this.bucketCapacity;
    this.lastRefillTime = Date.now();
    this.lastRequestTime = 0;
    this.localRecords = [];
    this.activeReservations = [];
    this.cooldownUntil = 0;
    this.inTabQueue = Promise.resolve();
  }

  /**
   * Verifies whether the W3C Web Locks API is available in the current environment.
   */
  public isCrossTabSupported(): boolean {
    return Boolean(
      typeof navigator !== 'undefined' &&
      (navigator as any).locks &&
      typeof (navigator as any).locks.request === 'function'
    );
  }

  /**
   * Identifies the active cross-tab locking mechanism.
   * Returns 'web-locks' when Web Locks API is available, or 'unsupported' when absent.
   */
  public getLockMechanism(): 'web-locks' | 'unsupported' {
    return this.isCrossTabSupported() ? 'web-locks' : 'unsupported';
  }

  /**
   * Coordinates execution across browser tabs using the Web Locks API.
   * If Web Locks API is unavailable, fails explicitly with CrossTabCoordinationUnavailableError
   * rather than using an unsafe localStorage mutex fallback.
   */
  public async withCrossTabLock<T>(
    action: (context: LockContext) => Promise<T> | T,
    signal?: AbortSignal
  ): Promise<T> {
    if (!this.isCrossTabSupported()) {
      throw new CrossTabCoordinationUnavailableError();
    }

    const currentQueue = this.inTabQueue;
    let releaseQueue: () => void = () => {};
    this.inTabQueue = new Promise<void>((resolve) => {
      releaseQueue = resolve;
    });

    try {
      await currentQueue;

      const lockName = `snapora_lock_${this.syncStorageKey}`;

      return await (navigator as any).locks.request(
        lockName,
        signal ? { signal } : {},
        async () => {
          const context: LockContext = {
            isValid: () => !signal?.aborted,
            ensureValid: () => {
              if (signal?.aborted) {
                throw new DOMException('Aborted', 'AbortError');
              }
            },
            commitRecords: (records: RequestRecord[]) => {
              if (signal?.aborted) {
                throw new DOMException('Aborted', 'AbortError');
              }
              if (typeof window !== 'undefined' && window.localStorage) {
                try {
                  const raw = window.localStorage.getItem(this.syncStorageKey);
                  let version = 0;
                  if (raw) {
                    try {
                      const parsed = JSON.parse(raw);
                      if (parsed && typeof parsed.version === 'number') {
                        version = parsed.version;
                      }
                    } catch {}
                  }
                  const payload: SharedStoragePayload = {
                    version: version + 1,
                    fenceToken: 'web-locks',
                    owner: this.tabId,
                    updatedAt: Date.now(),
                    records
                  };
                  window.localStorage.setItem(this.syncStorageKey, JSON.stringify(payload));
                } catch {}
              }
            }
          };

          return await action(context);
        }
      );
    } catch (err: any) {
      if (err?.name === 'AbortError' || signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      throw err;
    } finally {
      releaseQueue();
    }
  }

  /**
   * Refills tokens according to elapsed time since last refill.
   */
  private refillTokens(now: number): void {
    const elapsed = now - this.lastRefillTime;
    if (elapsed >= this.refillIntervalMs) {
      const tokensToAdd = Math.floor(elapsed / this.refillIntervalMs);
      this.tokens = Math.min(this.bucketCapacity, this.tokens + tokensToAdd);
      this.lastRefillTime += tokensToAdd * this.refillIntervalMs;
    }
  }

  /**
   * Retrieves active timestamps in the rolling window for the local tab.
   */
  private getLocalTimestamps(now: number): number[] {
    const windowStart = now - this.rollingWindowMs;
    this.localRecords = this.localRecords.filter((r) => r.timestamp > windowStart);
    return this.localRecords.map((r) => r.timestamp).sort((a, b) => a - b);
  }

  /**
   * Retrieves active timestamps in the rolling window across local state and shared storage.
   */
  private getActiveTimestamps(now: number): number[] {
    const windowStart = now - this.rollingWindowMs;

    this.localRecords = this.localRecords.filter((r) => r.timestamp > windowStart);

    const map = new Map<string, number>();
    for (const r of this.localRecords) {
      map.set(r.id, r.timestamp);
    }

    if (this.isCrossTabSupported() && typeof window !== 'undefined' && window.localStorage) {
      try {
        const raw = window.localStorage.getItem(this.syncStorageKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          let records: RequestRecord[] = [];
          if (Array.isArray(parsed)) {
            records = parsed;
          } else if (parsed && Array.isArray(parsed.records)) {
            records = parsed.records;
          }

          for (const item of records) {
            if (item && typeof item.timestamp === 'number' && item.timestamp > windowStart) {
              const id = item.id || `ext_${item.timestamp}_${Math.random()}`;
              map.set(id, item.timestamp);
            }
          }
        }
      } catch {}
    }

    const timestamps = Array.from(map.values()).sort((a, b) => a - b);
    return timestamps;
  }

  /**
   * Records a dispatched request timestamp locally and in shared multi-tab storage.
   */
  public async recordRequest(timestamp: number = Date.now()): Promise<void> {
    this.lastRequestTime = timestamp;

    const reservationId = this.activeReservations.shift();
    if (reservationId) {
      const existing = this.localRecords.find((r) => r.id === reservationId);
      if (existing) {
        existing.timestamp = timestamp;
      }

      if (this.isCrossTabSupported()) {
        await this.withCrossTabLock(async (context) => {
          if (typeof window !== 'undefined' && window.localStorage) {
            const raw = window.localStorage.getItem(this.syncStorageKey);
            let records: RequestRecord[] = [];
            if (raw) {
              try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) records = parsed;
                else if (parsed && Array.isArray(parsed.records)) records = parsed.records;
              } catch {}
            }
            for (const item of records) {
              if (item && item.id === reservationId) {
                item.timestamp = timestamp;
              }
            }
            context.commitRecords(records);
          }
        });
      }
      return;
    }

    // Standalone recordRequest invocation without preceding acquireToken
    const recordId = `${this.tabId}_${timestamp}_${Math.random().toString(36).slice(2, 7)}`;
    const record: RequestRecord = {
      id: recordId,
      timestamp
    };
    this.localRecords.push(record);

    if (this.isCrossTabSupported()) {
      await this.withCrossTabLock(async (context) => {
        if (typeof window !== 'undefined' && window.localStorage) {
          const windowStart = timestamp - this.rollingWindowMs;
          let existing: RequestRecord[] = [];
          const raw = window.localStorage.getItem(this.syncStorageKey);
          if (raw) {
            try {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) existing = parsed;
              else if (parsed && Array.isArray(parsed.records)) existing = parsed.records;
            } catch {}
          }

          const map = new Map<string, RequestRecord>();
          for (const r of existing) {
            if (r && typeof r.timestamp === 'number' && r.timestamp > windowStart && r.id) {
              map.set(r.id, r);
            }
          }
          map.set(record.id, record);

          const active = Array.from(map.values())
            .sort((a, b) => a.timestamp - b.timestamp)
            .slice(-100);

          context.commitRecords(active);
        }
      });
    }
  }

  /**
   * Cancels a reserved slot if request processing was aborted prior to network dispatch.
   */
  public async cancelPendingReservation(): Promise<void> {
    const reservationId = this.activeReservations.pop();
    if (!reservationId) return;

    this.localRecords = this.localRecords.filter((r) => r.id !== reservationId);
    this.tokens = Math.min(this.bucketCapacity, this.tokens + 1);

    if (this.isCrossTabSupported()) {
      await this.withCrossTabLock(async (context) => {
        if (typeof window !== 'undefined' && window.localStorage) {
          const raw = window.localStorage.getItem(this.syncStorageKey);
          let existing: RequestRecord[] = [];
          if (raw) {
            try {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) existing = parsed;
              else if (parsed && Array.isArray(parsed.records)) existing = parsed.records;
            } catch {}
          }
          const filtered = existing.filter((r) => r && r.id !== reservationId);
          context.commitRecords(filtered);
        }
      });
    }
  }

  /**
   * Triggers an explicit upstream or local cooldown.
   */
  public triggerCooldown(seconds: number): void {
    const safeSec = Math.max(1, seconds);
    this.cooldownUntil = Date.now() + safeSec * 1000;
    this.tokens = 0;
  }

  /**
   * Clears active cooldown.
   */
  public clearCooldown(): void {
    this.cooldownUntil = 0;
    this.tokens = Math.min(this.bucketCapacity, Math.max(1, this.tokens));
    this.lastRefillTime = Date.now();
  }

  /**
   * Checks current scheduler status.
   */
  public getSnapshot(): SchedulerSnapshot {
    const now = Date.now();
    this.refillTokens(now);
    const active = this.getActiveTimestamps(now);
    const remainingCooldown = Math.max(0, Math.ceil((this.cooldownUntil - now) / 1000));

    return {
      tokens: this.tokens,
      rollingWindowCount: active.length,
      maxRollingWindow: this.rollingWindowMax,
      cooldownRemainingSeconds: remainingCooldown,
      isCoolingDown: remainingCooldown > 0,
      lockMechanism: this.getLockMechanism(),
      isCrossTabSupported: this.isCrossTabSupported()
    };
  }

  /**
   * Acquires permission to dispatch a request, awaiting tokens or window capacity if necessary.
   * Respects AbortSignal for immediate cancellation.
   * If Web Locks API is available, coordinates atomically across tabs.
   * If Web Locks API is unavailable, preserves single-tab functionality without shared state.
   */
  public async acquireToken(signal?: AbortSignal): Promise<void> {
    const isCrossTab = this.isCrossTabSupported();

    while (true) {
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      const now = Date.now();

      // 1. Check active cooldown
      if (this.cooldownUntil > now) {
        const cooldownWait = this.cooldownUntil - now;
        await this.delay(cooldownWait, signal);
        continue;
      }

      if (isCrossTab) {
        // Cross-tab coordination path via Web Locks API
        let waitDuration = 0;
        let acquiredSuccessfully = false;

        await this.withCrossTabLock(async (context) => {
          const lockTime = Date.now();

          // Check active cooldown inside lock
          if (this.cooldownUntil > lockTime) {
            waitDuration = this.cooldownUntil - lockTime;
            return;
          }

          // Check shared rolling window ceiling
          const activeTimestamps = this.getActiveTimestamps(lockTime);
          if (activeTimestamps.length >= this.rollingWindowMax) {
            const oldest = activeTimestamps[0];
            waitDuration = Math.max(50, oldest + this.rollingWindowMs - lockTime + 50);
            return;
          }

          // Check token bucket
          this.refillTokens(lockTime);
          if (this.tokens < 1) {
            waitDuration = Math.max(50, this.refillIntervalMs - (lockTime - this.lastRefillTime));
            return;
          }

          // Check micro-pacing
          if (this.minPacingMs > 0 && this.lastRequestTime > 0) {
            const elapsed = lockTime - this.lastRequestTime;
            if (elapsed < this.minPacingMs) {
              waitDuration = this.minPacingMs - elapsed;
              return;
            }
          }

          // Capacity available: reserve slot
          this.tokens = Math.max(0, this.tokens - 1);
          const reservationId = `${this.tabId}_${lockTime}_${Math.random().toString(36).slice(2, 7)}`;
          this.activeReservations.push(reservationId);

          const reservedRecord: RequestRecord = {
            id: reservationId,
            timestamp: lockTime
          };
          this.localRecords.push(reservedRecord);

          if (typeof window !== 'undefined' && window.localStorage) {
            const windowStart = lockTime - this.rollingWindowMs;
            let existing: RequestRecord[] = [];
            const raw = window.localStorage.getItem(this.syncStorageKey);
            if (raw) {
              try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) existing = parsed;
                else if (parsed && Array.isArray(parsed.records)) existing = parsed.records;
              } catch {}
            }
            const map = new Map<string, RequestRecord>();
            for (const r of existing) {
              if (r && typeof r.timestamp === 'number' && r.timestamp > windowStart && r.id) {
                map.set(r.id, r);
              }
            }
            map.set(reservedRecord.id, reservedRecord);

            const active = Array.from(map.values())
              .sort((a, b) => a.timestamp - b.timestamp)
              .slice(-100);

            context.commitRecords(active);
          }

          acquiredSuccessfully = true;
        }, signal);

        if (acquiredSuccessfully) {
          return;
        }

        if (waitDuration > 0) {
          await this.delay(waitDuration, signal);
        }
      } else {
        // Single-tab independent path (Web Locks unavailable)
        // Preserves normal single-tab functionality without cross-tab coordination or shared state
        const lockTime = Date.now();

        // Check active cooldown
        if (this.cooldownUntil > lockTime) {
          await this.delay(this.cooldownUntil - lockTime, signal);
          continue;
        }

        // Check local rolling window ceiling
        const activeTimestamps = this.getLocalTimestamps(lockTime);
        if (activeTimestamps.length >= this.rollingWindowMax) {
          const oldest = activeTimestamps[0];
          const wait = Math.max(50, oldest + this.rollingWindowMs - lockTime + 50);
          await this.delay(wait, signal);
          continue;
        }

        // Check token bucket
        this.refillTokens(lockTime);
        if (this.tokens < 1) {
          const wait = Math.max(50, this.refillIntervalMs - (lockTime - this.lastRefillTime));
          await this.delay(wait, signal);
          continue;
        }

        // Check micro-pacing
        if (this.minPacingMs > 0 && this.lastRequestTime > 0) {
          const elapsed = lockTime - this.lastRequestTime;
          if (elapsed < this.minPacingMs) {
            await this.delay(this.minPacingMs - elapsed, signal);
            continue;
          }
        }

        // Capacity available: reserve slot locally
        this.tokens = Math.max(0, this.tokens - 1);
        const reservationId = `${this.tabId}_${lockTime}_${Math.random().toString(36).slice(2, 7)}`;
        this.activeReservations.push(reservationId);

        const reservedRecord: RequestRecord = {
          id: reservationId,
          timestamp: lockTime
        };
        this.localRecords.push(reservedRecord);
        return;
      }
    }
  }

  /**
   * Resets scheduler state to initial values.
   */
  public reset(): void {
    this.tokens = this.bucketCapacity;
    this.lastRefillTime = Date.now();
    this.lastRequestTime = 0;
    this.localRecords = [];
    this.activeReservations = [];
    this.cooldownUntil = 0;
    this.inTabQueue = Promise.resolve();
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.removeItem(this.syncStorageKey);
      } catch {}
    }
  }

  /**
   * Cancellable delay helper.
   */
  private delay(ms: number, signal?: AbortSignal): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | null = null;

      const onAbort = () => {
        if (timer) clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      };

      if (signal) {
        if (signal.aborted) {
          return reject(new DOMException('Aborted', 'AbortError'));
        }
        signal.addEventListener('abort', onAbort, { once: true });
      }

      timer = setTimeout(() => {
        if (signal) {
          signal.removeEventListener('abort', onAbort);
        }
        resolve();
      }, ms);
    });
  }
}
