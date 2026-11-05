import type { PlatformId, UnifiedMediaType } from '../providers/types.js';

export type { PlatformId, UnifiedMediaType };

export interface DirectMediaInfo {
  hostname: string;
  extension: 'jpg' | 'jpeg' | 'mp4' | 'webp' | 'unknown';
  hasCryptoTokens: boolean;
  expiresAtUnixHex?: string;
}

export interface DetectedPlatformInfo {
  platformId: PlatformId;
  contentType: UnifiedMediaType;
  canonicalUrl: string;
  originalUrl: string;
  shortcode?: string;
  contentId?: string;
  username?: string;
  directMediaInfo?: DirectMediaInfo;
}

export interface PlatformDetectResult {
  matched: boolean;
  platformId?: PlatformId;
  info?: DetectedPlatformInfo;
  error?: string;
}

export interface IPlatformDetector {
  readonly platformId: PlatformId;
  readonly name: string;
  readonly supportedHostnames: ReadonlyArray<string>;
  matches(url: URL): boolean;
  detect(rawUrl: string, parsedUrl: URL): PlatformDetectResult;
  isAllowedDownloadHost?(hostname: string): boolean;
  getAllowedDownloadHosts?(): Array<string | RegExp>;
}

// Exactly supported official Instagram web domains
export const EXACT_ALLOWED_INSTAGRAM_HOSTS = new Set([
  'instagram.com',
  'www.instagram.com',
  'm.instagram.com',
  'instagr.am'
]);

// Valid shortcode regex: Base64URL-style characters between 3 and 40 chars
export const SHORTCODE_REGEX = /^[a-zA-Z0-9_-]{3,40}$/;

// Instagram username regex: 1-30 chars, alphanumeric + periods + underscores, no leading/trailing dot, no consecutive dots
export const USERNAME_REGEX = /^(?!.*\.\.)(?!^\.)(?!.*\.$)[a-zA-Z0-9._]{1,30}$/;

// Reserved top-level Instagram paths that must never be treated as profile usernames
export const RESERVED_INSTAGRAM_PATHS = new Set([
  'p',
  'reel',
  'reels',
  'tv',
  'stories',
  'explore',
  'accounts',
  'direct',
  'create',
  'about',
  'legal',
  'privacy',
  'terms',
  'help',
  'developer',
  'api',
  'graphql',
  'directory',
  'download',
  'settings',
  'your_activity',
  'saved',
  'archive',
  'emails'
]);

// Known tracking parameters to strip from web permalinks
export const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'igsh',
  'igshid',
  'fbclid',
  'ref',
  'rpxt',
  '__coig_restricted',
  'theme'
]);

/**
 * Checks whether a hostname matches Meta/Instagram CDN naming patterns
 */
export function isInstagramCdnHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase().replace(/\.+$/, '');
  return (
    /^[a-zA-Z0-9.-]+\.cdninstagram\.com$/.test(lower) ||
    /^[a-zA-Z0-9.-]+\.fbcdn\.net$/.test(lower)
  );
}

export class InstagramPlatformDetector implements IPlatformDetector {
  readonly platformId: PlatformId = 'instagram';
  readonly name = 'InstagramPlatformDetector';
  readonly supportedHostnames: ReadonlyArray<string> = Array.from(EXACT_ALLOWED_INSTAGRAM_HOSTS);

  private readonly allowedDownloadRules: Array<string | RegExp> = [
    'instagram.com',
    'www.instagram.com',
    'm.instagram.com',
    'instagr.am',
    /^[a-zA-Z0-9.-]+\.cdninstagram\.com$/,
    /^[a-zA-Z0-9.-]+\.fbcdn\.net$/
  ];

  matches(url: URL): boolean {
    const hostname = url.hostname.toLowerCase().replace(/\.+$/, '');
    return EXACT_ALLOWED_INSTAGRAM_HOSTS.has(hostname) || isInstagramCdnHostname(hostname);
  }

  getAllowedDownloadHosts(): Array<string | RegExp> {
    return [...this.allowedDownloadRules];
  }

