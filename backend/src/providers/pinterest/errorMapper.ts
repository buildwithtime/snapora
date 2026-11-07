import { ErrorCode, parseRetryAfter } from '../../utils/errors.js';

export interface ClassifiedPinterestError {
  code: ErrorCode;
  message: string;
  details?: string;
  retryAfterSeconds?: number;
}

/**
 * Formats a user-friendly rate limit message tailored to Pinterest.
 */
export function formatPinterestRateLimitMessage(retrySeconds?: number | null): string {
  const prefix = 'Pinterest is temporarily limiting requests';
  if (retrySeconds && retrySeconds > 0) {
    if (retrySeconds < 60) {
      return `${prefix}. Please try again in ${retrySeconds} second${retrySeconds === 1 ? '' : 's'}.`;
    }
    const minutes = Math.ceil(retrySeconds / 60);
    return `${prefix}. Please try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
  }
  return `${prefix}. Please try again later.`;
}

/**
 * Maps Pinterest oEmbed and network errors to standardized Snapora ErrorCode.
 */
export function mapPinterestOEmbedError(
  err: any,
  statusCode?: number,
  headers?: Record<string, string | string[] | undefined>
): ClassifiedPinterestError {
  const retryHeader = headers?.['retry-after'];
  const retrySeconds = err?.retryAfterSeconds ?? parseRetryAfter(retryHeader);

  // 1. Timeout
  if (
    err?.code === 'PINTEREST_TIMEOUT' ||
    err?.code === 'TIMEOUT' ||
    err?.name === 'AbortError' ||
    (typeof err?.message === 'string' && err.message.toLowerCase().includes('timeout'))
  ) {
    return {
      code: 'PINTEREST_TIMEOUT',
      message: 'Pinterest oEmbed request timed out'
    };
  }

  // 2. Disabled via configuration
  if (err?.code === 'PINTEREST_OEMBED_DISABLED') {
    return {
      code: 'PINTEREST_OEMBED_DISABLED',
      message: 'Pinterest oEmbed provider is disabled via configuration'
    };
  }

  // 3. Not Found (404)
  if (statusCode === 404 || err?.code === 'PIN_NOT_FOUND') {
    return {
      code: 'PIN_NOT_FOUND',
      message: 'The requested Pin does not exist, was deleted, or is set to private/secret'
    };
  }

  // 4. Rate Limited (429)
  if (statusCode === 429 || err?.code === 'PINTEREST_RATE_LIMITED') {
    return {
      code: 'PINTEREST_RATE_LIMITED',
      message: formatPinterestRateLimitMessage(retrySeconds),
      ...(retrySeconds && retrySeconds > 0 ? { retryAfterSeconds: retrySeconds } : {})
    };
  }

  // 5. Invalid / Malformed Response (400, 422, JSON parse error, Zod validation failure)
  if (
    statusCode === 400 ||
    statusCode === 422 ||
    err?.code === 'PINTEREST_INVALID_RESPONSE' ||
    err?.name === 'ZodError'
  ) {
    return {
      code: 'PINTEREST_INVALID_RESPONSE',
      message: 'Pinterest returned an invalid or malformed response',
      details: err instanceof Error ? err.message : undefined
    };
  }

  // 6. Redirect rejection or SSRF
  if (
    err?.code === 'PINTEREST_REDIRECT_REJECTED' ||
    err?.code === 'SSRF_DETECTED' ||
    err?.code === 'SSRF_BLOCKED'
  ) {
    return {
      code: err.code === 'SSRF_BLOCKED' ? 'SSRF_DETECTED' : err.code,
      message: err.message || 'Pinterest shortlink redirect target was rejected for security policy',
      details: err?.details
    };
  }

  // 7. Invalid Pin ID
  if (err?.code === 'INVALID_PIN_ID') {
    return {
      code: 'INVALID_PIN_ID',
      message: err.message || 'Invalid or malformed Pinterest Pin ID'
    };
  }

  // 8. General Upstream / Server Error
  const rawMsg = err instanceof Error ? err.message : typeof err === 'string' ? err : 'Unknown upstream error';
  return {
    code: 'PINTEREST_UNAVAILABLE',
    message: 'Failed to retrieve metadata from Pinterest oEmbed service',
    details: rawMsg
  };
}
