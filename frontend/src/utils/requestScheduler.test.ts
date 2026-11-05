// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ClientRequestScheduler,
  CrossTabCoordinationUnavailableError
} from './requestScheduler.js';

/**
 * Creates a deterministic FIFO Web Locks mock that mirrors W3C navigator.locks behavior.
 */
function createWebLocksMock() {
  const queues = new Map<string, Promise<void>>();

  return {
    request: vi.fn(async (name: string, optionsOrCb: any, maybeCb?: any) => {
      const cb = typeof optionsOrCb === 'function' ? optionsOrCb : maybeCb;
      const signal = typeof optionsOrCb === 'object' ? optionsOrCb.signal : undefined;

      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      const prev = queues.get(name) || Promise.resolve();
      let release: () => void = () => {};
      const current = new Promise<void>((resolve) => {
        release = resolve;
      });
      queues.set(name, prev.then(() => current));

      await prev;
      if (signal?.aborted) {
        release();
        throw new DOMException('Aborted', 'AbortError');
      }

      try {
        return await cb();
      } finally {
        release();
      }
    })
  };
}

describe('ClientRequestScheduler Unit & Multi-Tab Suite', () => {
  const originalLocks = (navigator as any).locks;

  beforeEach(() => {
    vi.useRealTimers();
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
    // Default to Web Locks unavailable unless explicitly mocked in test
    delete (navigator as any).locks;
  });

  afterEach(() => {
    (navigator as any).locks = originalLocks;
  });

  describe('Single-Tab Autonomous Scheduling (Web Locks Unavailable)', () => {
    it('identifies unsupported state when navigator.locks is unavailable', () => {
      const scheduler = new ClientRequestScheduler();
      expect(scheduler.isCrossTabSupported()).toBe(false);
      expect(scheduler.getLockMechanism()).toBe('unsupported');

      const snapshot = scheduler.getSnapshot();
      expect(snapshot.isCrossTabSupported).toBe(false);
      expect(snapshot.lockMechanism).toBe('unsupported');
    });

    it('disables operations requiring shared cross-tab coordination rather than using unsafe fallback', async () => {
      const scheduler = new ClientRequestScheduler();

      // Explicit cross-tab locking must reject cleanly
      await expect(
        scheduler.withCrossTabLock(async () => 'forbidden')
      ).rejects.toThrow(CrossTabCoordinationUnavailableError);

      // Verify no obsolete localStorage lease keys were created
      expect(window.localStorage.length).toBe(0);
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

      expect(elapsed).toBeLessThan(100);
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

      await scheduler.acquireToken();
      await scheduler.recordRequest();
      await scheduler.acquireToken();
      await scheduler.recordRequest();

      expect(scheduler.getSnapshot().tokens).toBe(0);

      let acquired = false;
      const acquirePromise = scheduler.acquireToken().then(async () => {
        acquired = true;
        await scheduler.recordRequest();
      });

      expect(acquired).toBe(false);

      await vi.advanceTimersByTimeAsync(1000);
      expect(acquired).toBe(false);

      await vi.advanceTimersByTimeAsync(1000);
      await acquirePromise;
      expect(acquired).toBe(true);

      vi.useRealTimers();
    });

    it('enforces rolling window ceiling of 28 requests per 60 seconds locally', async () => {
      vi.useFakeTimers();
      const scheduler = new ClientRequestScheduler({
        bucketCapacity: 30,
        rollingWindowMax: 28,
        rollingWindowMs: 60000,
        minPacingMs: 0
      });

      for (let i = 0; i < 28; i++) {
        await scheduler.acquireToken();
        await scheduler.recordRequest();
      }

      const snapshot = scheduler.getSnapshot();
      expect(snapshot.rollingWindowCount).toBe(28);

      let acquired29 = false;
      const p29 = scheduler.acquireToken().then(async () => {
        acquired29 = true;
        await scheduler.recordRequest();
      });

      expect(acquired29).toBe(false);

      await vi.advanceTimersByTimeAsync(30000);
      expect(acquired29).toBe(false);

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

      await vi.advanceTimersByTimeAsync(16000);
      await p;
      expect(acquired).toBe(true);

      vi.useRealTimers();
    });

    it('cancels pending reservation without touching shared cross-tab storage', async () => {
      const storageKey = 'single_tab_cancel_storage';
      const scheduler = new ClientRequestScheduler({
        bucketCapacity: 2,
        syncStorageKey: storageKey,
        minPacingMs: 0
      });

      await scheduler.acquireToken();
      expect(scheduler.getSnapshot().tokens).toBe(1);

      await scheduler.cancelPendingReservation();
      expect(scheduler.getSnapshot().tokens).toBe(2);

      // Verify no cross-tab state was created or touched
      expect(window.localStorage.getItem(storageKey)).toBeNull();
    });
  });

  describe('Web Locks-Supported Cross-Tab Synchronization', () => {
    beforeEach(() => {
      (navigator as any).locks = createWebLocksMock();
    });

    it('identifies web-locks mechanism when navigator.locks is available', () => {
      const scheduler = new ClientRequestScheduler();
      expect(scheduler.isCrossTabSupported()).toBe(true);
      expect(scheduler.getLockMechanism()).toBe('web-locks');

      const snapshot = scheduler.getSnapshot();
      expect(snapshot.isCrossTabSupported).toBe(true);
      expect(snapshot.lockMechanism).toBe('web-locks');
    });

    it('coordinates shared rate-limit window across multiple tabs under Web Locks', async () => {
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

      // Tab 2 checks status and sees Tab 1's requests in shared window
      expect(tab2.getSnapshot().rollingWindowCount).toBe(3);

      // Tab 2 fires 2 requests (total across tabs reaches 5)
      for (let i = 0; i < 2; i++) {
        await tab2.acquireToken();
        await tab2.recordRequest();
      }

      expect(tab1.getSnapshot().rollingWindowCount).toBe(5);
      expect(tab2.getSnapshot().rollingWindowCount).toBe(5);
    });

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

      await vi.advanceTimersByTimeAsync(300);
      await Promise.resolve();

      const immediatelyResolved = results.filter((r) => r.resolved);
      expect(immediatelyResolved.length).toBe(rollingWindowMax);

      const waitingCount = results.filter((r) => !r.resolved).length;
      expect(waitingCount).toBe(4);

      await vi.advanceTimersByTimeAsync(60100);
      await Promise.all(promises);

      expect(results.every((r) => r.resolved)).toBe(true);

      vi.useRealTimers();
    });

    it('prevents state corruption when multiple tabs record requests simultaneously', async () => {
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

      const recordPromises = tabs.flatMap((tab) =>
        Array.from({ length: 5 }, () => tab.recordRequest())
      );

      await Promise.all(recordPromises);

      const raw = window.localStorage.getItem(storageKey);
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw!);
      const records = Array.isArray(parsed) ? parsed : parsed.records;
      expect(records.length).toBe(20);

      const ids = new Set(records.map((r: any) => r.id));
      expect(ids.size).toBe(20);
    });

    it('coordinates reservation cancellations across tabs under Web Locks', async () => {
      const storageKey = 'test_cancel_sync';
      const tab1 = new ClientRequestScheduler({
        bucketCapacity: 10,
        syncStorageKey: storageKey,
        minPacingMs: 0
      });

      const tab2 = new ClientRequestScheduler({
        bucketCapacity: 10,
        syncStorageKey: storageKey,
        minPacingMs: 0
      });

      await tab1.acquireToken();
      expect(tab2.getSnapshot().rollingWindowCount).toBe(1);

      await tab1.cancelPendingReservation();
      expect(tab2.getSnapshot().rollingWindowCount).toBe(0);
    });
  });
});
