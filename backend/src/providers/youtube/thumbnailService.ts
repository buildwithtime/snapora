import { YouTubeThumbnailItem, YouTubeThumbnailResolution } from './types.js';
import { safeHttpsRequest } from '../../utils/ssrfClient.js';
import { validateMediaBytes } from '../../utils/mediaValidator.js';

export interface ImageDimensionResult {
  width: number;
  height: number;
  format: 'jpeg' | 'webp' | 'png';
}

export const YOUTUBE_THUMBNAIL_RESOLUTIONS: ReadonlyArray<YouTubeThumbnailResolution> = [
  'maxresdefault',
  'sddefault',
  'hqdefault',
  'mqdefault',
  'default'
];

export const APPROVED_YOUTUBE_THUMBNAIL_HOSTS = new Set([
  'i.ytimg.com',
  'img.youtube.com'
]);

/**
 * Validates that a thumbnail URL uses HTTPS and points to an approved YouTube CDN host.
 */
export function isValidThumbnailUrl(urlStr?: string | null): boolean {
  if (!urlStr || typeof urlStr !== 'string') {
    return false;
  }
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'https:') {
      return false;
    }
    const hostname = parsed.hostname.toLowerCase().replace(/\.+$/, '');
    return APPROVED_YOUTUBE_THUMBNAIL_HOSTS.has(hostname);
  } catch {
    return false;
  }
}

export const YOUTUBE_DEFAULT_DIMENSIONS: Record<YouTubeThumbnailResolution, { width: number; height: number }> = {
  maxresdefault: { width: 1280, height: 720 },
  sddefault: { width: 640, height: 480 },
  hqdefault: { width: 480, height: 360 },
  mqdefault: { width: 320, height: 180 },
  default: { width: 120, height: 90 }
};

/**
 * Parses binary image headers to extract genuine width and height without third-party image decoders.
 * Supports JPEG (SOF0, SOF2 markers), WebP (lossy VP8, lossless VP8L, extended VP8X), and PNG (IHDR).
 */
export function parseImageDimensions(buf: Buffer): ImageDimensionResult | null {
  if (!buf || buf.length < 12) {
    return null;
  }

  // 1. JPEG: SOI marker 0xFF 0xD8 0xFF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    let offset = 2;
    while (offset < buf.length) {
      if (buf[offset] !== 0xff) {
        offset++;
        continue;
      }
      while (buf[offset] === 0xff && offset < buf.length) {
        offset++;
      }
      if (offset >= buf.length) break;

      const marker = buf[offset++];
      // EOI (End of Image) or SOS (Start of Scan) - headers end before SOS
      if (marker === 0xd9 || marker === 0xda) break;
      // Standalone markers without length
      if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) continue;

      if (offset + 2 > buf.length) break;
      const segmentLength = buf.readUInt16BE(offset);

      // Start of Frame markers containing image dimensions
      const isSof =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf);

      if (isSof && offset + 7 <= buf.length) {
        const height = buf.readUInt16BE(offset + 3);
        const width = buf.readUInt16BE(offset + 5);
        if (width > 0 && height > 0) {
          return { width, height, format: 'jpeg' };
        }
      }

      offset += segmentLength;
    }
  }

  // 2. WebP: RIFF at 0..3 and WEBP at 8..11
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50 &&
    buf.length >= 16
  ) {
    const chunkType = buf.subarray(12, 16).toString('latin1');

    // Simple lossy VP8
    if (chunkType === 'VP8 ' && buf.length >= 30) {
      // Check start code: 0x9D 0x01 0x2A
      if (buf[23] === 0x9d && buf[24] === 0x01 && buf[25] === 0x2a) {
        const width = (buf[26] | (buf[27] << 8)) & 0x3fff;
        const height = (buf[28] | (buf[29] << 8)) & 0x3fff;
        if (width > 0 && height > 0) {
          return { width, height, format: 'webp' };
        }
      }
    }
    // Lossless VP8L
    else if (chunkType === 'VP8L' && buf.length >= 25) {
      if (buf[20] === 0x2f) {
        const b0 = buf[21], b1 = buf[22], b2 = buf[23], b3 = buf[24];
        const width = 1 + (((b1 & 0x3f) << 8) | b0);
        const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
        if (width > 0 && height > 0) {
          return { width, height, format: 'webp' };
        }
      }
    }
    // Extended VP8X
    else if (chunkType === 'VP8X' && buf.length >= 30) {
      const width = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
      const height = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
      if (width > 0 && height > 0) {
        return { width, height, format: 'webp' };
      }
    }
  }

  // 3. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf.length >= 24 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf.subarray(12, 16).toString('latin1') === 'IHDR'
  ) {
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    if (width > 0 && height > 0) {
      return { width, height, format: 'png' };
    }
  }

  return null;
}

