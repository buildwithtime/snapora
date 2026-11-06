import { describe, it, expect } from 'vitest';
import {
  mapDataApiError,
  mapOEmbedError,
  canFallbackToOEmbed,
  redactApiKey,
  formatYouTubeRateLimitMessage
} from './errorMapper.js';

describe('YouTube API Error Classification & Sanitization Suite', () => {
  describe('redactApiKey', () => {
    it('redacts explicit API keys from messages and URLs', () => {
      const sensitive = 'Error fetching https://www.googleapis.com/youtube/v3/videos?id=123&key=AIzaSyD-secret1234567890abcdef';
      const clean = redactApiKey(sensitive, 'AIzaSyD-secret1234567890abcdef');
      expect(clean).not.toContain('AIzaSyD-secret1234567890abcdef');
      expect(clean).toContain('[REDACTED_API_KEY]');
    });

    it('redacts generic Google API key patterns even if key variable is omitted', () => {
      const sensitive = 'Network error at endpoint key=AIzaSyB_123456789012345678901234567890';
      const clean = redactApiKey(sensitive);
      expect(clean).not.toContain('AIzaSyB_123456789012345678901234567890');
      expect(clean).toContain('[REDACTED_API_KEY]');
    });
  });

  describe('formatYouTubeRateLimitMessage', () => {
    it('formats seconds when under 60 seconds', () => {
      const msg = formatYouTubeRateLimitMessage(45);
      expect(msg).toContain('YouTube is temporarily limiting requests');
      expect(msg).toContain('45 seconds');
    });

    it('formats minutes when 60 seconds or above', () => {
      const msg = formatYouTubeRateLimitMessage(60);
      expect(msg).toContain('1 minute');

      const msg2 = formatYouTubeRateLimitMessage(120);
      expect(msg2).toContain('2 minutes');
    });
  });

  describe('mapDataApiError', () => {
    it('classifies quotaExceeded as QUOTA_EXCEEDED', () => {
      const err = {
        error: {
          code: 403,
          message: 'The request cannot be completed because you have exceeded your quota.',
          errors: [{ reason: 'quotaExceeded', message: 'Quota exceeded' }]
        }
      };
      const mapped = mapDataApiError(err, 403);
      expect(mapped.code).toBe('QUOTA_EXCEEDED');
      expect(mapped.message).toContain('quota has been exceeded');
    });

    it('classifies dailyLimitExceeded as DAILY_LIMIT_EXCEEDED', () => {
      const err = {
        error: {
          code: 403,
          message: 'Daily Limit Exceeded',
          errors: [{ reason: 'dailyLimitExceeded', message: 'Daily limit exceeded' }]
        }
      };
      const mapped = mapDataApiError(err, 403);
      expect(mapped.code).toBe('DAILY_LIMIT_EXCEEDED');
    });

    it('classifies keyInvalid as INVALID_API_KEY (operational config error)', () => {
      const err = {
        error: {
          code: 400,
          message: 'API key not valid. Please pass a valid API key.',
          errors: [{ reason: 'keyInvalid', message: 'Bad Key' }]
        }
      };
      const mapped = mapDataApiError(err, 400);
      expect(mapped.code).toBe('INVALID_API_KEY');
      expect(mapped.message).toContain('YOUTUBE_API_KEY is invalid');
    });

    it('classifies accessNotConfigured as API_NOT_ENABLED (operational config error)', () => {
      const err = {
        error: {
          code: 403,
          message: 'YouTube Data API v3 has not been used in project 12345 before or it is disabled.',
          errors: [{ reason: 'accessNotConfigured', message: 'Access not configured' }]
        }
      };
      const mapped = mapDataApiError(err, 403);
      expect(mapped.code).toBe('API_NOT_ENABLED');
      expect(mapped.message).toContain('YouTube Data API v3 is not enabled');
    });

    it('classifies 404 or videoNotFound as VIDEO_NOT_FOUND', () => {
      const mapped = mapDataApiError({ error: { errors: [{ reason: 'videoNotFound' }] } }, 404);
      expect(mapped.code).toBe('VIDEO_NOT_FOUND');
    });

    it('classifies privateVideo as PRIVATE_VIDEO', () => {
      const err = {
        error: {
          code: 403,
          errors: [{ reason: 'privateVideo', message: 'Private video' }]
        }
      };
      const mapped = mapDataApiError(err, 403);
      expect(mapped.code).toBe('PRIVATE_VIDEO');
    });

    it('classifies 429 and parses Retry-After header as UPSTREAM_RATE_LIMITED', () => {
      const headers = { 'retry-after': '45' };
      const mapped = mapDataApiError(null, 429, undefined, headers);
      expect(mapped.code).toBe('UPSTREAM_RATE_LIMITED');
      expect(mapped.retryAfterSeconds).toBe(45);
      expect(mapped.message).toContain('45 seconds');
    });

    it('classifies request timeout as UPSTREAM_TIMEOUT', () => {
      const mapped = mapDataApiError({ code: 'TIMEOUT', message: 'TIMEOUT: Request timed out' });
      expect(mapped.code).toBe('UPSTREAM_TIMEOUT');
    });
  });

  describe('mapOEmbedError', () => {
    it('classifies HTTP 404 as VIDEO_NOT_FOUND', () => {
      const mapped = mapOEmbedError(null, 404);
      expect(mapped.code).toBe('VIDEO_NOT_FOUND');
    });

    it('classifies HTTP 401/403 as PRIVATE_VIDEO', () => {
      const mapped = mapOEmbedError(null, 403);
      expect(mapped.code).toBe('PRIVATE_VIDEO');
    });

    it('classifies HTTP 429 as UPSTREAM_RATE_LIMITED', () => {
      const mapped = mapOEmbedError(null, 429, { 'retry-after': '120' });
      expect(mapped.code).toBe('UPSTREAM_RATE_LIMITED');
      expect(mapped.retryAfterSeconds).toBe(120);
    });

    it('classifies Zod or JSON parse errors as INVALID_RESPONSE', () => {
      const mapped = mapOEmbedError({ name: 'ZodError' });
      expect(mapped.code).toBe('INVALID_RESPONSE');
    });

    it('classifies timeout as UPSTREAM_TIMEOUT', () => {
      const mapped = mapOEmbedError({ code: 'TIMEOUT' });
      expect(mapped.code).toBe('UPSTREAM_TIMEOUT');
    });
  });

  describe('canFallbackToOEmbed Fallback Policy', () => {
    it('approves oEmbed fallback strictly for QUOTA_EXCEEDED and DAILY_LIMIT_EXCEEDED', () => {
      expect(canFallbackToOEmbed({ code: 'QUOTA_EXCEEDED', message: 'Quota exceeded' })).toBe(true);
      expect(canFallbackToOEmbed({ code: 'DAILY_LIMIT_EXCEEDED', message: 'Daily limit exceeded' })).toBe(true);
    });

    it('rejects oEmbed fallback for operational configuration errors (INVALID_API_KEY, API_NOT_ENABLED)', () => {
      expect(canFallbackToOEmbed({ code: 'INVALID_API_KEY', message: 'Bad key' })).toBe(false);
      expect(canFallbackToOEmbed({ code: 'API_NOT_ENABLED', message: 'API disabled' })).toBe(false);
    });

    it('rejects oEmbed fallback for content restrictions (VIDEO_NOT_FOUND, PRIVATE_VIDEO, EMBEDDING_DISABLED)', () => {
      expect(canFallbackToOEmbed({ code: 'VIDEO_NOT_FOUND', message: 'Not found' })).toBe(false);
      expect(canFallbackToOEmbed({ code: 'PRIVATE_VIDEO', message: 'Private' })).toBe(false);
      expect(canFallbackToOEmbed({ code: 'EMBEDDING_DISABLED', message: 'Disabled' })).toBe(false);
    });
  });
});
