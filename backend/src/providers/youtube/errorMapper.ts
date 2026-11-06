import { ErrorCode, parseRetryAfter } from '../../utils/errors.js';

export interface ClassifiedYouTubeError {
  code: ErrorCode;
  message: string;
  details?: string;
  retryAfterSeconds?: number;
}

/**
 * Sanitizes messages and errors to guarantee that sensitive credentials
 * (like Google API keys) are never logged, thrown, or sent to client responses.
 */
export function redactApiKey(text?: string, keyToRedact?: string): string {
  if (!text) return '';
  let sanitized = text;
  if (keyToRedact && keyToRedact.trim()) {
    sanitized = sanitized.split(keyToRedact.trim()).join('[REDACTED_API_KEY]');
  }
  // Generic pattern for Google API key in URLs, query strings, or error text: AIza...
  sanitized = sanitized.replace(/AIza[0-9A-Za-z-_]{30,40}/g, '[REDACTED_API_KEY]');
  return sanitized;
}

/**
 * Formats a user-friendly rate limit message tailored to YouTube.
 */
export function formatYouTubeRateLimitMessage(retrySeconds?: number | null): string {
  const prefix = 'YouTube is temporarily limiting requests';
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
 * Maps YouTube Data API v3 error responses to standardized Snapora ErrorCode.
 */
export function mapDataApiError(
  err: any,
  statusCode?: number,
  apiKey?: string,
  headers?: Record<string, string | string[] | undefined>
): ClassifiedYouTubeError {
  const retryHeader = headers?.['retry-after'];
  const retrySeconds = parseRetryAfter(retryHeader);

  // Check for timeout errors
  if (err?.code === 'TIMEOUT' || (typeof err?.message === 'string' && err.message.includes('TIMEOUT'))) {
    return {
      code: 'UPSTREAM_TIMEOUT',
      message: 'YouTube Data API request timed out'
    };
  }

  // Parse Google error payload if present
  let googleReason = '';
  let googleMessage = '';
  if (err?.error?.errors && Array.isArray(err.error.errors) && err.error.errors.length > 0) {
    googleReason = err.error.errors[0]?.reason || '';
    googleMessage = err.error.errors[0]?.message || '';
  } else if (err?.error?.message) {
    googleMessage = err.error.message;
  }

  // 1. Quota Exhaustion
  if (
    googleReason === 'quotaExceeded' ||
    googleReason === 'dailyLimitExceeded' ||
    googleReason === 'rateLimitExceeded' ||
    googleMessage.toLowerCase().includes('quota')
  ) {
    return {
      code: googleReason === 'dailyLimitExceeded' ? 'DAILY_LIMIT_EXCEEDED' : 'QUOTA_EXCEEDED',
      message: 'YouTube Data API quota has been exceeded for the configured project',
      details: redactApiKey(googleMessage, apiKey)
    };
  }

  // 2. Invalid API Key
  if (
    googleReason === 'keyInvalid' ||
    (googleReason === 'badRequest' && googleMessage.toLowerCase().includes('api key')) ||
    googleMessage.toLowerCase().includes('api key not valid')
  ) {
    return {
      code: 'INVALID_API_KEY',
      message: 'The configured YOUTUBE_API_KEY is invalid or expired. Check your Google Cloud credentials.',
      details: 'Operational configuration error: Google reported the API key is not valid.'
    };
  }

  // 3. API Disabled / Access Not Configured
  if (
    googleReason === 'accessNotConfigured' ||
    googleMessage.toLowerCase().includes('has not been used in project') ||
    googleMessage.toLowerCase().includes('it is disabled')
  ) {
    return {
      code: 'API_NOT_ENABLED',
      message: 'YouTube Data API v3 is not enabled in the Google Cloud Console for this API key project.',
      details: 'Operational configuration error: Enable YouTube Data API v3 in Google Cloud Console.'
    };
  }

  // 4. Rate Limited / 429
  if (statusCode === 429 || googleReason === 'userRateLimitExceeded') {
    return {
      code: 'UPSTREAM_RATE_LIMITED',
      message: formatYouTubeRateLimitMessage(retrySeconds),
      ...(retrySeconds && retrySeconds > 0 ? { retryAfterSeconds: retrySeconds } : {})
    };
  }

  // 5. Video Not Found / Deleted
  if (statusCode === 404 || googleReason === 'videoNotFound') {
    return {
      code: 'VIDEO_NOT_FOUND',
      message: 'The requested YouTube video does not exist or has been deleted'
    };
  }

  // 6. Private Video / Forbidden
  if (statusCode === 403 && (googleReason === 'forbidden' || googleReason === 'privateVideo')) {
    return {
      code: 'PRIVATE_VIDEO',
      message: 'This YouTube video is private or restricted and cannot be resolved'
    };
  }

  // 7. General Server / Network Error
  const rawMsg = err instanceof Error ? err.message : typeof err === 'string' ? err : 'Unknown upstream error';
  return {
    code: 'PROVIDER_UNAVAILABLE',
    message: 'Failed to communicate with YouTube Data API',
    details: redactApiKey(rawMsg, apiKey)
  };
}

/**
 * Maps YouTube oEmbed HTTP responses or errors to standardized Snapora ErrorCode.
 */
export function mapOEmbedError(
  err: any,
  statusCode?: number,
  headers?: Record<string, string | string[] | undefined>
): ClassifiedYouTubeError {
  const retryHeader = headers?.['retry-after'];
  const retrySeconds = parseRetryAfter(retryHeader);

  if (err?.code === 'TIMEOUT' || (typeof err?.message === 'string' && err.message.includes('TIMEOUT'))) {
    return {
      code: 'UPSTREAM_TIMEOUT',
      message: 'YouTube oEmbed service request timed out'
    };
  }

  if (statusCode === 404) {
    return {
      code: 'VIDEO_NOT_FOUND',
      message: 'The requested YouTube video does not exist or has been removed'
    };
  }

  if (statusCode === 401 || statusCode === 403) {
    return {
      code: 'PRIVATE_VIDEO',
      message: 'This YouTube video is private, age-restricted, or embedding has been disabled by the creator'
    };
  }

  if (statusCode === 429) {
    return {
      code: 'UPSTREAM_RATE_LIMITED',
      message: formatYouTubeRateLimitMessage(retrySeconds),
      ...(retrySeconds && retrySeconds > 0 ? { retryAfterSeconds: retrySeconds } : {})
    };
  }

  if (err?.name === 'ZodError' || err?.code === 'INVALID_RESPONSE') {
    return {
      code: 'INVALID_RESPONSE',
      message: 'YouTube oEmbed returned an unexpected or malformed payload structure'
    };
  }

  const rawMsg = err instanceof Error ? err.message : typeof err === 'string' ? err : 'Upstream error';
  return {
    code: 'PROVIDER_UNAVAILABLE',
    message: 'Failed to retrieve metadata from YouTube oEmbed service',
    details: rawMsg
  };
}

/**
 * Determines whether a Data API error is eligible for anonymous oEmbed fallback.
 * Only QUOTA_EXCEEDED and DAILY_LIMIT_EXCEEDED are approved for automatic fallback.
 * Operational errors (INVALID_API_KEY, API_NOT_ENABLED) and content restrictions
 * (PRIVATE_VIDEO, VIDEO_NOT_FOUND) must NOT fall back silently!
 */
export function canFallbackToOEmbed(error: ClassifiedYouTubeError): boolean {
  return error.code === 'QUOTA_EXCEEDED' || error.code === 'DAILY_LIMIT_EXCEEDED';
}
