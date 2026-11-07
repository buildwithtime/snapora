/**
 * Pinterest API Data Retention Policy Helpers
 *
 * In compliance with Pinterest Developer Terms, third-party applications must delete
 * stored Pinterest API data without undue delay and in no event later than thirty (30) days.
 *
 * This utility enforces the 30-day lifecycle expiration on upstream metadata
 * while allowing user-authored workspace records (notes, tags, collections, and record identity)
 * to be permanently preserved.
 */

export const PINTEREST_METADATA_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds

export function calculatePinterestRetention(fetchedAt?: Date): { fetchedAt: string; expiresAt: string } {
  const fetched = fetchedAt || new Date();
  const expires = new Date(fetched.getTime() + PINTEREST_METADATA_RETENTION_MS);
  return {
    fetchedAt: fetched.toISOString(),
    expiresAt: expires.toISOString()
  };
}

export function isPinterestMetadataExpired(expiresAt: string | Date): boolean {
  const expirationDate = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
  if (isNaN(expirationDate.getTime())) {
    return true; // Treat unparseable dates as expired (fail-safe)
  }
  return Date.now() >= expirationDate.getTime();
}
