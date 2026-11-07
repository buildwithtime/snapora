import { describe, it, expect } from 'vitest';
import {
  calculatePinterestRetention,
  isPinterestMetadataExpired,
  PINTEREST_METADATA_RETENTION_MS
} from './retention.js';

describe('Pinterest Data Retention Suite', () => {
  it('calculates 30-day lifecycle expiration window accurately', () => {
    const fixedNow = new Date('2026-11-07T12:00:00.000Z');
    const retention = calculatePinterestRetention(fixedNow);

    expect(retention.fetchedAt).toBe('2026-11-07T12:00:00.000Z');
    expect(retention.expiresAt).toBe('2026-12-07T12:00:00.000Z');

    const diff = new Date(retention.expiresAt).getTime() - new Date(retention.fetchedAt).getTime();
    expect(diff).toBe(PINTEREST_METADATA_RETENTION_MS);
  });

  it('determines whether metadata is valid or expired', () => {
    const futureDate = new Date(Date.now() + 1000 * 60 * 60).toISOString();
    expect(isPinterestMetadataExpired(futureDate)).toBe(false);

    const pastDate = new Date(Date.now() - 1000 * 60 * 60).toISOString();
    expect(isPinterestMetadataExpired(pastDate)).toBe(true);
  });

  it('treats invalid or malformed dates as expired (fail-safe)', () => {
    expect(isPinterestMetadataExpired('not-a-date')).toBe(true);
    expect(isPinterestMetadataExpired('')).toBe(true);
  });
});
