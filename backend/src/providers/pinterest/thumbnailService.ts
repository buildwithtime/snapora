import { safeHttpsRequest } from '../../utils/ssrfClient.js';
import { validateMediaBytes } from '../../utils/mediaValidator.js';
import { parseImageDimensions } from '../youtube/thumbnailService.js';
import { PinterestThumbnailItem } from './types.js';

export const APPROVED_PINTEREST_THUMBNAIL_HOSTS = new Set([
  'i.pinimg.com'
]);

export interface ThumbnailVerificationResult {
  width?: number;
  height?: number;
  verified: boolean;
}

/**
 * Validates that a Pinterest thumbnail URL uses HTTPS and targets an approved CDN host.
 */
export function isValidPinterestThumbnailUrl(urlStr?: string | null): boolean {
  if (!urlStr || typeof urlStr !== 'string') {
    return false;
  }
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'https:') {
      return false;
    }
    const hostname = parsed.hostname.toLowerCase().replace(/\.+$/, '');
    return APPROVED_PINTEREST_THUMBNAIL_HOSTS.has(hostname);
  } catch {
    return false;
  }
}

export class PinterestThumbnailService {
  /**
   * Verifies the 236x thumbnail image by requesting the first chunk of binary headers (up to 8KB).
   * Validates MIME signatures and extracts verified pixel dimensions without decoding full images.
   * If verification fails or is unreachable, falls back cleanly to unverified discovered dimensions.
   */
  async verifyThumbnail(
    thumbnailUrl: string,
    discoveredDimensions?: { width?: number; height?: number }
  ): Promise<ThumbnailVerificationResult> {
    if (!isValidPinterestThumbnailUrl(thumbnailUrl)) {
      return {
        width: discoveredDimensions?.width,
        height: discoveredDimensions?.height,
        verified: false
      };
    }

    try {
      const safeResponse = await safeHttpsRequest(thumbnailUrl, {
        method: 'GET',
        headers: { Range: 'bytes=0-8191' },
        timeoutMs: 5000,
        allowedHostsValidator: (h) => APPROVED_PINTEREST_THUMBNAIL_HOSTS.has(h)
      });

      if (safeResponse.statusCode !== 200 && safeResponse.statusCode !== 206) {
        safeResponse.stream.destroy();
        return {
          width: discoveredDimensions?.width,
          height: discoveredDimensions?.height,
          verified: false
        };
      }

      // Check Content-Type header
      const contentType = safeResponse.headers['content-type'];
      if (
        contentType &&
        !contentType.startsWith('image/jpeg') &&
        !contentType.startsWith('image/png') &&
        !contentType.startsWith('image/webp')
      ) {
        safeResponse.stream.destroy();
        return {
          width: discoveredDimensions?.width,
          height: discoveredDimensions?.height,
          verified: false
        };
      }

      // Read up to 8KB for header inspection
      const chunks: Buffer[] = [];
      let totalBytes = 0;

      await new Promise<void>((resolve) => {
        safeResponse.stream.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
          totalBytes += chunk.length;
          if (totalBytes >= 8192) {
            safeResponse.stream.destroy();
            resolve();
          }
        });
        safeResponse.stream.on('end', () => resolve());
        safeResponse.stream.on('error', () => resolve());
      });

      const headerBuf = Buffer.concat(chunks);
      if (headerBuf.length < 12) {
        return {
          width: discoveredDimensions?.width,
          height: discoveredDimensions?.height,
          verified: false
        };
      }

      // Validate magic bytes
      const magicCheck = validateMediaBytes(headerBuf);
      if (!magicCheck.valid) {
        return {
          width: discoveredDimensions?.width,
          height: discoveredDimensions?.height,
          verified: false
        };
      }

      // Parse image dimensions from binary markers
      const parsedDimensions = parseImageDimensions(headerBuf);
      if (parsedDimensions && parsedDimensions.width > 0 && parsedDimensions.height > 0) {
        return {
          width: parsedDimensions.width,
          height: parsedDimensions.height,
          verified: true
        };
      }

      return {
        width: discoveredDimensions?.width,
        height: discoveredDimensions?.height,
        verified: false
      };
    } catch {
      // Network or range request failure: gracefully return discovered dimensions unverified
      return {
        width: discoveredDimensions?.width,
        height: discoveredDimensions?.height,
        verified: false
      };
    }
  }

  /**
   * Constructs the verified 236x thumbnail item array.
   * Explicitly avoids arbitrary CDN variant expansion or high-resolution guessing.
   */
  async buildThumbnailItems(
    thumbnailUrl?: string | null,
    discoveredDimensions?: { width?: number; height?: number }
  ): Promise<PinterestThumbnailItem[]> {
    if (!thumbnailUrl || !isValidPinterestThumbnailUrl(thumbnailUrl)) {
      return [];
    }

    const verification = await this.verifyThumbnail(thumbnailUrl, discoveredDimensions);

    return [
      {
        resolution: '236x',
        url: thumbnailUrl,
        width: verification.width,
        height: verification.height,
        verified: verification.verified
      }
    ];
  }
}

export const pinterestThumbnailService = new PinterestThumbnailService();
