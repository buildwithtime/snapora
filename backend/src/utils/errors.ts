export type ErrorCode =
  | 'PRIVATE_ACCOUNT'
  | 'CONTENT_PRIVATE'
  | 'CONTENT_UNAVAILABLE'
  | 'PROVIDER_NOT_CONFIGURED'
  | 'AUTHENTICATION_ERROR'
  | 'AUTHENTICATION_REQUIRED'
  | 'CONFIGURATION_REQUIRED'
  | 'UNSUPPORTED_RETRIEVAL_METHOD'
  | 'UNSUPPORTED_URL'
  | 'INVALID_URL'
  | 'RATE_LIMITED'
  | 'PROVIDER_ERROR'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'SSRF_BLOCKED'
  | 'MEDIA_VALIDATION_FAILED'
  | 'FILE_TOO_LARGE'
  | 'PERMANENTLY_INACCESSIBLE'
  | 'INVALID_REQUEST'
  | 'HTTP_403_FORBIDDEN'
  | 'HTTP_429_RATE_LIMITED'
  | 'POST_NOT_FOUND'
  | 'EXPIRED_MEDIA_URL'
  | 'LOGIN_WALL_ENCOUNTERED'
  | 'METADATA_NOT_FOUND'
  | 'PAGE_FETCH_FAILED'
  | 'MEDIA_URL_EXPIRED'
  | 'CDN_REQUEST_FAILED'
  | 'STREAM_INTERRUPTED';

export interface ApiErrorResponse {
  ok: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: string;
    retryAfterSeconds?: number;
  };
}

export function createErrorResponse(
  code: ErrorCode,
  message: string,
  details?: string,
  retryAfterSeconds?: number
): ApiErrorResponse {
  return {
    ok: false,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
      ...(typeof retryAfterSeconds === 'number' && retryAfterSeconds > 0 ? { retryAfterSeconds } : {})
    }
  };
}

/**
 * Parses the HTTP Retry-After header supporting both delta-seconds and HTTP-date formats.
 * Bounded by maxSeconds to prevent unbounded waiting (RFC 7231 / RFC 9110).
 */
export function parseRetryAfter(
  headerValue?: string | string[] | null,
  maxSeconds = 3600
): number | null {
  if (!headerValue) return null;
  const raw = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (!raw || typeof raw !== 'string') return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  // 1. Delta-seconds format (positive decimal integer)
  if (/^\d+$/.test(trimmed)) {
    const seconds = parseInt(trimmed, 10);
    if (!isNaN(seconds) && seconds >= 0) {
      return Math.min(seconds, maxSeconds);
    }
    return null;
  }

  // If it does not contain alphabetic characters, it cannot be an HTTP-date
  if (!/[a-zA-Z]/.test(trimmed)) {
    return null;
  }

  // 2. HTTP-date format (IMF-fixdate / RFC 1123 / RFC 850)
  const parsedDate = Date.parse(trimmed);
  if (!isNaN(parsedDate)) {
    const now = Date.now();
    const diffSeconds = Math.ceil((parsedDate - now) / 1000);
    if (diffSeconds > 0) {
      return Math.min(diffSeconds, maxSeconds);
    }
    return 0; // Date in the past
  }

  return null;
}

/**
 * Generates an informative, user-friendly rate-limit message incorporating
 * parsed retry-after durations where available.
 */
export function formatRateLimitMessage(retryAfterSeconds: number | null): string {
  if (retryAfterSeconds !== null && retryAfterSeconds > 0) {
    if (retryAfterSeconds < 60) {
      return `Instagram is temporarily limiting requests. Please try again in ${retryAfterSeconds} second${retryAfterSeconds === 1 ? '' : 's'}.`;
    }
    const minutes = Math.ceil(retryAfterSeconds / 60);
    return `Instagram is temporarily limiting requests. Please try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
  }
  return 'Instagram is temporarily limiting requests. Please try again later.';
}
