import { describe, it, expect } from 'vitest';
import {
  mapPinterestOEmbedError,
  formatPinterestRateLimitMessage
} from './errorMapper.js';

describe('Pinterest errorMapper Suite', () => {
  describe('formatPinterestRateLimitMessage', () => {
    it('formats seconds when under a minute', () => {
      expect(formatPinterestRateLimitMessage(30)).toContain('in 30 seconds');
      expect(formatPinterestRateLimitMessage(1)).toContain('in 1 second.');
    });

    it('formats minutes when 60 seconds or above', () => {
      expect(formatPinterestRateLimitMessage(60)).toContain('in 1 minute.');
      expect(formatPinterestRateLimitMessage(130)).toContain('in 3 minutes.');
    });

    it('provides fallback message when retrySeconds is omitted', () => {
      expect(formatPinterestRateLimitMessage(null)).toBe('Pinterest is temporarily limiting requests. Please try again later.');
    });
  });

  describe('mapPinterestOEmbedError', () => {
    it('maps timeout errors to PINTEREST_TIMEOUT', () => {
      const err = new Error('Request aborted');
      (err as any).code = 'PINTEREST_TIMEOUT';
      const mapped = mapPinterestOEmbedError(err);
      expect(mapped.code).toBe('PINTEREST_TIMEOUT');
    });

    it('maps configuration disablement to PINTEREST_OEMBED_DISABLED', () => {
      const err = new Error('Disabled');
      (err as any).code = 'PINTEREST_OEMBED_DISABLED';
      const mapped = mapPinterestOEmbedError(err);
      expect(mapped.code).toBe('PINTEREST_OEMBED_DISABLED');
    });

    it('maps 404 to PIN_NOT_FOUND', () => {
      const mapped = mapPinterestOEmbedError(new Error('Not found'), 404);
      expect(mapped.code).toBe('PIN_NOT_FOUND');
    });

    it('maps 429 to PINTEREST_RATE_LIMITED with retryAfterSeconds', () => {
      const mapped = mapPinterestOEmbedError(new Error('Rate limited'), 429, { 'retry-after': '45' });
      expect(mapped.code).toBe('PINTEREST_RATE_LIMITED');
      expect(mapped.retryAfterSeconds).toBe(45);
    });

    it('maps 400, 422, or parse errors to PINTEREST_INVALID_RESPONSE', () => {
      const mapped400 = mapPinterestOEmbedError(new Error('Bad request'), 400);
      expect(mapped400.code).toBe('PINTEREST_INVALID_RESPONSE');

      const errJson = new Error('Unexpected token');
      (errJson as any).code = 'PINTEREST_INVALID_RESPONSE';
      const mappedJson = mapPinterestOEmbedError(errJson);
      expect(mappedJson.code).toBe('PINTEREST_INVALID_RESPONSE');
    });

    it('maps redirect rejection to PINTEREST_REDIRECT_REJECTED', () => {
      const err = new Error('Non-Pin redirect target');
      (err as any).code = 'PINTEREST_REDIRECT_REJECTED';
      const mapped = mapPinterestOEmbedError(err);
      expect(mapped.code).toBe('PINTEREST_REDIRECT_REJECTED');
    });

    it('maps SSRF detection to SSRF_DETECTED', () => {
      const err = new Error('Private IP target');
      (err as any).code = 'SSRF_DETECTED';
      const mapped = mapPinterestOEmbedError(err);
      expect(mapped.code).toBe('SSRF_DETECTED');
    });

    it('maps generic upstream errors to PINTEREST_UNAVAILABLE', () => {
      const mapped = mapPinterestOEmbedError(new Error('Server error 500'), 500);
      expect(mapped.code).toBe('PINTEREST_UNAVAILABLE');
    });
  });
});
