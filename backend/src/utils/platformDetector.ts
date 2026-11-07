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


// Exactly supported official YouTube web domains
export const EXACT_ALLOWED_YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be'
]);

// Exactly supported official YouTube thumbnail CDN hosts
export const EXACT_ALLOWED_YOUTUBE_DOWNLOAD_HOSTS = new Set([
  'i.ytimg.com',
  'img.youtube.com'
]);

// YouTube video ID regex: exactly 11 characters of Base64URL characters [a-zA-Z0-9_-]
export const YOUTUBE_VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

export class YouTubePlatformDetector implements IPlatformDetector {
  readonly platformId: PlatformId = 'youtube';
  readonly name = 'YouTubePlatformDetector';
  readonly supportedHostnames: ReadonlyArray<string> = Array.from(EXACT_ALLOWED_YOUTUBE_HOSTS);

  private readonly allowedDownloadRules: Array<string | RegExp> = Array.from(EXACT_ALLOWED_YOUTUBE_DOWNLOAD_HOSTS);

  matches(url: URL): boolean {
    const hostname = url.hostname.toLowerCase().replace(/\.+$/, '');
    return EXACT_ALLOWED_YOUTUBE_HOSTS.has(hostname);
  }

  getAllowedDownloadHosts(): Array<string | RegExp> {
    return [...this.allowedDownloadRules];
  }

  isAllowedDownloadHost(hostname: string): boolean {
    const clean = hostname.toLowerCase().replace(/\.+$/, '');
    return EXACT_ALLOWED_YOUTUBE_DOWNLOAD_HOSTS.has(clean);
  }

  detect(rawUrl: string, parsedUrl: URL): PlatformDetectResult {
    const hostname = parsedUrl.hostname.toLowerCase().replace(/\.+$/, '');

    if (!EXACT_ALLOWED_YOUTUBE_HOSTS.has(hostname)) {
      return {
        matched: false,
        error: `Hostname '${hostname}' is not a recognized YouTube domain`
      };
    }

    // 1. youtu.be shortlinks
    if (hostname === 'youtu.be') {
      const parts = parsedUrl.pathname.split('/').filter(Boolean);
      if (parts.length === 0) {
        return {
          matched: true,
          platformId: 'youtube',
          error: 'Invalid youtu.be URL: missing video ID'
        };
      }

      const videoId = parts[0];
      if (!YOUTUBE_VIDEO_ID_REGEX.test(videoId)) {
        return {
          matched: true,
          platformId: 'youtube',
          error: `Invalid YouTube video ID '${videoId}'. Must be exactly 11 alphanumeric characters, underscores, or hyphens.`
        };
      }

      return this.buildResult(rawUrl, videoId);
    }

    // 2. youtube.com, www.youtube.com, m.youtube.com
    const cleanPath = parsedUrl.pathname.replace(/\/+$/, '') || '/';

    // A. Explicitly reject playlist-only URLs
    if (cleanPath === '/playlist' || (cleanPath !== '/watch' && parsedUrl.searchParams.has('list') && !parsedUrl.searchParams.has('v'))) {
      return {
        matched: true,
        platformId: 'youtube',
        error: 'Playlists are not supported. Please provide a direct video URL.'
      };
    }

    // B. Explicitly reject channel / user URLs
    if (
      cleanPath.startsWith('/@') ||
      cleanPath.startsWith('/channel/') ||
      cleanPath.startsWith('/c/') ||
      cleanPath.startsWith('/user/')
    ) {
      return {
        matched: true,
        platformId: 'youtube',
        error: 'Channel URLs are not supported. Please provide a direct video URL.'
      };
    }

    // C. Standard /watch?v={videoId}
    if (cleanPath === '/watch') {
      const videoId = parsedUrl.searchParams.get('v');
      if (!videoId) {
        return {
          matched: true,
          platformId: 'youtube',
          error: "Invalid YouTube URL: missing 'v' video ID query parameter"
        };
      }

      if (!YOUTUBE_VIDEO_ID_REGEX.test(videoId)) {
        return {
          matched: true,
          platformId: 'youtube',
          error: `Invalid YouTube video ID '${videoId}'. Must be exactly 11 alphanumeric characters, underscores, or hyphens.`
        };
      }

      return this.buildResult(rawUrl, videoId);
    }

    // D. YouTube Shorts (/shorts/{videoId})
    if (cleanPath.startsWith('/shorts/') || cleanPath === '/shorts') {
      const match = cleanPath.match(/^\/shorts\/([a-zA-Z0-9_-]+)$/);
      if (!match) {
        return {
          matched: true,
          platformId: 'youtube',
          error: 'Invalid YouTube Shorts URL structure'
        };
      }

      const videoId = match[1];
      if (!YOUTUBE_VIDEO_ID_REGEX.test(videoId)) {
        return {
          matched: true,
          platformId: 'youtube',
          error: `Invalid YouTube video ID '${videoId}'. Must be exactly 11 alphanumeric characters, underscores, or hyphens.`
        };
      }

      return this.buildResult(rawUrl, videoId);
    }

    // E. YouTube Live (/live/{videoId})
    if (cleanPath.startsWith('/live/') || cleanPath === '/live') {
      const match = cleanPath.match(/^\/live\/([a-zA-Z0-9_-]+)$/);
      if (!match) {
        return {
          matched: true,
          platformId: 'youtube',
          error: 'Invalid YouTube Live URL structure'
        };
      }

      const videoId = match[1];
      if (!YOUTUBE_VIDEO_ID_REGEX.test(videoId)) {
        return {
          matched: true,
          platformId: 'youtube',
          error: `Invalid YouTube video ID '${videoId}'. Must be exactly 11 alphanumeric characters, underscores, or hyphens.`
        };
      }

      return this.buildResult(rawUrl, videoId);
    }

    // F. YouTube Embed (/embed/{videoId})
    if (cleanPath.startsWith('/embed/') || cleanPath === '/embed') {
      const match = cleanPath.match(/^\/embed\/([a-zA-Z0-9_-]+)$/);
      if (!match) {
        return {
          matched: true,
          platformId: 'youtube',
          error: 'Invalid YouTube Embed URL structure'
        };
      }

      const videoId = match[1];
      if (!YOUTUBE_VIDEO_ID_REGEX.test(videoId)) {
        return {
          matched: true,
          platformId: 'youtube',
          error: `Invalid YouTube video ID '${videoId}'. Must be exactly 11 alphanumeric characters, underscores, or hyphens.`
        };
      }

      return this.buildResult(rawUrl, videoId);
    }

    // G. Unrecognized paths
    return {
      matched: true,
      platformId: 'youtube',
      error: 'Unrecognized YouTube path (expected /watch?v=, youtu.be/, /shorts/, /live/, or /embed/)'
    };
  }

