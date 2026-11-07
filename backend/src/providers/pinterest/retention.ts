/**
 * Pinterest API Data Retention Policy Helpers
 *
 * Compliance with Pinterest Developer Terms requires third-party applications to delete
 * or refresh stored Pinterest API data without undue delay and at latest within thirty (30) days.
 *
 * Categorization of Workspace Data:
 * 1. Pinterest-Derived Upstream Metadata:
 *    - Titles, author names, author URLs, preview thumbnail URLs, and embed snippets
 *      retrieved from Pinterest's oEmbed endpoint.
 *    - Retention Rule: Subject to the 30-day lifecycle expiration window. Must be purged
 *      or refreshed upon reaching metadataExpiresAt.
 *
 * 2. User-Created Annotations:
 *    - Personal user notes, custom tags, workspace collections, and user-assigned labels.
 *    - Retention Rule: Independent user-authored content managed and retained at user discretion.
 *
 * 3. Canonical URLs and Pin Identifiers:
 *    - The canonical web permalink (https://www.pinterest.com/pin/<id>/) and numeric Pin ID.
 *    - Retention Status & Policy Interpretation:
 *      Whether canonical web URLs and platform-assigned numeric identifiers constitute
 *      'Pinterest Data' subject to mandatory 30-day deletion remains an unresolved policy
 *      interpretation across developer platforms. Snapora does not claim that every identifier
 *      is permanently exempt; instead, it enforces explicit 30-day lifecycle timestamps on all
 *      resolved metadata payloads to support transparent client-side refresh workflows.
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
