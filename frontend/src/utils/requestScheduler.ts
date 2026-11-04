/**
 * Client-Side Request Scheduler with Token Bucket and Rolling Window Rate Limiting.
 *
 * Designed to pace outbound queue requests under backend rate limits:
 * - Token Bucket Capacity: 10 (allows immediate snappy processing for small everyday batches).
 * - Refill Interval: 2,000ms (1 token refilled every 2s = 30 tokens/minute steady state).
 * - Rolling Window Ceiling: 28 requests per 60,000ms (prevents burst exhaustion with safety margin).
 * - Multi-Tab Synchronization & Concurrency: Coordinates atomically across open tabs.
 *   Uses the W3C Web Locks API (navigator.locks.request) as the primary cross-tab mechanism.
 * - Fenced Optimistic Concurrency Fallback: For environments without Web Locks, implements
 *   a lease-based mutex with monotonic fencing tokens and optimistic concurrency versioning.
 *   Mutations are committed exclusively via atomic commit methods that fail closed on any
 *   lease expiration, fence token mismatch, or storage version conflict, eliminating TOCTOU
 *   stale-owner overwrites.
 * - Abort-aware: Cleanly cancels sleep timers on pause, job cancellation, or component unmount.
 */

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
  lockMechanism: 'web-locks' | 'localstorage-mutex' | 'none';
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
  private readonly leaseDurationMs: number;
  private readonly tabId: string;

  private tokens: number;
  private lastRefillTime: number;
  private lastRequestTime: number;
  private localRecords: RequestRecord[];
  private activeReservations: string[];
  private cooldownUntil: number;
  private inTabQueue: Promise<void>;
  private fenceCounter: number;

  constructor(config: RequestSchedulerConfig = {}) {
    this.bucketCapacity = config.bucketCapacity ?? 10;
    this.refillIntervalMs = config.refillIntervalMs ?? 2000;
    this.rollingWindowMax = config.rollingWindowMax ?? 28;
    this.rollingWindowMs = config.rollingWindowMs ?? 60000;
    this.minPacingMs = config.minPacingMs ?? 50;
    this.syncStorageKey = config.syncStorageKey ?? 'snapora_shared_rate_window';
    this.leaseDurationMs = config.leaseDurationMs ?? 3000;
    this.tabId = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    this.tokens = this.bucketCapacity;
    this.lastRefillTime = Date.now();
    this.lastRequestTime = 0;
    this.localRecords = [];
    this.activeReservations = [];
    this.cooldownUntil = 0;
    this.inTabQueue = Promise.resolve();
    this.fenceCounter = 0;
  }

  /**
   * Identifies the active cross-tab locking mechanism.
   */
  public getLockMechanism(): 'web-locks' | 'localstorage-mutex' | 'none' {
    if (
      typeof navigator !== 'undefined' &&
      (navigator as any).locks &&
      typeof (navigator as any).locks.request === 'function'
    ) {
      return 'web-locks';
    }
    if (typeof window !== 'undefined' && window.localStorage) {
      return 'localstorage-mutex';
    }
    return 'none';
  }

  /**
   * Coordinates execution across browser tabs using the most appropriate lock.
   * Priority:
   * 1. Web Locks API (Chrome 69+, Edge 79+, Firefox 96+, Safari 15.4+)
   * 2. Fenced lease-based localStorage mutex with optimistic concurrency versioning
   * 3. Degraded / storage-disabled: direct execution
   */
  public async withCrossTabLock<T>(
    action: (context: LockContext) => Promise<T> | T,
    signal?: AbortSignal,
    timeoutMs = 5000
  ): Promise<T> {
    const currentQueue = this.inTabQueue;
    let releaseQueue: () => void = () => {};
    this.inTabQueue = new Promise<void>((resolve) => {
      releaseQueue = resolve;
    });

    try {
      await currentQueue;

      const lockName = `snapora_lock_${this.syncStorageKey}`;

      // 1. Web Locks API (authoritative browser-level mutual exclusion)
      if (
        typeof navigator !== 'undefined' &&
        (navigator as any).locks &&
        typeof (navigator as any).locks.request === 'function'
      ) {
        try {
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
        }
      }

      // 2. Fenced lease-based localStorage mutex fallback
      if (typeof window !== 'undefined' && window.localStorage) {
        const lockKey = `${lockName}_lease`;
        const startTime = Date.now();
        let lockAcquired = false;
        let leaseExpiresAt = 0;
        let currentFenceToken = '';
        let initialStorageVersion = 0;

        try {
          while (!lockAcquired) {
            if (signal?.aborted) {
              throw new DOMException('Aborted', 'AbortError');
            }

            const now = Date.now();
            if (now - startTime > timeoutMs) {
              break;
            }

            let canClaim = false;
            try {
              const raw = window.localStorage.getItem(lockKey);
              if (!raw) {
                canClaim = true;
              } else {
                const parsed = JSON.parse(raw);
                if (
                  !parsed ||
                  typeof parsed.expiresAt !== 'number' ||
                  parsed.expiresAt <= now ||
                  parsed.owner === this.tabId
                ) {
                  canClaim = true;
                }
              }
            } catch {
              canClaim = true;
            }

            if (canClaim) {
              leaseExpiresAt = now + this.leaseDurationMs;
              this.fenceCounter++;
              currentFenceToken = `${this.tabId}_${now}_${this.fenceCounter}`;
              const candidate = JSON.stringify({
                owner: this.tabId,
                fenceToken: currentFenceToken,
                expiresAt: leaseExpiresAt
              });
              try {
                window.localStorage.setItem(lockKey, candidate);
                const verified = window.localStorage.getItem(lockKey);
                if (verified === candidate) {
                  lockAcquired = true;
                  break;
                }
              } catch {
                break;
              }
            }

            const jitter = Math.floor(Math.random() * 15) + 5;
            await this.delay(jitter, signal);
          }

          // Capture baseline storage version upon lock acquisition
          try {
            const rawData = window.localStorage.getItem(this.syncStorageKey);
            if (rawData) {
              const parsed = JSON.parse(rawData);
              if (parsed && typeof parsed.version === 'number') {
                initialStorageVersion = parsed.version;
              }
            }
          } catch {}

          // Verification helper for current lease validity
          const isLockValid = (): boolean => {
            if (signal?.aborted) return false;
            if (typeof window === 'undefined' || !window.localStorage) return true;
            const checkTime = Date.now();
            if (checkTime >= leaseExpiresAt) return false;
            try {
              const raw = window.localStorage.getItem(lockKey);
              if (!raw) return false;
              const parsed = JSON.parse(raw);
              return (
                parsed &&
                parsed.owner === this.tabId &&
                parsed.fenceToken === currentFenceToken &&
                typeof parsed.expiresAt === 'number' &&
                parsed.expiresAt > checkTime
              );
            } catch {
              return false;
            }
          };

          const ensureValid = (): void => {
            if (signal?.aborted) {
              throw new DOMException('Aborted', 'AbortError');
            }
            if (!isLockValid()) {
              throw new StaleLockError('Lock lease expired or was superseded by another tab');
            }
          };

          // Fenced commit method: eliminates TOCTOU races by verifying lease, fence token,
          // and storage version immediately before persisting changes.
          const commitRecords = (records: RequestRecord[]): void => {
            if (signal?.aborted) {
              throw new DOMException('Aborted', 'AbortError');
            }

            if (typeof window === 'undefined' || !window.localStorage) {
              return;
            }

            // 1. Verify lease ownership, fence token, and non-expiration
            if (!isLockValid()) {
              throw new StaleLockError('Lock lease expired or was superseded before commit');
            }

            // 2. Optimistic Concurrency Control: verify storage version has not moved
            const rawData = window.localStorage.getItem(this.syncStorageKey);
            let currentVersion = 0;
            if (rawData) {
              try {
                const parsed = JSON.parse(rawData);
                if (parsed && typeof parsed.version === 'number') {
                  currentVersion = parsed.version;
                }
              } catch {}
            }

            if (currentVersion !== initialStorageVersion) {
              throw new StaleLockError(
                `Optimistic concurrency conflict: storage version changed from ${initialStorageVersion} to ${currentVersion}`
              );
            }

            const nextVersion = currentVersion + 1;
            const payload: SharedStoragePayload = {
              version: nextVersion,
              fenceToken: currentFenceToken,
              owner: this.tabId,
              updatedAt: Date.now(),
              records
            };

            window.localStorage.setItem(this.syncStorageKey, JSON.stringify(payload));
            initialStorageVersion = nextVersion;
          };

          const context: LockContext = {
            isValid: isLockValid,
            ensureValid,
            commitRecords
          };

          return await action(context);
        } finally {
          if (lockAcquired && typeof window !== 'undefined' && window.localStorage) {
            try {
              const raw = window.localStorage.getItem(lockKey);
              if (raw) {
                const parsed = JSON.parse(raw);
                const now = Date.now();
                // Stale owner guard: NEVER remove the lock if lease expired or belongs to another owner
                if (
                  parsed &&
                  parsed.owner === this.tabId &&
                  parsed.fenceToken === currentFenceToken &&
                  typeof parsed.expiresAt === 'number' &&
                  parsed.expiresAt > now
                ) {
                  window.localStorage.removeItem(lockKey);
                }
              }
            } catch {}
          }
        }
      }

      // 3. Degraded fallback without storage
      const degradedContext: LockContext = {
        isValid: () => !signal?.aborted,
        ensureValid: () => {
          if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        },
        commitRecords: () => {}
      };
      return await action(degradedContext);
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
   * Retrieves active timestamps in the rolling window across local state and shared storage.
   */
  private getActiveTimestamps(now: number): number[] {
    const windowStart = now - this.rollingWindowMs;

    this.localRecords = this.localRecords.filter((r) => r.timestamp > windowStart);

    const map = new Map<string, number>();
    for (const r of this.localRecords) {
      map.set(r.id, r.timestamp);
    }

    if (typeof window !== 'undefined' && window.localStorage) {
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
   * Atomically coordinates across tabs with stale lock fencing and OCC.
   */
  public async recordRequest(timestamp: number = Date.now()): Promise<void> {
    this.lastRequestTime = timestamp;

    const reservationId = this.activeReservations.shift();
    if (reservationId) {
      // Slot was already reserved in localStorage by acquireToken. Update timestamp.
      const existing = this.localRecords.find((r) => r.id === reservationId);
      if (existing) {
        existing.timestamp = timestamp;
      }

      while (true) {
        try {
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
          return;
        } catch (err) {
          if (err instanceof StaleLockError) {
            await this.delay(20);
            continue;
          }
          throw err;
        }
      }
    }

    // Standalone recordRequest invocation without preceding acquireToken
    const recordId = `${this.tabId}_${timestamp}_${Math.random().toString(36).slice(2, 7)}`;
    const record: RequestRecord = {
      id: recordId,
      timestamp
    };
    this.localRecords.push(record);

    while (true) {
      try {
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
        return;
      } catch (err) {
        if (err instanceof StaleLockError) {
          await this.delay(20);
          continue;
        }
        throw err;
      }
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

    while (true) {
      try {
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
        return;
      } catch (err) {
        if (err instanceof StaleLockError) {
          await this.delay(20);
          continue;
        }
        throw err;
      }
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
      lockMechanism: this.getLockMechanism()
    };
  }

  /**
   * Acquires permission to dispatch a request, awaiting tokens or window capacity if necessary.
   * Respects AbortSignal for immediate cancellation and coordinates atomically across tabs.
   * Defends against stale lock owners by verifying lease validity and storage version before commit.
   */
  public async acquireToken(signal?: AbortSignal): Promise<void> {
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

      // 2. Perform atomic window and bucket reservation under cross-tab lock
      let waitDuration = 0;
      let acquiredSuccessfully = false;
      let reservationId: string | null = null;

      try {
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

          // Both rolling-window and token bucket have capacity: claim slot
          this.tokens = Math.max(0, this.tokens - 1);
          reservationId = `${this.tabId}_${lockTime}_${Math.random().toString(36).slice(2, 7)}`;
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

            // Fencing verification & atomic OCC commit
            context.commitRecords(active);
          }

          acquiredSuccessfully = true;
        }, signal);
      } catch (err) {
        if (err instanceof StaleLockError) {
          // Stale lease or OCC conflict detected: rollback in-memory speculation and retry
          if (reservationId) {
            this.activeReservations = this.activeReservations.filter((id) => id !== reservationId);
            this.localRecords = this.localRecords.filter((r) => r.id !== reservationId);
            this.tokens = Math.min(this.bucketCapacity, this.tokens + 1);
          }
          await this.delay(20, signal);
          continue;
        }
        throw err;
      }

      if (acquiredSuccessfully) {
        return;
      }

      if (waitDuration > 0) {
        await this.delay(waitDuration, signal);
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
        window.localStorage.removeItem(`snapora_lock_${this.syncStorageKey}_lease`);
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
