export type ErrorCode =
  | 'PRIVATE_ACCOUNT'
  | 'UNSUPPORTED_URL'
  | 'RATE_LIMITED'
  | 'PROVIDER_ERROR'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'SSRF_BLOCKED'
  | 'INVALID_REQUEST';

export interface ApiErrorResponse {
  ok: false;
  error: {
    code: ErrorCode;
    message: string;
  };
}

export function createErrorResponse(code: ErrorCode, message: string): ApiErrorResponse {
  return {
    ok: false,
    error: {
      code,
      message
    }
  };
}
