/**
 * Safe API Client & Response Parser for Snapora
 *
 * Reliably handles:
 * - Valid JSON responses
 * - Empty responses (0 bytes or whitespace)
 * - Malformed or truncated JSON
 * - HTML error responses (e.g. reverse proxy 502/504 pages)
 * - Plain-text error responses
 * - HTTP error status codes (400, 401, 403, 404, 413, 422, 429, 500, 502, 503, 504)
 * - Aborted requests (re-throws AbortError for caller distinction)
 * - Network interruptions
 * - Request timeouts
 */

export interface ApiError {
  code: string;
  message: string;
  status?: number;
}

export interface ApiSuccessResult<T> {
  ok: true;
  status: number;
  data: T;
}

export interface ApiErrorResult {
  ok: false;
  status: number;
  error: ApiError;
}

export type ApiResponse<T> = ApiSuccessResult<T> | ApiErrorResult;

export function mapHttpStatusToError(status: number, rawSnippet?: string): ApiError {
  switch (status) {
    case 429:
      return {
        code: 'RATE_LIMITED',
        message: 'Instagram is temporarily limiting requests. Please try again later.',
        status
      };
    case 408:
    case 499:
    case 504:
      return {
        code: 'TIMEOUT',
        message: 'The request took too long. Please try again.',
        status
      };
    case 401:
      return {
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Access to this content requires account authorization.',
        status
      };
    case 403:
      return {
        code: 'PRIVATE_ACCOUNT',
        message: 'This post belongs to a private account or requires an Instagram login.',
        status
      };
    case 404:
      return {
        code: 'POST_NOT_FOUND',
        message: 'The requested post or Reel could not be found.',
        status
      };
    case 413:
      return {
        code: 'FILE_TOO_LARGE',
        message: 'The media file exceeds the maximum allowed download size.',
        status
      };
    case 422:
      return {
        code: 'MEDIA_VALIDATION_FAILED',
        message: 'The retrieved data could not be verified as a valid image or video file.',
        status
      };
    case 502:
    case 503:
      return {
        code: 'SERVER_UNAVAILABLE',
        message: 'The upstream media service is temporarily unavailable. Please try again.',
        status
      };
    case 400:
      return {
        code: 'INVALID_REQUEST',
        message: rawSnippet && !rawSnippet.includes('<') && rawSnippet.length < 120
          ? rawSnippet
          : 'Invalid request. Please check the URL format and try again.',
        status
      };
    default:
      return {
        code: 'MALFORMED_RESPONSE',
        message: 'We received an incomplete response. Please try again.',
        status
      };
  }
}

export function extractStructuredError(parsed: unknown): ApiError | null {
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    // Format 1: { error: { code: string, message: string } }
    if (obj.error && typeof obj.error === 'object') {
      const err = obj.error as Record<string, unknown>;
      if (typeof err.code === 'string' && typeof err.message === 'string') {
        return {
          code: err.code,
          message: err.message
        };
      }
    }
    // Format 2: { code: string, message: string }
    if (typeof obj.code === 'string' && typeof obj.message === 'string') {
      return {
        code: obj.code,
        message: obj.message
      };
    }
    // Format 3: Fastify default error { error: string, message: string, statusCode?: number }
    if (typeof obj.error === 'string' && typeof obj.message === 'string') {
      return {
        code: obj.error,
        message: obj.message
      };
    }
  }
  return null;
}

export function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  if (err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError') return true;
  return false;
}

export async function safeFetchJson<T>(
  url: string,
  init?: RequestInit
): Promise<ApiResponse<T>> {
  let response: Response;

  try {
    response = await fetch(url, init);
  } catch (err: unknown) {
    if (isAbortError(err)) {
      throw err;
    }

    const rawMessage = err instanceof Error ? err.message : String(err);
    const lower = rawMessage.toLowerCase();

    if (lower.includes('timeout') || lower.includes('timed out')) {
      return {
        ok: false,
        status: 408,
        error: {
          code: 'TIMEOUT',
          message: 'The request took too long. Please try again.'
        }
      };
    }

    const networkMessage = lower.includes('refused')
      ? rawMessage
      : 'Connection interrupted. Please check your connection and retry.';

    return {
      ok: false,
      status: 0,
      error: {
        code: 'NETWORK_ERROR',
        message: networkMessage
      }
    };
  }

  // Read response text ONCE safely without consuming body multiple times
  let rawText = '';
  try {
    if (typeof response.text === 'function') {
      rawText = await response.text();
    } else if (typeof (response as any).json === 'function') {
      // Fallback for test mocks that only stub response.json()
      const jsonVal = await (response as any).json();
      rawText = typeof jsonVal === 'string' ? jsonVal : JSON.stringify(jsonVal);
    }
  } catch (readErr: unknown) {
    if (isAbortError(readErr)) {
      throw readErr;
    }
    return {
      ok: false,
      status: response.status,
      error: {
        code: 'NETWORK_ERROR',
        message: 'Connection interrupted. Please check your connection and retry.'
      }
    };
  }

  // Handle HTTP 204 No Content and HTTP 205 Reset Content (valid empty success responses)
  if (response.status === 204 || response.status === 205) {
    return {
      ok: true,
      status: response.status,
      data: undefined as unknown as T
    };
  }

  const trimmed = rawText.trim();

  // Handle empty bodies
  if (!trimmed) {
    if (response.ok) {
      return {
        ok: false,
        status: response.status,
        error: {
          code: 'MALFORMED_RESPONSE',
          message: 'We received an incomplete response. Please try again.'
        }
      };
    }

    return {
      ok: false,
      status: response.status,
      error: mapHttpStatusToError(response.status)
    };
  }

  // Attempt JSON parsing
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // Parsing failed (HTML error page, plain text error, or truncated JSON)
    if (response.ok) {
      return {
        ok: false,
        status: response.status,
        error: {
          code: 'MALFORMED_RESPONSE',
          message: 'We received an incomplete response. Please try again.'
        }
      };
    }

    return {
      ok: false,
      status: response.status,
      error: mapHttpStatusToError(response.status, trimmed)
    };
  }

  // Check if server returned structured error with non-2xx status code
  if (!response.ok) {
    const structured = extractStructuredError(parsed);
    if (structured) {
      return {
        ok: false,
        status: response.status,
        error: structured
      };
    }

    return {
      ok: false,
      status: response.status,
      error: mapHttpStatusToError(response.status)
    };
  }

  // Success
  return {
    ok: true,
    status: response.status,
    data: parsed as T
  };
}
