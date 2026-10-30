import JSZip from 'jszip';
import { MediaItem, CarouselItem } from '../types/queue.js';
import { FilenameCollisionTracker, generateZipArchiveFilename } from './filenameGenerator.js';

export const MAX_ZIP_ITEMS = 100;
export const MAX_ZIP_TOTAL_BYTES = 500 * 1024 * 1024; // 500 MB

export interface ZipProgressUpdate {
  phase: 'fetching' | 'compressing' | 'completed' | 'cancelled';
  total: number;
  completed: number;
  failed: number;
  currentFilename?: string;
  archiveName?: string;
  percent?: number;
}

export interface ZipResult {
  success: boolean;
  archiveName: string;
  completed: number;
  failed: number;
  failedItemIds: string[];
  totalBytes: number;
  blob?: Blob;
  error?: string;
}

/**
 * Validates initial bytes of a downloaded buffer to ensure authentic media signatures
 * and prevent HTML error pages or scripts from entering the ZIP archive.
 */
export function validateClientMediaBytes(headerChunk: Uint8Array): {
  valid: boolean;
  detectedType?: 'image/jpeg' | 'video/mp4' | 'image/webp' | 'image/png';
  error?: string;
} {
  if (!headerChunk || headerChunk.length < 12) {
    return { valid: false, error: 'Payload too short to verify media file signature' };
  }

  // 1. Rejection of HTML, XML, JSON, or scripts disguised as media
  const textPrefix = new TextDecoder('utf-8')
    .decode(headerChunk.subarray(0, Math.min(headerChunk.length, 64)))
    .trim()
    .toLowerCase();

  if (
    textPrefix.includes('<!doctype') ||
    textPrefix.includes('<html') ||
    textPrefix.includes('<?xml') ||
    textPrefix.startsWith('{') ||
    textPrefix.includes('<script')
  ) {
    return { valid: false, error: 'Received HTML/text/JSON response instead of binary media' };
  }

  // 2. JPEG: SOI marker 0xFF 0xD8 0xFF
  if (headerChunk[0] === 0xff && headerChunk[1] === 0xd8 && headerChunk[2] === 0xff) {
    return { valid: true, detectedType: 'image/jpeg' };
  }

  // 3. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    headerChunk[0] === 0x89 &&
    headerChunk[1] === 0x50 &&
    headerChunk[2] === 0x4e &&
    headerChunk[3] === 0x47
  ) {
    return { valid: true, detectedType: 'image/png' };
  }

  // 4. MP4 (ISO Base Media File Format): 'ftyp' at offset 4..7
  if (
    headerChunk[4] === 0x66 &&
    headerChunk[5] === 0x74 &&
    headerChunk[6] === 0x79 &&
    headerChunk[7] === 0x70
  ) {
    return { valid: true, detectedType: 'video/mp4' };
  }

  // 5. WebP: RIFF (0..3) and WEBP (8..11)
  if (
    headerChunk[0] === 0x52 &&
    headerChunk[1] === 0x49 &&
    headerChunk[2] === 0x46 &&
    headerChunk[3] === 0x46 &&
    headerChunk[8] === 0x57 &&
    headerChunk[9] === 0x45 &&
    headerChunk[10] === 0x42 &&
    headerChunk[11] === 0x50
  ) {
    return { valid: true, detectedType: 'image/webp' };
  }

  return {
    valid: false,
    error: 'Binary signature does not match any supported media format (JPEG, MP4, WebP, PNG)'
  };
}

async function getBlobArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') {
    return await blob.arrayBuffer();
  }
  // Fallback for jsdom and older webview environments
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error || new Error('Failed to read blob'));
    reader.readAsArrayBuffer(blob);
  });
}

/**
 * Fetches and verifies genuine media bytes via the protected SSRF download proxy.
 */
export async function fetchValidatedMediaBlob(
  item: MediaItem | CarouselItem,
  apiBaseUrl: string,
  isDemoMode = false,
  signal?: AbortSignal
): Promise<Blob> {
  if (item.downloadable === false || !item.url) {
    throw new Error('Original media download is unavailable for this item (preview only)');
  }

  let blob: Blob;

  if (
    !isDemoMode &&
    (item.url.startsWith('https://scontent') ||
      item.url.includes('cdninstagram') ||
      item.url.includes('fbcdn.net') ||
      item.url.includes('instagram.com'))
  ) {
    const downloadUrl = `${apiBaseUrl}/api/download?url=${encodeURIComponent(
      item.url
    )}&filename=${encodeURIComponent(item.filename)}&expectedType=${encodeURIComponent(item.type)}`;

    const response = await fetch(downloadUrl, { signal });
    if (!response.ok) {
      let errMsg = `Proxy fetch failed with HTTP ${response.status}`;
      try {
        const raw = await response.text();
        if (raw.trim()) {
          const parsed = JSON.parse(raw);
          errMsg = parsed.error?.message || errMsg;
        }
      } catch {
        // Fallback to HTTP error
      }
      throw new Error(errMsg);
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html') || contentType.includes('application/json')) {
      throw new Error(`Upstream returned non-media content type: ${contentType}`);
    }

    blob = await response.blob();
  } else {
    // Direct URL or local demo fixture
    const response = await fetch(item.url, { signal });
    if (!response.ok) {
      throw new Error(`Direct media fetch failed with HTTP ${response.status}`);
    }
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html') || contentType.includes('application/json')) {
      throw new Error(`Endpoint returned non-media content type: ${contentType}`);
    }
    blob = await response.blob();
  }

  if (blob.size === 0) {
    throw new Error('Downloaded media payload is empty (0 bytes)');
  }

  // Read header bytes and verify binary signature
  const fullBuffer = await getBlobArrayBuffer(blob);
  const headerSlice = new Uint8Array(fullBuffer, 0, Math.min(fullBuffer.byteLength, 32));
  const validation = validateClientMediaBytes(headerSlice);
  if (!validation.valid) {
    throw new Error(validation.error || 'Media signature verification failed');
  }

  return blob;
}