  isAllowedDownloadHost(hostname: string): boolean {
    const clean = hostname.toLowerCase().replace(/\.+$/, '');
    for (const rule of this.allowedDownloadRules) {
      if (typeof rule === 'string' && clean === rule) return true;
      if (rule instanceof RegExp && rule.test(clean)) return true;
    }
    return false;
  }

  detect(rawUrl: string, parsedUrl: URL): PlatformDetectResult {
    const hostname = parsedUrl.hostname.toLowerCase().replace(/\.+$/, '');

    // 1. Direct Meta CDN media link
    if (isInstagramCdnHostname(hostname)) {
      const pathname = parsedUrl.pathname.toLowerCase();
      let extension: DirectMediaInfo['extension'] = 'unknown';

      if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) {
        extension = 'jpg';
      } else if (pathname.endsWith('.mp4')) {
        extension = 'mp4';
      } else if (pathname.endsWith('.webp')) {
        extension = 'webp';
      }

      const hasCryptoTokens = parsedUrl.searchParams.has('oh') && parsedUrl.searchParams.has('oe');
      const expiresAtUnixHex = parsedUrl.searchParams.get('oe') || undefined;
      const contentId = parsedUrl.pathname.split('/').filter(Boolean).pop() || 'direct_media';

      return {
        matched: true,
        platformId: 'instagram',
        info: {
          platformId: 'instagram',
          contentType: 'direct_media',
          canonicalUrl: `https://${hostname}${parsedUrl.pathname}${parsedUrl.search}`,
          originalUrl: rawUrl,
          shortcode: contentId,
          contentId,
          directMediaInfo: {
            hostname,
            extension,
            hasCryptoTokens,
            expiresAtUnixHex
          }
        }
      };
    }

    // 2. Official Instagram Web Permalinks & Profiles
    const cleanPath = parsedUrl.pathname.replace(/\/+$/, '');

    // /p/{shortcode}
    const postMatch = cleanPath.match(/^\/p\/([a-zA-Z0-9_-]+)$/);
    if (postMatch) {
      return this.buildWebResult(rawUrl, postMatch[1], 'post');
    }

    // /reel/{shortcode} or /reels/{shortcode}
    const reelMatch = cleanPath.match(/^\/reels?\/([a-zA-Z0-9_-]+)$/);
    if (reelMatch) {
      return this.buildWebResult(rawUrl, reelMatch[1], 'reel');
    }

    // /tv/{shortcode}
    const tvMatch = cleanPath.match(/^\/tv\/([a-zA-Z0-9_-]+)$/);
    if (tvMatch) {
      return this.buildWebResult(rawUrl, tvMatch[1], 'tv');
    }

    // /{username}/p/{shortcode}
    const userPostMatch = cleanPath.match(/^\/([a-zA-Z0-9_.]+)\/p\/([a-zA-Z0-9_-]+)$/);
    if (userPostMatch) {
      return this.buildWebResult(rawUrl, userPostMatch[2], 'post', userPostMatch[1]);
    }

    // /{username}/reels?/{shortcode}
    const userReelMatch = cleanPath.match(/^\/([a-zA-Z0-9_.]+)\/reels?\/([a-zA-Z0-9_-]+)$/);
    if (userReelMatch) {
      return this.buildWebResult(rawUrl, userReelMatch[2], 'reel', userReelMatch[1]);
    }

    // /{username} profile
    const profileMatch = cleanPath.match(/^\/([a-zA-Z0-9_.]+)$/);
    if (profileMatch) {
      const candidate = profileMatch[1];
      if (!RESERVED_INSTAGRAM_PATHS.has(candidate.toLowerCase()) && USERNAME_REGEX.test(candidate)) {
        return {
          matched: true,
          platformId: 'instagram',
          info: {
            platformId: 'instagram',
            contentType: 'profile',
            canonicalUrl: `https://www.instagram.com/${candidate}/`,
            originalUrl: rawUrl,
            shortcode: candidate,
            contentId: candidate,
            username: candidate
          }
        };
      }
    }

