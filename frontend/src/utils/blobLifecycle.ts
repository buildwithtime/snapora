/**
 * Browser Blob URL Lifecycle Manager
 *
 * Ensures object URLs created via URL.createObjectURL(blob) are retained long enough
 * for large media files (up to 150 MB) and slow disks / "Save As" file pickers to
 * complete writing, while preventing memory leaks through bounded retention and
 * automatic cleanup on page unload.
 */

// Default retention: 5 minutes (300,000 ms), giving ample time for multi-hundred-megabyte
// downloads and OS file picker interactions without premature "Network error" aborts.
export const DEFAULT_BLOB_REVOKE_DELAY_MS = 5 * 60 * 1000;

// Maximum number of active Blob URLs tracked before oldest completed entries are evicted
export const MAX_TRACKED_BLOB_URLS = 50;

interface TrackedBlobUrl {
  url: string;
  createdAt: number;
  timerId: ReturnType<typeof setTimeout>;
}

const activeBlobUrls = new Map<string, TrackedBlobUrl>();
let isUnloadHandlerAttached = false;

function ensureUnloadHandler(): void {
  if (isUnloadHandlerAttached || typeof window === 'undefined') return;

  const cleanupAll = () => {
    for (const [url, entry] of activeBlobUrls.entries()) {
      clearTimeout(entry.timerId);
      try {
        URL.revokeObjectURL(url);
      } catch {
        // Ignore errors during document unload
      }
    }
    activeBlobUrls.clear();
  };

  window.addEventListener('pagehide', cleanupAll, { capture: true });
  window.addEventListener('beforeunload', cleanupAll, { capture: true });
  isUnloadHandlerAttached = true;
}

/**
 * Registers an object URL for delayed, safe revocation.
 */
export function scheduleBlobUrlRevocation(
  objectUrl: string,
  delayMs = DEFAULT_BLOB_REVOKE_DELAY_MS
): void {
  if (!objectUrl || typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') {
    return;
  }

  ensureUnloadHandler();

  // If already tracked, clear existing timer
  if (activeBlobUrls.has(objectUrl)) {
    clearTimeout(activeBlobUrls.get(objectUrl)!.timerId);
  }

  // If tracking map exceeds capacity, evict and revoke the oldest entries immediately
  if (activeBlobUrls.size >= MAX_TRACKED_BLOB_URLS) {
    const oldestKey = activeBlobUrls.keys().next().value;
    if (oldestKey) {
      revokeBlobUrlImmediately(oldestKey);
    }
  }

  const timerId = setTimeout(() => {
    revokeBlobUrlImmediately(objectUrl);
  }, delayMs);

  activeBlobUrls.set(objectUrl, {
    url: objectUrl,
    createdAt: Date.now(),
    timerId
  });
}

/**
 * Revokes a tracked Blob URL immediately and removes it from the registry.
 */
export function revokeBlobUrlImmediately(objectUrl: string): void {
  const entry = activeBlobUrls.get(objectUrl);
  if (entry) {
    clearTimeout(entry.timerId);
    activeBlobUrls.delete(objectUrl);
  }
  try {
    URL.revokeObjectURL(objectUrl);
  } catch {
    // Ignore invalid or already revoked URLs
  }
}

/**
 * Triggers a native browser download using an anchor element and schedules
 * safe Blob URL cleanup via the lifecycle manager.
 */
export function triggerManagedBlobDownload(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  scheduleBlobUrlRevocation(objectUrl);
}

/**
 * Returns the current count of active tracked Blob URLs (useful for diagnostics and testing).
 */
export function getActiveTrackedBlobUrlCount(): number {
  return activeBlobUrls.size;
}

/**
 * Clears and revokes all active tracked Blob URLs (used for testing resets).
 */
export function resetBlobUrlRegistry(): void {
  for (const [url, entry] of activeBlobUrls.entries()) {
    clearTimeout(entry.timerId);
    try {
      URL.revokeObjectURL(url);
    } catch {
      // Ignore
    }
  }
  activeBlobUrls.clear();
}