  private buildResult(rawUrl: string, videoId: string): PlatformDetectResult {
    return {
      matched: true,
      platformId: 'youtube',
      info: {
        platformId: 'youtube',
        contentType: 'video',
        canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
        originalUrl: rawUrl,
        shortcode: videoId,
        contentId: videoId
      }
    };
  }
}

// Canonical supported Pinterest web hosts
export const EXACT_ALLOWED_PINTEREST_HOSTS = new Set([
  'pinterest.com',
  'www.pinterest.com',
  'm.pinterest.com',
  'pin.it'
]);

export const PINTEREST_PIN_ID_REGEX = /^\d{16,22}$/;

export const PINTEREST_CCTLD_REGEX = /^([a-z]{2,5}\.)?pinterest\.(co\.uk|ca|de|fr|com\.au|es|it|jp|co\.kr|ch|at|co\.nz|ie|se|pt)$/;

export const EXACT_ALLOWED_PINTEREST_DOWNLOAD_HOSTS = new Set([
  'i.pinimg.com',
  's-media-cache-ak0.pinimg.com'
]);

export function isAllowedPinterestHost(hostname: string): boolean {
  const clean = hostname.toLowerCase().replace(/\.+$/, '');
  if (EXACT_ALLOWED_PINTEREST_HOSTS.has(clean)) {
    return true;
  }
  if (clean.endsWith('.pinterest.com') && !clean.includes('..')) {
    return true;
  }
  if (PINTEREST_CCTLD_REGEX.test(clean)) {
    return true;
  }
  return false;
}

export class PinterestPlatformDetector implements IPlatformDetector {
  readonly platformId: PlatformId = 'pinterest';
  readonly name = 'Pinterest';
  readonly supportedHostnames: ReadonlyArray<string> = [
    'pinterest.com',
    'www.pinterest.com',
    'pin.it'
  ];

  matches(url: URL): boolean {
    return isAllowedPinterestHost(url.hostname);
  }