    return {
      matched: true,
      platformId: 'instagram',
      error: 'Unrecognized Instagram path (expected /p/, /reel/, /reels/, /tv/, or valid profile /<username>/)'
    };
  }

  private buildWebResult(
    rawUrl: string,
    shortcode: string,
    contentType: 'post' | 'reel' | 'tv',
    username?: string
  ): PlatformDetectResult {
    if (!SHORTCODE_REGEX.test(shortcode)) {
      return {
        matched: true,
        platformId: 'instagram',
        error: `Invalid shortcode '${shortcode}'. Must be 3-40 alphanumeric characters, underscores, or hyphens.`
      };
    }

    const pathPrefix = contentType === 'reel' ? 'reel' : contentType === 'tv' ? 'tv' : 'p';
    const canonicalUrl = `https://www.instagram.com/${pathPrefix}/${shortcode}/`;

    return {
      matched: true,
      platformId: 'instagram',
      info: {
        platformId: 'instagram',
        contentType,
        canonicalUrl,
        originalUrl: rawUrl,
        shortcode,
        contentId: shortcode,
        username
      }
    };
  }
}

export class UniversalPlatformRegistry {
  private detectors: Map<PlatformId, IPlatformDetector> = new Map();

  constructor() {
    this.registerDetector(new InstagramPlatformDetector());
  }

  registerDetector(detector: IPlatformDetector): void {
    this.detectors.set(detector.platformId, detector);
  }

  getDetector(platformId: PlatformId): IPlatformDetector | undefined {
    return this.detectors.get(platformId);
  }

  listDetectors(): IPlatformDetector[] {
    return Array.from(this.detectors.values());
  }

  getAllowedDownloadHosts(): Array<string | RegExp> {
    const rules: Array<string | RegExp> = [];
    for (const detector of this.detectors.values()) {
      if (detector.getAllowedDownloadHosts) {
        rules.push(...detector.getAllowedDownloadHosts());
      }
    }
    return rules;
  }

  isAllowedDownloadHost(hostname: string): boolean {
    const clean = hostname.toLowerCase().replace(/\.+$/, '');
    for (const detector of this.detectors.values()) {
      if (detector.isAllowedDownloadHost && detector.isAllowedDownloadHost(clean)) {
        return true;
      }
    }
    return false;
  }

  detectPlatform(rawUrl: string): PlatformDetectResult {
    if (!rawUrl || typeof rawUrl !== 'string') {
      return { matched: false, error: 'URL must be a non-empty string' };
    }

    const trimmed = rawUrl.trim();
    if (!trimmed) {
      return { matched: false, error: 'URL cannot be empty or blank' };
    }

    // Path traversal check
    if (trimmed.includes('/../') || trimmed.includes('/..') || trimmed.includes('\\')) {
      return {
        matched: false,
        error: 'Path traversal sequences are not permitted'
      };
    }

    let parsed: URL;
    try {
      const withProtocol = trimmed.startsWith('http://') || trimmed.startsWith('https://')
        ? trimmed
        : `https://${trimmed}`;
      parsed = new URL(withProtocol);
    } catch {
      return { matched: false, error: 'Malformed URL structure' };
    }

    // 1. Strict protocol check: Only HTTPS permitted
    if (parsed.protocol !== 'https:') {
      return {
        matched: false,
        error: 'Only HTTPS URLs are permitted'
      };
    }

    // 2. Embedded authentication credentials rejection
    if (parsed.username || parsed.password) {
      return {
        matched: false,
        error: 'Embedded authentication credentials are not permitted'
      };
    }

    // 3. Disallow unexpected custom ports
    if (parsed.port && parsed.port !== '443') {
      return {
        matched: false,
        error: 'Non-standard ports are prohibited'
      };
    }

    // 4. Match against registered platform detectors
    for (const detector of this.detectors.values()) {
      if (detector.matches(parsed)) {
        return detector.detect(trimmed, parsed);
      }
    }

    const hostname = parsed.hostname.toLowerCase().replace(/\.+$/, '');
    return {
      matched: false,
      error: `Hostname '${hostname}' is not in the allowed domain list`
    };
  }
}

// Global shared platform registry instance
export const universalPlatformRegistry = new UniversalPlatformRegistry();
