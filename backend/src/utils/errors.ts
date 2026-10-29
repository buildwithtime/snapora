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
  | 'LOGIN_WALL_ENCOUNTERED';

export interface ApiErrorResponse {
  ok: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: string;
  };
}

export function createErrorResponse(code: ErrorCode, message: string, details?: string): ApiErrorResponse {
  return {
    ok: false,
    error: {
      code,
      message,
      ...(details ? { details } : {})
    }
  };
}