/**
 * Detects whether a thumbnail response is YouTube's 120x90 transparent/grey placeholder
 * returned when higher resolutions (like maxresdefault or sddefault) do not exist.
 */
export function isPlaceholderThumbnail(
  variant: YouTubeThumbnailResolution,
  width: number,
  height: number
): boolean {
  // Only high-resolution variants can be placeholders. If maxresdefault, sddefault, or hqdefault
  // resolves with 120x90 dimensions, it is definitively a placeholder.
  if (variant === 'maxresdefault' || variant === 'sddefault' || variant === 'hqdefault') {
    return width === 120 && height === 90;
  }
  return false;
}

export class YouTubeThumbnailService {
  /**
   * Generates the canonical URL for a thumbnail resolution on YouTube's CDN.
   */
  getThumbnailUrl(
    videoId: string,
    variant: YouTubeThumbnailResolution = 'hqdefault',
    cdnHost = 'i.ytimg.com'
  ): string {
    const cleanId = encodeURIComponent(videoId.trim());
    return `https://${cdnHost}/vi/${cleanId}/${variant}.jpg`;
  }

  /**
   * Validates a raw image buffer and verifies it is not an error page or a 120x90 placeholder.
   */
  validateThumbnailBuffer(
    buffer: Buffer,
    expectedVariant: YouTubeThumbnailResolution
  ): { valid: boolean; dimensions?: ImageDimensionResult; error?: string } {
    if (!buffer || buffer.length < 12) {
      return { valid: false, error: 'Thumbnail buffer is empty or truncated' };
    }

    const byteCheck = validateMediaBytes(buffer);
    if (!byteCheck.valid) {
      return { valid: false, error: byteCheck.error || 'Invalid image signature' };
    }

    const dims = parseImageDimensions(buffer);
    if (!dims) {
      return { valid: false, error: 'Could not extract image dimensions from binary header' };
    }

    if (isPlaceholderThumbnail(expectedVariant, dims.width, dims.height)) {
      return {
        valid: false,
        error: `Detected 120x90 placeholder thumbnail for variant '${expectedVariant}'. Resolution does not exist.`
      };
    }

    return { valid: true, dimensions: dims };
  }

