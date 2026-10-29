/**
 * Snapora Centralized Filename Generation Utility
 *
 * Implements standard, descriptive filename conventions for Instagram media downloads.
 *
 * Convention:
 * - With original post publication date:
 *     {username}_{YYYY-MM-DD}_{shortcode}[_slide-{NN}].{ext}
 *     Example: shreya.1147_2026-10-25_DfBnbDEGJSx_slide-01.jpg
 *
 * - Without original post publication date:
 *     {username}_downloaded_{YYYY-MM-DD}_{HHmmss}_{shortcode}[_slide-{NN}].{ext}
 *     Example: shreya.1147_downloaded_2026-10-29_162845_DfBnbDEGJSx_slide-01.jpg
 *
 * Security & Reliability:
 * - Path traversal prevention (strips slashes, null bytes, Windows reserved characters).
 * - Safe fallback for missing author or shortcode metadata.
 * - Zero-padded carousel slide numbering (_slide-01, _slide-02).
 * - Verified extension derivation from media type.
 * - Collision avoidance to prevent files from silently overwriting each other.
 */

export interface GenerateMediaFilenameOptions {
  /**
   * The Instagram author username/handle (e.g. "shreya.1147").
   */
  username?: string | null;

  /**
   * Post shortcode or identifier (e.g. "DfBnbDEGJSx").
   */
  shortcode?: string | null;

  /**
   * Original post publication date or timestamp (epoch seconds, milliseconds, Date, or ISO string).
   */
  takenAt?: number | string | Date | null;

  /**
   * Local download timestamp when publication date is unavailable. Defaults to current time.
   */
  downloadedAt?: number | string | Date | null;

  /**
   * 1-based slide number (e.g. 1 for slide-01) or 0-based index if specified with slideIndex.
   */
  slideNumber?: number | null;

  /**
   * 0-based slide index (e.g. 0 for slide-01, 1 for slide-02).
   */
  slideIndex?: number | null;

  /**
   * Whether this item belongs to a carousel.
   */
  isCarousel?: boolean | null;

  /**
   * Media type or MIME type ('image' | 'video' | 'image/jpeg' | 'video/mp4' | etc.)
   */
  mediaType?: 'image' | 'video' | string | null;

  /**
   * Explicit extension override without dot (e.g. "jpg", "mp4", "webp").
   */
  extension?: string | null;

  /**
   * Existing original or upstream filename to preserve known extension if mediaType is generic.
   */
  originalFilename?: string | null;
}

const WINDOWS_RESERVED_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
]);

/**
 * Sanitizes an individual filename component (e.g. username or shortcode).
 * Removes path separators, control characters, and reserved symbols.
 */