  detect(rawUrl: string, parsedUrl: URL): PlatformDetectResult {
    // 1. Enforce HTTPS only
    if (parsedUrl.protocol !== 'https:') {
      return {
        matched: true,
        platformId: 'pinterest',
        error: 'Only HTTPS Pinterest URLs are permitted'
      };
    }

    // 2. Reject embedded credentials
    if (parsedUrl.username || parsedUrl.password) {
      return {
        matched: true,
        platformId: 'pinterest',
        error: 'Embedded authentication credentials are not permitted'
      };
    }

    // 3. Reject non-standard ports
    if (parsedUrl.port && parsedUrl.port !== '443') {
      return {
        matched: true,
        platformId: 'pinterest',
        error: 'Non-standard ports are prohibited'
      };
    }

    const hostname = parsedUrl.hostname.toLowerCase().replace(/\.+$/, '');
    const cleanPath = parsedUrl.pathname.replace(/\/+$/, '') || '/';

    // 4. Handle pin.it shortlinks
    if (hostname === 'pin.it') {
      const shortcode = cleanPath.replace(/^\/+/, '');
      if (!shortcode || !/^[a-zA-Z0-9_-]{3,20}$/.test(shortcode)) {
        return {
          matched: true,
          platformId: 'pinterest',
          error: `Invalid or malformed pin.it shortcode '${shortcode}'`
        };
      }

      return {
        matched: true,
        platformId: 'pinterest',
        info: {
          platformId: 'pinterest',
          contentType: 'post',
          canonicalUrl: `https://pin.it/${shortcode}`,
          originalUrl: rawUrl,
          shortcode,
          contentId: shortcode
        }
      };
    }

    // 5. Reject search, today, and ideas feeds
    if (
      cleanPath.startsWith('/search') ||
      cleanPath.startsWith('/today') ||
      cleanPath.startsWith('/ideas')
    ) {
      return {
        matched: true,
        platformId: 'pinterest',
        error: 'Pinterest search and feed pages are not supported. Please provide a direct Pin URL.'
      };
    }

    // 6. Handle standard /pin/{id}
    if (cleanPath.startsWith('/pin/') || cleanPath === '/pin') {
      const match = cleanPath.match(/^\/pin\/(\d+)$/);
      if (!match) {
        // Path starts with /pin/ but ID is non-numeric or malformed
        const subPath = cleanPath.replace(/^\/pin\/?/, '');
        return {
          matched: true,
          platformId: 'pinterest',
          error: `Invalid Pinterest Pin URL: invalid identifier '${subPath}'. Expected a 16-22 digit numeric Pin ID.`
        };
      }

      const pinId = match[1];
      if (!PINTEREST_PIN_ID_REGEX.test(pinId)) {
        return {
          matched: true,
          platformId: 'pinterest',
          error: `Invalid Pinterest Pin ID '${pinId}'. Must be a 16-22 digit numeric identifier.`
        };
      }

      return {
        matched: true,
        platformId: 'pinterest',
        info: {
          platformId: 'pinterest',
          contentType: 'post',
          canonicalUrl: `https://www.pinterest.com/pin/${pinId}/`,
          originalUrl: rawUrl,
          shortcode: pinId,
          contentId: pinId
        }
      };
    }

    // 7. Explicitly reject board and profile URLs
    const segments = cleanPath.split('/').filter(Boolean);
    if (segments.length === 1) {
      return {
        matched: true,
        platformId: 'pinterest',
        error: `Pinterest user profiles (@${segments[0]}) are not supported. Please provide a direct Pin URL.`
      };
    }
    if (segments.length >= 2) {
      return {
        matched: true,
        platformId: 'pinterest',
        error: `Pinterest boards (${segments[0]}/${segments[1]}) are not supported. Please provide a direct Pin URL.`
      };
    }

    return {
      matched: true,
      platformId: 'pinterest',
      error: 'Unrecognized Pinterest URL format. Expected /pin/{id}/ or pin.it/{shortcode}.'
    };
  }

  isAllowedDownloadHost(hostname: string): boolean {
    const clean = hostname.toLowerCase().replace(/\.+$/, '');
    return EXACT_ALLOWED_PINTEREST_DOWNLOAD_HOSTS.has(clean);
  }

  getAllowedDownloadHosts(): Array<string | RegExp> {
    return Array.from(EXACT_ALLOWED_PINTEREST_DOWNLOAD_HOSTS);
  }
}

export const pinterestPlatformDetector = new PinterestPlatformDetector();

export class UniversalPlatformRegistry {
  private detectors: Map<PlatformId, IPlatformDetector> = new Map();

  constructor() {
    this.registerDetector(new InstagramPlatformDetector());
    this.registerDetector(new YouTubePlatformDetector());
    this.registerDetector(new PinterestPlatformDetector());
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