  /**
   * Probes a specific thumbnail resolution on YouTube's CDN using SSRF-safe connection.
   */
  async probeThumbnailVariant(
    videoId: string,
    variant: YouTubeThumbnailResolution,
    signal?: AbortSignal
  ): Promise<YouTubeThumbnailItem | null> {
    const url = this.getThumbnailUrl(videoId, variant);
    if (!isValidThumbnailUrl(url)) return null;

    try {
      const response = await safeHttpsRequest(url, {
        method: 'GET',
        headers: {
          Accept: 'image/jpeg,image/webp,image/*,*/*',
          'User-Agent': 'Snapora/0.1.0'
        },
        timeoutMs: 5000,
        maxResponseSizeBytes: 5242880, // 5MB max for thumbnail probe
        signal,
        allowedHostsValidator: (hostname) => APPROVED_YOUTUBE_THUMBNAIL_HOSTS.has(hostname)
      });

      if (response.statusCode !== 200) {
        response.stream.destroy();
        return null;
      }

      // Read initial chunk (up to 16KB) to inspect magic bytes and dimensions
      const stream = response.stream;
      const chunks: Buffer[] = [];
      let totalBytes = 0;

      await new Promise<void>((resolve, reject) => {
        const onData = (chunk: Buffer) => {
          chunks.push(chunk);
          totalBytes += chunk.length;
          // 16KB is more than enough for image headers and dimensions
          if (totalBytes >= 16384 || stream.readableEnded) {
            stream.pause();
            cleanup();
            resolve();
          }
        };
        const onEnd = () => {
          cleanup();
          resolve();
        };
        const onError = (err: Error) => {
          cleanup();
          reject(err);
        };
        const cleanup = () => {
          stream.removeListener('data', onData);
          stream.removeListener('end', onEnd);
          stream.removeListener('error', onError);
        };

        stream.on('data', onData);
        stream.on('end', onEnd);
        stream.on('error', onError);
      });

      // Cleanup stream
      stream.destroy();

      const buffer = Buffer.concat(chunks);
      const validation = this.validateThumbnailBuffer(buffer, variant);

      if (!validation.valid || !validation.dimensions) {
        return null;
      }

      return {
        resolution: variant,
        url,
        width: validation.dimensions.width,
        height: validation.dimensions.height,
        verified: true
      };
    } catch {
      return null;
    }
  }

  /**
   * Discovers and structures available thumbnail variants for a video.
   * If Data API provides thumbnail information, uses that metadata directly.
   * Otherwise, generates verified or canonical variant records in descending resolution order.
   */
  async discoverThumbnails(
    videoId: string,
    dataApiThumbnails?: Record<string, { url?: string; width?: number; height?: number }>,
    options?: { probeLive?: boolean; signal?: AbortSignal }
  ): Promise<YouTubeThumbnailItem[]> {
    const results: YouTubeThumbnailItem[] = [];

    // Case 1: Data API metadata available
    if (dataApiThumbnails && typeof dataApiThumbnails === 'object') {
      const mapping: Array<[string, YouTubeThumbnailResolution]> = [
        ['maxres', 'maxresdefault'],
        ['standard', 'sddefault'],
        ['high', 'hqdefault'],
        ['medium', 'mqdefault'],
        ['default', 'default']
      ];

      for (const [apiKey, variant] of mapping) {
        const item = dataApiThumbnails[apiKey];
        if (item && item.url && isValidThumbnailUrl(item.url)) {
          const dims = YOUTUBE_DEFAULT_DIMENSIONS[variant];
          results.push({
            resolution: variant,
            url: item.url,
            width: item.width || dims.width,
            height: item.height || dims.height,
            verified: false
          });
        }
      }

      if (results.length > 0) {
        return results;
      }
    }

    // Case 2: Live probing requested
    if (options?.probeLive) {
      for (const variant of YOUTUBE_THUMBNAIL_RESOLUTIONS) {
        const probed = await this.probeThumbnailVariant(videoId, variant, options.signal);
        if (probed) {
          results.push(probed);
        }
      }

      if (results.length > 0) {
        return results;
      }
    }

    // Case 3: Controlled default discovery without live network probing overhead
    // Standard YouTube videos always support hqdefault (480x360), mqdefault (320x180), and default (120x90).
    // Do not assume maxresdefault exists without verification.
    for (const variant of ['hqdefault', 'mqdefault', 'default'] as YouTubeThumbnailResolution[]) {
      const dims = YOUTUBE_DEFAULT_DIMENSIONS[variant];
      results.push({
        resolution: variant,
        url: this.getThumbnailUrl(videoId, variant),
        width: dims.width,
        height: dims.height,
        verified: false
      });
    }

    return results;
  }
}

export const youTubeThumbnailService = new YouTubeThumbnailService();
