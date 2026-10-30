import { describe, it, expect } from 'vitest';
import { parseRetryAfter, formatRateLimitMessage, createErrorResponse } from './errors.js';

describe('Retry-After Header Parser & Formatter', () => {
  it('parses valid delta-seconds integers', () => {
    expect(parseRetryAfter('120')).toBe(120);
    expect(parseRetryAfter('5')).toBe(5);
    expect(parseRetryAfter('0')).toBe(0);
    expect(parseRetryAfter(['60'])).toBe(60);
  });

  it('clamps excessive delta-seconds to maxSeconds ceiling (prevents unbounded wait)', () => {
    expect(parseRetryAfter('86400', 3600)).toBe(3600);
    expect(parseRetryAfter('999999')).toBe(3600);
  });

  it('parses HTTP-date format correctly', () => {
    const futureDate = new Date(Date.now() + 45000).toUTCString();
    const delay = parseRetryAfter(futureDate);
    expect(delay).toBeGreaterThanOrEqual(44);
    expect(delay).toBeLessThanOrEqual(46);
  });

  it('returns 0 for HTTP-dates in the past', () => {
    const pastDate = new Date(Date.now() - 60000).toUTCString();
    expect(parseRetryAfter(pastDate)).toBe(0);
  });

  it('returns null for missing, empty, or invalid formats', () => {
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter(undefined)).toBeNull();
    expect(parseRetryAfter('')).toBeNull();
    expect(parseRetryAfter('   ')).toBeNull();
    expect(parseRetryAfter('invalid-string')).toBeNull();
    expect(parseRetryAfter('-10')).toBeNull();
    expect(parseRetryAfter('12.34')).toBeNull();
  });

  it('formats user-friendly messages for seconds and minutes', () => {
    // 10 seconds → 10 seconds
    expect(formatRateLimitMessage(10)).toBe(
      'Instagram is temporarily limiting requests. Please try again in 10 seconds.'
    );
    // 45 seconds → 45 seconds
    expect(formatRateLimitMessage(45)).toBe(
      'Instagram is temporarily limiting requests. Please try again in 45 seconds.'
    );
    expect(formatRateLimitMessage(1)).toBe(
      'Instagram is temporarily limiting requests. Please try again in 1 second.'
    );
    // 60 seconds → 1 minute
    expect(formatRateLimitMessage(60)).toBe(
      'Instagram is temporarily limiting requests. Please try again in 1 minute.'
    );
    // 90 seconds → 2 minutes
    expect(formatRateLimitMessage(90)).toBe(
      'Instagram is temporarily limiting requests. Please try again in 2 minutes.'
    );
    // 120 seconds → 2 minutes
    expect(formatRateLimitMessage(120)).toBe(
      'Instagram is temporarily limiting requests. Please try again in 2 minutes.'
    );
    // 3600 seconds → 60 minutes
    expect(formatRateLimitMessage(3600)).toBe(
      'Instagram is temporarily limiting requests. Please try again in 60 minutes.'
    );
    expect(formatRateLimitMessage(null)).toBe(
      'Instagram is temporarily limiting requests. Please try again later.'
    );
    expect(formatRateLimitMessage(0)).toBe(
      'Instagram is temporarily limiting requests. Please try again later.'
    );
  });

  it('creates error response with optional retryAfterSeconds field', () => {
    const err = createErrorResponse('RATE_LIMITED', 'Rate limited', undefined, 45);
    expect(err.ok).toBe(false);
    expect(err.error.code).toBe('RATE_LIMITED');
    expect(err.error.message).toBe('Rate limited');
    expect(err.error.retryAfterSeconds).toBe(45);
  });
});