/**
 * Triggers a browser download of a generated Blob.
 */
export function triggerBrowserBlobDownload(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
}

export interface BuildZipOptions {
  items: Array<{ jobId: string; item: MediaItem | CarouselItem }>;
  apiBaseUrl: string;
  isDemoMode?: boolean;
  archivePrefix?: string;
  signal?: AbortSignal;
  onProgress?: (update: ZipProgressUpdate) => void;
  onItemStatus?: (jobId: string, itemId: string, status: 'downloading' | 'completed' | 'failed', error?: string) => void;
}

/**
 * Builds a ZIP archive of eligible media files sequentially with bounded concurrency,
 * verifying bytes, preventing duplicate archive filenames, and enforcing limits.
 */
export async function buildAndDownloadZip(options: BuildZipOptions): Promise<ZipResult> {
  const {
    items,
    apiBaseUrl,
    isDemoMode = false,
    archivePrefix,
    signal,
    onProgress,
    onItemStatus
  } = options;

  if (items.length === 0) {
    return {
      success: false,
      archiveName: '',
      completed: 0,
      failed: 0,
      failedItemIds: [],
      totalBytes: 0,
      error: 'No items eligible for archive creation'
    };
  }

  if (items.length > MAX_ZIP_ITEMS) {
    return {
      success: false,
      archiveName: '',
      completed: 0,
      failed: items.length,
      failedItemIds: items.map((i) => i.item.id || i.item.filename),
      totalBytes: 0,
      error: `Queue exceeds maximum allowed archive limit of ${MAX_ZIP_ITEMS} items.`
    };
  }

  // Capture start timestamp for deterministic archive naming
  const archiveStartTime = new Date();
  const archiveName = generateZipArchiveFilename(archiveStartTime, archivePrefix);

  const zip = new JSZip();
  const archiveTracker = new FilenameCollisionTracker();
  const failedItemIds: string[] = [];

  let completed = 0;
  let failed = 0;
  let totalBytes = 0;

  onProgress?.({
    phase: 'fetching',
    total: items.length,
    completed: 0,
    failed: 0,
    archiveName,
    percent: 0
  });

  for (let i = 0; i < items.length; i++) {
    if (signal?.aborted) {
      onProgress?.({
        phase: 'cancelled',
        total: items.length,
        completed,
        failed,
        archiveName
      });
      return {
        success: false,
        archiveName,
        completed,
        failed,
        failedItemIds,
        totalBytes,
        error: 'ZIP operation cancelled by user'
      };
    }

    const { jobId, item } = items[i];
    const itemId = item.id || item.filename;

    // Resolve collision-free entry name within the archive
    const entryFilename = archiveTracker.getUniqueFilename(item.filename);

    onProgress?.({
      phase: 'fetching',
      total: items.length,
      completed,
      failed,
      currentFilename: entryFilename,
      archiveName,
      percent: Math.round(((completed + failed) / items.length) * 80)
    });

    onItemStatus?.(jobId, itemId, 'downloading');

    try {
      const blob = await fetchValidatedMediaBlob(item, apiBaseUrl, isDemoMode, signal);

      if (totalBytes + blob.size > MAX_ZIP_TOTAL_BYTES) {
        throw new Error(`Total archive size exceeds limit of 500 MB`);
      }

      totalBytes += blob.size;
      zip.file(entryFilename, blob);

      completed++;
      onItemStatus?.(jobId, itemId, 'completed');
    } catch (err: unknown) {
      if (signal?.aborted || (err as { name?: string })?.name === 'AbortError') {
        break;
      }
      failed++;
      failedItemIds.push(itemId);
      const errMsg = err instanceof Error ? err.message : 'Media fetch failed';
      onItemStatus?.(jobId, itemId, 'failed', errMsg);
    }

    // Brief yield between sequential items to keep browser responsive
    if (i < items.length - 1 && !signal?.aborted) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  if (signal?.aborted) {
    onProgress?.({
      phase: 'cancelled',
      total: items.length,
      completed,
      failed,
      archiveName
    });
    return {
      success: false,
      archiveName,
      completed,
      failed,
      failedItemIds,
      totalBytes,
      error: 'ZIP operation cancelled by user'
    };
  }

  if (completed === 0) {
    onProgress?.({
      phase: 'completed',
      total: items.length,
      completed: 0,
      failed,
      archiveName,
      percent: 100
    });
    return {
      success: false,
      archiveName,
      completed: 0,
      failed,
      failedItemIds,
      totalBytes: 0,
      error: 'All media items failed verification. No archive was generated.'
    };
  }

  // Phase 2: Compression & Archive generation
  onProgress?.({
    phase: 'compressing',
    total: items.length,
    completed,
    failed,
    archiveName,
    percent: 85
  });

  const zipBlob = await zip.generateAsync(
    {
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    },
    (metadata) => {
      onProgress?.({
        phase: 'compressing',
        total: items.length,
        completed,
        failed,
        archiveName,
        percent: 85 + Math.round((metadata.percent / 100) * 15)
      });
    }
  );

  // Trigger browser download
  triggerBrowserBlobDownload(zipBlob, archiveName);

  onProgress?.({
    phase: 'completed',
    total: items.length,
    completed,
    failed,
    archiveName,
    percent: 100
  });

  return {
    success: true,
    archiveName,
    completed,
    failed,
    failedItemIds,
    totalBytes: zipBlob.size,
    blob: zipBlob
  };
}
