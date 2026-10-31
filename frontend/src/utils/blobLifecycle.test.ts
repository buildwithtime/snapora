import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  scheduleBlobUrlRevocation,
  revokeBlobUrlImmediately,
  triggerManagedBlobDownload,
  getActiveTrackedBlobUrlCount,
  resetBlobUrlRegistry,
  DEFAULT_BLOB_REVOKE_DELAY_MS,
  MAX_TRACKED_BLOB_URLS
} from './blobLifecycle.js';

describe('Browser Blob URL Lifecycle Manager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetBlobUrlRegistry();
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn((_blob: any) => `blob:mock-${Math.random()}`),
      revokeObjectURL: vi.fn()
    });
    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
    vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);
  });

  afterEach(() => {
    resetBlobUrlRegistry();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('tracks an object URL and does not revoke it prematurely (e.g. at 60s)', () => {
    const mockUrl = 'blob:mock-video-150mb';
    scheduleBlobUrlRevocation(mockUrl);

    expect(getActiveTrackedBlobUrlCount()).toBe(1);

    // Fast-forward 60 seconds (the old naive timeout)
    vi.advanceTimersByTime(60000);

    // URL is still retained!
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith(mockUrl);
    expect(getActiveTrackedBlobUrlCount()).toBe(1);

    // Fast-forward to the default retention duration (5 minutes)
    vi.advanceTimersByTime(DEFAULT_BLOB_REVOKE_DELAY_MS - 60000);

    expect(URL.revokeObjectURL).toHaveBeenCalledWith(mockUrl);
    expect(getActiveTrackedBlobUrlCount()).toBe(0);
  });

  it('revokes URL immediately when revokeBlobUrlImmediately is invoked', () => {
    const mockUrl = 'blob:mock-photo';
    scheduleBlobUrlRevocation(mockUrl);
    expect(getActiveTrackedBlobUrlCount()).toBe(1);

    revokeBlobUrlImmediately(mockUrl);

    expect(URL.revokeObjectURL).toHaveBeenCalledWith(mockUrl);
    expect(getActiveTrackedBlobUrlCount()).toBe(0);
  });

  it('evicts oldest entries when registry exceeds maximum capacity of 50', () => {
    for (let i = 0; i < MAX_TRACKED_BLOB_URLS + 5; i++) {
      scheduleBlobUrlRevocation(`blob:mock-item-${i}`);
    }

    // Capacity capped at MAX_TRACKED_BLOB_URLS
    expect(getActiveTrackedBlobUrlCount()).toBe(MAX_TRACKED_BLOB_URLS);
    // Oldest items were revoked upon eviction
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-item-0');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-item-1');
  });

  it('triggers browser download and registers object URL in lifecycle manager', () => {
    const mockBlob = new Blob(['sample data'], { type: 'text/plain' });
    const clickSpy = vi.fn();
    vi.spyOn(document, 'createElement').mockReturnValue({
      set href(_val: string) {},
      set download(_val: string) {},
      set target(_val: string) {},
      set rel(_val: string) {},
      click: clickSpy
    } as any);

    triggerManagedBlobDownload(mockBlob, 'archive.zip');

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(getActiveTrackedBlobUrlCount()).toBe(1);
  });

  it('cleans up all active URLs when beforeunload event fires', () => {
    scheduleBlobUrlRevocation('blob:mock-item-1');
    scheduleBlobUrlRevocation('blob:mock-item-2');
    expect(getActiveTrackedBlobUrlCount()).toBe(2);

    window.dispatchEvent(new Event('beforeunload'));

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-item-1');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-item-2');
    expect(getActiveTrackedBlobUrlCount()).toBe(0);
  });
});
