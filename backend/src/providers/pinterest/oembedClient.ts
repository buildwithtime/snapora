import { safeHttpsRequest } from '../../utils/ssrfClient.js';
import { parseRetryAfter } from '../../utils/errors.js';
import { config } from '../../config/index.js';
import { PinterestOEmbedResponse } from './types.js';

export const PINTEREST_OEMBED_ENDPOINT = 'https://www.pinterest.com/oembed.json';
export const PINTEREST_OEMBED_MAX_RESPONSE_BYTES = 524288; // 512KB

export interface PinterestOEmbedOptions {
  timeoutMs?: number;
  enabled?: boolean;
  signal?: AbortSignal;
}

export class PinterestOEmbedClient {
  private readonly enabled: boolean;

  constructor(options?: PinterestOEmbedOptions) {
    this.enabled = options?.enabled !== undefined ? options.enabled : (config.pinterestOembedEnabled ?? true);
  }

  /**
   * Fetches official oEmbed metadata for a canonical Pinterest Pin URL.
   */
  async getPinMetadata(
    canonicalUrl: string,
    expectedPinId?: string,
    options?: PinterestOEmbedOptions
  ): Promise<PinterestOEmbedResponse> {
    const isEnabled = options?.enabled !== undefined ? options.enabled : this.enabled;
    if (!isEnabled) {
      const err = new Error('PINTEREST_OEMBED_DISABLED: Pinterest oEmbed resolution is disabled by server configuration');
      (err as any).code = 'PINTEREST_OEMBED_DISABLED';
      throw err;
    }

    const timeoutMs = options?.timeoutMs || config.resolverTimeoutMs || 10000;
    const requestUrl = `${PINTEREST_OEMBED_ENDPOINT}?url=${encodeURIComponent(canonicalUrl)}`;

    let safeResponse;
    try {
      safeResponse = await safeHttpsRequest(requestUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Snapora-Universal-Media-Workspace/1.0',
          'Accept': 'application/json'
        },
        timeoutMs,
        signal: options?.signal,
        maxResponseSizeBytes: PINTEREST_OEMBED_MAX_RESPONSE_BYTES,
        allowedHostsValidator: (h) => h === 'www.pinterest.com' || h === 'pinterest.com'
      });
    } catch (netErr: any) {
      if (netErr.code === 'TIMEOUT') {
        const err = new Error(`PINTEREST_TIMEOUT: Request to Pinterest oEmbed endpoint timed out after ${timeoutMs}ms`);
        (err as any).code = 'PINTEREST_TIMEOUT';
        throw err;
      }
      if (netErr.code === 'SSRF_BLOCKED') {
        throw netErr;
      }
      const err = new Error(`PINTEREST_UNAVAILABLE: Network error connecting to Pinterest oEmbed: ${netErr.message}`);
      (err as any).code = 'PINTEREST_UNAVAILABLE';
      throw err;
    }

    const statusCode = safeResponse.statusCode;

    // Handle Rate Limiting (HTTP 429)
    if (statusCode === 429) {
      safeResponse.stream.destroy();
      const retryAfter = parseRetryAfter(safeResponse.headers['retry-after']);
      const err = new Error('PINTEREST_RATE_LIMITED: Pinterest oEmbed rate limit encountered');
      (err as any).code = 'PINTEREST_RATE_LIMITED';
      if (retryAfter) {
        (err as any).retryAfterSeconds = retryAfter;
      }
      throw err;
    }

    // Handle Not Found / Invalid URL (HTTP 400 / 404)
    if (statusCode === 400 || statusCode === 404) {
      safeResponse.stream.destroy();
      const err = new Error(`PIN_NOT_FOUND: Pinterest Pin was not found or is private (HTTP ${statusCode})`);
      (err as any).code = 'PIN_NOT_FOUND';
      throw err;
    }

    // Handle Upstream Service Errors (5xx)
    if (statusCode >= 500) {
      safeResponse.stream.destroy();
      const err = new Error(`PINTEREST_UNAVAILABLE: Pinterest oEmbed service returned HTTP status ${statusCode}`);
      (err as any).code = 'PINTEREST_UNAVAILABLE';
      throw err;
    }

    if (statusCode !== 200) {
      safeResponse.stream.destroy();
      const err = new Error(`PINTEREST_INVALID_RESPONSE: Unexpected HTTP response ${statusCode} from Pinterest oEmbed`);
      (err as any).code = 'PINTEREST_INVALID_RESPONSE';
      throw err;
    }

    // Verify Content-Type
    const contentType = safeResponse.headers['content-type'];
    if (!contentType || !contentType.toLowerCase().includes('application/json')) {
      safeResponse.stream.destroy();
      const err = new Error(`PINTEREST_INVALID_RESPONSE: Expected application/json from Pinterest oEmbed, received '${contentType}'`);
      (err as any).code = 'PINTEREST_INVALID_RESPONSE';
      throw err;
    }

    // Read full JSON response body
    const chunks: Buffer[] = [];
    let totalBytes = 0;

    await new Promise<void>((resolve, reject) => {
      safeResponse.stream.on('data', (chunk: Buffer) => {
        totalBytes += chunk.length;
        if (totalBytes > PINTEREST_OEMBED_MAX_RESPONSE_BYTES) {
          safeResponse.stream.destroy();
          const err = new Error('FILE_TOO_LARGE: Pinterest oEmbed response exceeded size limit');
          (err as any).code = 'FILE_TOO_LARGE';
          return reject(err);
        }
        chunks.push(chunk);
      });
      safeResponse.stream.on('end', () => resolve());
      safeResponse.stream.on('error', (err) => reject(err));
    });

    const responseBody = Buffer.concat(chunks).toString('utf8');

    let parsed: any;
    try {
      parsed = JSON.parse(responseBody);
    } catch {
      const err = new Error('PINTEREST_INVALID_RESPONSE: Malformed JSON received from Pinterest oEmbed');
      (err as any).code = 'PINTEREST_INVALID_RESPONSE';
      throw err;
    }

    if (!parsed || typeof parsed !== 'object') {
      const err = new Error('PINTEREST_INVALID_RESPONSE: Empty or invalid JSON object returned by Pinterest oEmbed');
      (err as any).code = 'PINTEREST_INVALID_RESPONSE';
      throw err;
    }

    // Validate Pin Identity if expectedPinId is provided
    if (expectedPinId) {
      let matchesIdentity = false;

      // Check if html contains id={expectedPinId}
      if (typeof parsed.html === 'string' && parsed.html.includes(`id=${expectedPinId}`)) {
        matchesIdentity = true;
      }
      // Or check if canonical URL or thumbnail matches
      if (!matchesIdentity && typeof parsed.html === 'string') {
        const idMatch = parsed.html.match(/id=(\d+)/);
        if (idMatch && idMatch[1] === expectedPinId) {
          matchesIdentity = true;
        }
      }

      // If html was returned but had a mismatched Pin ID, reject as identity mismatch
      if (typeof parsed.html === 'string' && parsed.html.includes('id=') && !matchesIdentity) {
        const err = new Error(`PINTEREST_INVALID_RESPONSE: Returned oEmbed metadata does not match requested Pin ID '${expectedPinId}'`);
        (err as any).code = 'PINTEREST_INVALID_RESPONSE';
        throw err;
      }
    }

    return parsed as PinterestOEmbedResponse;
  }
}

export const pinterestOEmbedClient = new PinterestOEmbedClient();