export function sanitizeComponent(raw?: string | null, fallback = 'unknown'): string {
  if (!raw || typeof raw !== 'string') {
    return fallback;
  }

  // Strip leading @ character from handles
  let clean = raw.trim().replace(/^@+/, '');

  // Strip path traversal sequences, directory separators, control characters, and special symbols
  // Allowed characters: alphanumeric, periods, underscores, and hyphens
  clean = clean.replace(/[/\\?%*:|"<>]/g, '_');
  clean = clean.replace(/[\x00-\x1f\x7f]/g, '');
  clean = clean.replace(/\.{2,}/g, '.'); // Prevent '..'
  clean = clean.replace(/_+/g, '_'); // Collapse consecutive underscores

  // Remove trailing and leading dots, dashes, underscores or spaces
  clean = clean.replace(/^[.\s_-]+|[.\s_-]+$/g, '');

  if (!clean || clean.length === 0) {
    return fallback;
  }

  // Check against Windows reserved device names
  if (WINDOWS_RESERVED_NAMES.has(clean.toUpperCase())) {
    clean = `snapora_${clean}`;
  }

  return clean;
}

/**
 * Parses and validates an input date/timestamp.
 * Returns null if the date is invalid or outside realistic boundaries (2005-2099).
 */
export function parseValidDate(input?: number | string | Date | null): Date | null {
  if (input === undefined || input === null || input === '') {
    return null;
  }

  let d: Date;
  if (input instanceof Date) {
    d = input;
  } else if (typeof input === 'number') {
    if (isNaN(input) || input <= 0) return null;
    // Distinguish epoch seconds (e.g. 1761400000) from epoch milliseconds (e.g. 1761400000000)
    d = input < 1e11 ? new Date(input * 1000) : new Date(input);
  } else if (typeof input === 'string') {
    const trimmed = input.trim();
    if (/^\d+$/.test(trimmed)) {
      const num = Number(trimmed);
      d = num < 1e11 ? new Date(num * 1000) : new Date(num);
    } else {
      d = new Date(trimmed);
    }
  } else {
    return null;
  }

  const time = d.getTime();
  if (isNaN(time)) {
    return null;
  }

  const year = d.getUTCFullYear();
  if (year < 2005 || year > 2099) {
    return null;
  }

  return d;
}

/**
 * Formats a Date object into UTC YYYY-MM-DD.
 */
export function formatPublicationDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Formats a local Date object into YYYY-MM-DD_HHmmss for download timestamps.
 */
export function formatDownloadTimestamp(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}_${hours}${minutes}${seconds}`;
}

/**
 * Derives a clean file extension from media type or original filename.
 */
export function deriveMediaExtension(
  mediaType?: 'image' | 'video' | string | null,
  originalFilename?: string | null,
  explicitExtension?: string | null
): string {
  if (explicitExtension) {
    const clean = explicitExtension.replace(/^\.+/, '').toLowerCase();
    if (['jpg', 'jpeg', 'png', 'webp', 'mp4', 'mov'].includes(clean)) {
      return clean === 'jpeg' ? 'jpg' : clean;
    }
  }

  if (mediaType) {
    const lower = mediaType.toLowerCase();
    if (lower === 'video' || lower.includes('mp4') || lower.includes('video/')) {
      return 'mp4';
    }
    if (lower.includes('webp')) {
      return 'webp';
    }
    if (lower.includes('png')) {
      return 'png';
    }
    if (lower === 'image' || lower.includes('jpeg') || lower.includes('jpg') || lower.includes('image/')) {
      return 'jpg';
    }
  }

  if (originalFilename) {
    const match = originalFilename.match(/\.([a-zA-Z0-9]+)$/);
    if (match) {
      const ext = match[1].toLowerCase();
      if (['jpg', 'jpeg', 'png', 'webp', 'mp4'].includes(ext)) {
        return ext === 'jpeg' ? 'jpg' : ext;
      }
    }
  }

  return 'jpg';
}

/**
 * Generates a canonical, descriptive filename for an Instagram media item.
 *
 * Rules:
 * 1. Username: Actual author username if available; sanitized; fallback to 'instagram_user'.
 * 2. Date:
 *    - If publication date (takenAt) is valid: {YYYY-MM-DD}
 *    - If publication date is unavailable: downloaded_{YYYY-MM-DD}_{HHmmss}
 * 3. Shortcode: Post shortcode; fallback to 'post'.
 * 4. Slide suffix: _slide-{NN} (e.g. _slide-01) for carousel items.
 * 5. Extension: Validated media extension (e.g. .jpg, .mp4).
 */
export function generateMediaFilename(options: GenerateMediaFilenameOptions): string {
  const username = sanitizeComponent(options.username, 'instagram_user');
  const shortcode = sanitizeComponent(options.shortcode, 'post');

  // Determine slide suffix for carousel items
  let slideSuffix = '';
  if (options.slideNumber !== undefined && options.slideNumber !== null) {
    const num = Math.max(1, Math.floor(options.slideNumber));
    slideSuffix = `_slide-${String(num).padStart(2, '0')}`;
  } else if (options.slideIndex !== undefined && options.slideIndex !== null) {
    const num = Math.max(1, Math.floor(options.slideIndex + 1));
    slideSuffix = `_slide-${String(num).padStart(2, '0')}`;
  } else if (options.isCarousel) {
    slideSuffix = '_slide-01';
  }

  // Derive extension
  const ext = deriveMediaExtension(options.mediaType, options.originalFilename, options.extension);

  // Date portion
  const pubDate = parseValidDate(options.takenAt);
  if (pubDate) {
    const dateStr = formatPublicationDate(pubDate);
    return `${username}_${dateStr}_${shortcode}${slideSuffix}.${ext}`;
  }

  // Fallback to local download timestamp
  const dlDate = parseValidDate(options.downloadedAt) || new Date();
  const dateStr = formatDownloadTimestamp(dlDate);
  return `${username}_downloaded_${dateStr}_${shortcode}${slideSuffix}.${ext}`;
}

/**
 * Resolves filename collisions by appending a numeric counter (_1, _2, etc.)
 * right before the file extension if the candidate filename is already in the set.
 */
export function resolveFilenameCollision(
  candidate: string,
  existingNames: Set<string> | string[]
): string {
  const set = existingNames instanceof Set ? existingNames : new Set(existingNames);
  if (!set.has(candidate)) {
    return candidate;
  }

  const lastDotIndex = candidate.lastIndexOf('.');
  const stem = lastDotIndex !== -1 ? candidate.slice(0, lastDotIndex) : candidate;
  const ext = lastDotIndex !== -1 ? candidate.slice(lastDotIndex) : '';

  let counter = 1;
  let unique = `${stem}_${counter}${ext}`;
  while (set.has(unique)) {
    counter++;
    unique = `${stem}_${counter}${ext}`;
  }

  return unique;
}

/**
 * Tracker class for maintaining unique filenames within a batch or session.
 */
export class FilenameCollisionTracker {
  private usedNames = new Set<string>();

  public getUniqueFilename(candidate: string): string {
    const unique = resolveFilenameCollision(candidate, this.usedNames);
    this.usedNames.add(unique);
    return unique;
  }

  public register(name: string): void {
    this.usedNames.add(name);
  }

  public has(name: string): boolean {
    return this.usedNames.has(name);
  }

  public clear(): void {
    this.usedNames.clear();
  }

  public get size(): number {
    return this.usedNames.size;
  }
}

/**
 * Generates descriptive ZIP archive name following:
 * Snapora_Download_YYYY-MM-DD_HHmmss.zip
 */
export function generateZipArchiveFilename(date?: Date | number | null, customPrefix?: string): string {
  const d = parseValidDate(date) || new Date();
  const ts = formatDownloadTimestamp(d);
  const prefix = customPrefix ? sanitizeComponent(customPrefix, 'Snapora_Download') : 'Snapora_Download';
  return `${prefix}_${ts}.zip`;
}
