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
  EXACT_ALLOWED_INSTAGRAM_HOSTS as EXACT_ALLOWED_WEB_HOSTS,
  SHORTCODE_REGEX,
  USERNAME_REGEX,
  RESERVED_INSTAGRAM_PATHS,
  TRACKING_PARAMS,
  isInstagramCdnHostname
};

export type InstagramContentType = 'post' | 'reel' | 'tv' | 'profile' | 'direct_media';

export interface ParsedInstagramUrl {
  valid: boolean;
  originalUrl: string;
  canonicalUrl?: string;
  contentType?: InstagramContentType;
  shortcode?: string;
  username?: string;
  directMediaInfo?: DirectMediaInfo;
  error?: string;
}

/**
 * Robust URL parser and canonicalizer for Instagram media links.
 * Backed by InstagramPlatformDetector & UniversalPlatformRegistry.
 * Supports standard web posts, Reels, IGTV, verified Meta CDN media URLs, and user profiles.
 */
export function parseInstagramUrl(rawUrl: string): ParsedInstagramUrl {
  const result = universalPlatformRegistry.detectPlatform(rawUrl);

  if (!result.matched || result.error || !result.info) {
    return {
      valid: false,
      originalUrl: rawUrl || '',
      error: result.error || 'The requested media URL is invalid'
    };
  }

  return {
    valid: true,
    originalUrl: rawUrl,
    canonicalUrl: result.info.canonicalUrl,
    contentType: result.info.contentType as InstagramContentType,
    shortcode: result.info.shortcode,
    username: result.info.username,
    directMediaInfo: result.info.directMediaInfo
  };
}
