import type {
  PlatformId,
  UnifiedMediaType,
  DirectMediaInfo,
  DetectedPlatformInfo,
  PlatformDetectResult,
  IPlatformDetector
} from './platformDetector.js';

import {
  InstagramPlatformDetector,
  UniversalPlatformRegistry,
  universalPlatformRegistry,
  EXACT_ALLOWED_INSTAGRAM_HOSTS,
  SHORTCODE_REGEX,
  USERNAME_REGEX,
  RESERVED_INSTAGRAM_PATHS,
  TRACKING_PARAMS,
  isInstagramCdnHostname
} from './platformDetector.js';

export type {
  PlatformId,
  UnifiedMediaType,
  DirectMediaInfo,
  DetectedPlatformInfo,
  PlatformDetectResult,
  IPlatformDetector
};

export {
  InstagramPlatformDetector,
  UniversalPlatformRegistry,
  universalPlatformRegistry,
  EXACT_ALLOWED_INSTAGRAM_HOSTS as EXACT_ALLOWED_HOSTS,
  SHORTCODE_REGEX,
  USERNAME_REGEX,
  RESERVED_INSTAGRAM_PATHS,
  TRACKING_PARAMS,
  isInstagramCdnHostname
};

export type InstagramMediaType = 'post' | 'reel' | 'tv' | 'profile' | 'direct_media';

export interface ParsedUrlResult {
  valid: boolean;
  originalUrl: string;
  normalizedUrl?: string;
  shortcode?: string;
  contentId?: string;
  platform?: PlatformId;
  username?: string;
  mediaType?: InstagramMediaType | UnifiedMediaType;
  directMediaInfo?: DirectMediaInfo;
  error?: string;
}

/**
 * Robust URL parser and canonicalizer for media links.
 * Backed by UniversalPlatformRegistry and InstagramPlatformDetector.
 */
export function parseInstagramUrl(rawUrl: string): ParsedUrlResult {
  const result = universalPlatformRegistry.detectPlatform(rawUrl);

  if (!result.matched || result.error || !result.info) {
    return {
      valid: false,
      originalUrl: rawUrl || '',
      error: result.error || 'Invalid URL'
    };
  }

  return {
    valid: true,
    originalUrl: rawUrl,
    normalizedUrl: result.info.canonicalUrl,
    shortcode: result.info.shortcode,
    contentId: result.info.contentId,
    platform: result.info.platformId,
    username: result.info.username,
    mediaType: result.info.contentType as InstagramMediaType,
    directMediaInfo: result.info.directMediaInfo
  };
}

export function parseBatchUrls(text: string): {
  valid: Array<{
    url: string;
    normalizedUrl: string;
    shortcode: string;
    contentId?: string;
    platform?: PlatformId;
    mediaType: InstagramMediaType;
    username?: string;
  }>;
  invalid: Array<{ url: string; error: string }>;
} {
  const lines = text
    .split(/(?:\r?\n|,|\s)+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const valid: Array<{
    url: string;
    normalizedUrl: string;
    shortcode: string;
    contentId?: string;
    platform?: PlatformId;
    mediaType: InstagramMediaType;
    username?: string;
  }> = [];
  const invalid: Array<{ url: string; error: string }> = [];
  const seenUrls = new Set<string>();

  for (const line of lines) {
    const res = parseInstagramUrl(line);
    if (res.valid && res.mediaType === 'profile') {
      invalid.push({
        url: line,
        error: `Profile URL '@${res.username}' belongs in the Profile Gallery, not the individual post download queue.`
      });
      continue;
    }
    if (res.valid && res.normalizedUrl && res.shortcode && res.mediaType) {
      if (!seenUrls.has(res.normalizedUrl)) {
        seenUrls.add(res.normalizedUrl);
        valid.push({
          url: res.originalUrl,
          normalizedUrl: res.normalizedUrl,
          shortcode: res.shortcode,
          contentId: res.contentId || res.shortcode,
          platform: res.platform || 'instagram',
          username: res.username,
          mediaType: res.mediaType as InstagramMediaType
        });
      }
    } else {
      invalid.push({
        url: line,
        error: res.error || 'Invalid URL'
      });
    }
  }

  return { valid, invalid };
}
