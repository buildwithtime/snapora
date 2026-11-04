// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ClientRequestScheduler, StaleLockError } from './requestScheduler.js';

describe('ClientRequestScheduler Unit & Multi-Tab Suite', () => {
  beforeEach(() => {
    vi.useRealTimers();
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
  });

  it('allows immediate burst processing for small batches up to capacity', async () => {
    const scheduler = new ClientRequestScheduler({
      bucketCapacity: 10,
      minPacingMs: 0
    });

    const start = Date.now();
    for (let i = 0; i < 10; i++) {
      await scheduler.acquireToken();
      await scheduler.recordRequest();
    }
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(100); // Instant execution for small batch of 10
    const snapshot = scheduler.getSnapshot();
    expect(snapshot.tokens).toBe(0);
    expect(snapshot.rollingWindowCount).toBe(10);
  });

  it('enforces refill interval when bucket is empty', async () => {
    vi.useFakeTimers();
    const scheduler = new ClientRequestScheduler({
      bucketCapacity: 2,
      refillIntervalMs: 2000,
      minPacingMs: 0
    });

    // Drain initial 2 tokens
    await scheduler.acquireToken();
    await scheduler.recordRequest();
    await scheduler.acquireToken();
    await scheduler.recordRequest();

    expect(scheduler.getSnapshot().tokens).toBe(0);

    // 3rd request must wait for token refill
    let acquired = false;
    const acquirePromise = scheduler.acquireToken().then(async () => {
      acquired = true;
      await scheduler.recordRequest();
    });

    expect(acquired).toBe(false);

    // Advance 1000ms: still waiting
    await vi.advanceTimersByTimeAsync(1000);
    expect(acquired).toBe(false);

    // Advance remaining 1000ms: total 2000ms elapsed -> token refilled and acquired!
    await vi.advanceTimersByTimeAsync(1000);
    await acquirePromise;
    expect(acquired).toBe(true);

    vi.useRealTimers();
  });

  it('enforces rolling window ceiling of 28 requests per 60 seconds', async () => {
    vi.useFakeTimers();
    const scheduler = new ClientRequestScheduler({
      bucketCapacity: 30, // Large bucket to isolate rolling window check
      rollingWindowMax: 28,
      rollingWindowMs: 60000,
      minPacingMs: 0
    });

    // Fire 28 requests
    for (let i = 0; i < 28; i++) {
      await scheduler.acquireToken();
      await scheduler.recordRequest();
    }

    const snapshot = scheduler.getSnapshot();
    expect(snapshot.rollingWindowCount).toBe(28);

    // 29th request must wait for the oldest request to slide out of the 60s window
    let acquired29 = false;
    const p29 = scheduler.acquireToken().then(async () => {
      acquired29 = true;
      await scheduler.recordRequest();
    });

    expect(acquired29).toBe(false);

    // Advance 30 seconds: still locked
    await vi.advanceTimersByTimeAsync(30000);
    expect(acquired29).toBe(false);

    // Advance past 60s window: slides out and acquires!
    await vi.advanceTimersByTimeAsync(30100);
    await p29;
    expect(acquired29).toBe(true);

    vi.useRealTimers();
  });

  it('respects AbortSignal for immediate cancellation during wait', async () => {
    vi.useFakeTimers();
    const scheduler = new ClientRequestScheduler({
      bucketCapacity: 1,
      refillIntervalMs: 5000,
      minPacingMs: 0
    });

    await scheduler.acquireToken();
    await scheduler.recordRequest();

    const controller = new AbortController();
    const acquirePromise = scheduler.acquireToken(controller.signal);

    const assertion = expect(acquirePromise).rejects.toThrow('Aborted');
    controller.abort();
    await vi.advanceTimersByTimeAsync(10);

    await assertion;
    vi.useRealTimers();
  });

  it('synchronizes rate limit state across multiple tabs via localStorage', async () => {
    const storageKey = 'test_sync_window';
    const tab1 = new ClientRequestScheduler({
      bucketCapacity: 30,
      rollingWindowMax: 5,
      rollingWindowMs: 60000,
      syncStorageKey: storageKey,
      minPacingMs: 0
    });

    const tab2 = new ClientRequestScheduler({
      bucketCapacity: 30,
      rollingWindowMax: 5,
      rollingWindowMs: 60000,
      syncStorageKey: storageKey,
      minPacingMs: 0
    });

    // Tab 1 fires 3 requests
    for (let i = 0; i < 3; i++) {
      await tab1.acquireToken();
      await tab1.recordRequest();
    }

    // Tab 2 checks status and sees Tab 1's requests
    expect(tab2.getSnapshot().rollingWindowCount).toBe(3);

    // Tab 2 fires 2 requests (total across tabs reaches 5)
    for (let i = 0; i < 2; i++) {
      await tab2.acquireToken();
      await tab2.recordRequest();
    }

    expect(tab1.getSnapshot().rollingWindowCount).toBe(5);
    expect(tab2.getSnapshot().rollingWindowCount).toBe(5);
  });

  it('pauses dispatches and resets tokens during active cooldown', async () => {
    vi.useFakeTimers();
    const scheduler = new ClientRequestScheduler({ minPacingMs: 0 });

    scheduler.triggerCooldown(30);
    const snapshot = scheduler.getSnapshot();
    expect(snapshot.isCoolingDown).toBe(true);
    expect(snapshot.cooldownRemainingSeconds).toBe(30);

    let acquired = false;
    const p = scheduler.acquireToken().then(() => {
      acquired = true;
    });

    await vi.advanceTimersByTimeAsync(15000);
    expect(acquired).toBe(false);

    await vi.advanceTimersByTimeAsync(16000); // Total 31s
    await p;
    expect(acquired).toBe(true);

    vi.useRealTimers();
  });

  describe('Multi-Tab Concurrency & Race-Condition Protection', () => {
    it('serializes simultaneous scheduling attempts across multiple tabs under rolling window ceiling', async () => {
      vi.useFakeTimers();
      const storageKey = 'test_concurrency_window';
      const rollingWindowMax = 5;

      const tab1 = new ClientRequestScheduler({
        bucketCapacity: 10,
        rollingWindowMax,
        rollingWindowMs: 60000,
        syncStorageKey: storageKey,
        minPacingMs: 0
      });

      const tab2 = new ClientRequestScheduler({
        bucketCapacity: 10,
        rollingWindowMax,
        rollingWindowMs: 60000,
        syncStorageKey: storageKey,
        minPacingMs: 0
      });

      const tab3 = new ClientRequestScheduler({
        bucketCapacity: 10,
        rollingWindowMax,
        rollingWindowMs: 60000,
        syncStorageKey: storageKey,
        minPacingMs: 0
      });

      // 3 tabs attempt 3 requests each simultaneously (total 9 attempts against a cap of 5)
      const results: { tab: string; index: number; resolved: boolean }[] = [];

      const queueAttempt = (tab: ClientRequestScheduler, tabName: string, index: number) => {
        const item = { tab: tabName, index, resolved: false };
        results.push(item);
        return tab.acquireToken().then(async () => {
          item.resolved = true;
          await tab.recordRequest();
        });
      };

      const promises = [
        queueAttempt(tab1, 'tab1', 1),
        queueAttempt(tab1, 'tab1', 2),
        queueAttempt(tab1, 'tab1', 3),
        queueAttempt(tab2, 'tab2', 1),
        queueAttempt(tab2, 'tab2', 2),
        queueAttempt(tab2, 'tab2', 3),
        queueAttempt(tab3, 'tab3', 1),
        queueAttempt(tab3, 'tab3', 2),
        queueAttempt(tab3, 'tab3', 3)
      ];

      // Let immediate lock acquisitions settle across tabs
      await vi.advanceTimersByTimeAsync(300);
      await Promise.resolve();

      // Exactly rollingWindowMax (5) requests should be resolved immediately; remaining 4 must wait
      const immediatelyResolved = results.filter((r) => r.resolved);
      expect(immediatelyResolved.length).toBe(rollingWindowMax);

      const waitingCount = results.filter((r) => !r.resolved).length;
      expect(waitingCount).toBe(4);

      // Advance timers past 60s: the window slides, allowing the waiting requests through
      await vi.advanceTimersByTimeAsync(60100);
      await Promise.all(promises);

      // Now all 9 requests have resolved
      expect(results.every((r) => r.resolved)).toBe(true);

      vi.useRealTimers();
    });

    it('prevents localStorage read-modify-write overwrite race when multiple tabs record simultaneously', async () => {
      const storageKey = 'test_record_race';
      const tabs = Array.from(
        { length: 4 },
        () =>
          new ClientRequestScheduler({
            syncStorageKey: storageKey,
            rollingWindowMs: 60000,
            minPacingMs: 0
          })
      );

      // 4 tabs simultaneously record 5 requests each = 20 total records
      const recordPromises = tabs.flatMap((tab) =>
        Array.from({ length: 5 }, () => tab.recordRequest())
      );

      await Promise.all(recordPromises);

      // Verify that all 20 records were saved without any being overwritten
      const raw = window.localStorage.getItem(storageKey);
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw!);
      const records = Array.isArray(parsed) ? parsed : parsed.records;
      expect(records.length).toBe(20);

      // Verify all record IDs are unique
      const ids = new Set(records.map((r: any) => r.id));
      expect(ids.size).toBe(20);
    });

    it('identifies Web Locks API when available and falls back gracefully when absent', async () => {
      // 1. Without navigator.locks (jsdom default)
      const fallbackScheduler = new ClientRequestScheduler();
      expect(fallbackScheduler.getLockMechanism()).toBe('localstorage-mutex');

      // 2. With navigator.locks mocked
      const originalLocks = (navigator as any).locks;
      let requestedLock = false;
      try {
        (navigator as any).locks = {
          request: vi.fn(async (_name: string, _optionsOrCb: any, cb?: any) => {
            requestedLock = true;
            const callback = typeof _optionsOrCb === 'function' ? _optionsOrCb : cb;
            return await callback();
          })
        };

        const webLockScheduler = new ClientRequestScheduler();
        expect(webLockScheduler.getLockMechanism()).toBe('web-locks');

        await webLockScheduler.recordRequest();
        expect(requestedLock).toBe(true);
      } finally {
        (navigator as any).locks = originalLocks;
      }
    });

    it('fences out stale lock owners when localStorage lease expires during execution', async () => {
      vi.useFakeTimers();
      const storageKey = 'test_stale_fencing';
      const lockKey = `snapora_lock_${storageKey}_lease`;

      const scheduler = new ClientRequestScheduler({
        syncStorageKey: storageKey,
        leaseDurationMs: 200, // Short 200ms lease for test
        minPacingMs: 0
      });

      let executedCriticalSection = false;
      let caughtStaleError = false;

      // Acquire lock and simulate delayed operation exceeding lease
      const lockPromise = scheduler.withCrossTabLock(async (context) => {
        expect(context.isValid()).toBe(true);

        // Advance time past the 200ms lease duration
        await vi.advanceTimersByTimeAsync(250);

        // context.isValid() must now detect expiration
        expect(context.isValid()).toBe(false);

        // context.ensureValid() must throw StaleLockError
        expect(() => context.ensureValid()).toThrow(StaleLockError);

        try {
          context.ensureValid();
          executedCriticalSection = true;
        } catch (err) {
          if (err instanceof StaleLockError) {
            caughtStaleError = true;
          }
          throw err;
        }
      });

      await expect(lockPromise).rejects.toThrow(StaleLockError);
      expect(caughtStaleError).toBe(true);
      expect(executedCriticalSection).toBe(false);

      // Verify stale owner did NOT delete a superseded lock in finally
      // Simulate another tab acquiring the lock after expiration
      const otherTabCandidate = JSON.stringify({
        owner: 'tab_other_active',
        expiresAt: Date.now() + 3000
      });
      window.localStorage.setItem(lockKey, otherTabCandidate);

      // Now run another operation on the first scheduler: verify other tab's lock remains intact
      expect(window.localStorage.getItem(lockKey)).toBe(otherTabCandidate);

      vi.useRealTimers();
    });

    it('strictly prevents TOCTOU stale write from overwriting state or releasing another tab lock after lease expiry', async () => {
      const storageKey = 'test_toctou_barrier';
      const lockKey = `snapora_lock_${storageKey}_lease`;

      const tabA = new ClientRequestScheduler({
        syncStorageKey: storageKey,
        leaseDurationMs: 500,
        minPacingMs: 0
      });

      const tabB = new ClientRequestScheduler({
        syncStorageKey: storageKey,
        leaseDurationMs: 3000,
        minPacingMs: 0
      });

      // Deterministic barriers for controllable suspension
      let tabAValidatedOwnership: () => void = () => {};
      const tabAValidatedPromise = new Promise<void>((r) => {
        tabAValidatedOwnership = r;
      });

      let letTabAResume: () => void = () => {};
      const resumeTabAPromise = new Promise<void>((r) => {
        letTabAResume = r;
      });

      let tabACaughtError: any = null;

      // 1. Tab A enters withCrossTabLock, validates ownership, and then is suspended at barrier
      const tabAPromise = tabA.withCrossTabLock(async (context) => {
        // Tab A initially validates ownership successfully
        context.ensureValid();
        expect(context.isValid()).toBe(true);

        // Notify test that Tab A has passed validation and is now suspended
        tabAValidatedOwnership();

        // Tab A is suspended at the barrier, waiting to be resumed
        await resumeTabAPromise;

        // Tab A resumes and attempts its stale write
        const tabAStaleRecord = [{ id: 'stale_record_from_tab_A', timestamp: Date.now() }];
        context.commitRecords(tabAStaleRecord);
      }).catch((err) => {
        tabACaughtError = err;
      });

      // Wait until Tab A has validated ownership and is suspended at the barrier
      await tabAValidatedPromise;

      // 2. While Tab A is suspended at the barrier, simulate Tab A's lease expiration
      // and Tab B acquiring the lease and updating shared state
      const tabBRecord = [{ id: 'valid_record_from_tab_B', timestamp: Date.now() }];

      // Overwrite lock with Tab B's active lease
      const tabBLockPayload = {
        owner: (tabB as any).tabId,
        fenceToken: `fence_${(tabB as any).tabId}_1`,
        expiresAt: Date.now() + 10000
      };
      window.localStorage.setItem(lockKey, JSON.stringify(tabBLockPayload));

      // Tab B updates shared state under its valid lock
      await tabB.withCrossTabLock(async (bContext) => {
        bContext.commitRecords(tabBRecord);
      });

      // Verify Tab B's record and version 1 exist in storage
      const storageAfterB = JSON.parse(window.localStorage.getItem(storageKey)!);
      expect(storageAfterB.records).toEqual(tabBRecord);
      expect(storageAfterB.version).toBe(1);

      // Simulate Tab B actively holding a new lock when Tab A attempts its stale write
      window.localStorage.setItem(lockKey, JSON.stringify(tabBLockPayload));

      // 3. Now resume Tab A and let it attempt to commit its stale write
      letTabAResume();
      await tabAPromise;

      // 4. Verification:
      // a) Tab A's stale commit was rejected with StaleLockError
      expect(tabACaughtError).toBeInstanceOf(StaleLockError);

      // b) Tab A did NOT overwrite Tab B's state!
      const finalStorage = JSON.parse(window.localStorage.getItem(storageKey)!);
      expect(finalStorage.records).toEqual(tabBRecord);
      expect(finalStorage.version).toBe(1);
      expect(finalStorage.records).not.toContainEqual(expect.objectContaining({ id: 'stale_record_from_tab_A' }));

      // c) Tab A's finally block did NOT delete or overwrite Tab B's lock!
      const finalLock = JSON.parse(window.localStorage.getItem(lockKey)!);
      expect(finalLock.owner).toBe((tabB as any).tabId);
    });
  });
});
