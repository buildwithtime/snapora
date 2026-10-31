export type InstagramContentType = 'post' | 'reel' | 'tv' | 'profile' | 'direct_media';

export interface DirectMediaInfo {
  hostname: string;
  extension: 'jpg' | 'jpeg' | 'mp4' | 'webp' | 'unknown';
  hasCryptoTokens: boolean;
  expiresAtUnixHex?: string;
}

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

// Exactly supported official Instagram web domains
export const EXACT_ALLOWED_WEB_HOSTS = new Set([
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
const TRACKING_PARAMS = new Set([
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
  // Matches *.cdninstagram.com (photos, videos, reels, thumbnails) or *.fbcdn.net
  return (
    /^[a-zA-Z0-9.-]+\.cdninstagram\.com$/.test(lower) ||
    /^[a-zA-Z0-9.-]+\.fbcdn\.net$/.test(lower)
  );
}

interface PathMatch {
  shortcode: string;
  contentType: InstagramContentType;
  username?: string;
}

function matchInstagramWebPath(pathname: string): PathMatch | null {
  const cleanPath = pathname.replace(/\/+$/, '');

  // 1. Standard Post: /p/{shortcode}
  const postMatch = cleanPath.match(/^\/p\/([a-zA-Z0-9_-]+)$/);
  if (postMatch) {
    return { shortcode: postMatch[1], contentType: 'post' };
  }

  // 2. Reels: /reel/{shortcode} or /reels/{shortcode}
  const reelMatch = cleanPath.match(/^\/reels?\/([a-zA-Z0-9_-]+)$/);
  if (reelMatch) {
    return { shortcode: reelMatch[1], contentType: 'reel' };
  }

  // 3. TV: /tv/{shortcode}
  const tvMatch = cleanPath.match(/^\/tv\/([a-zA-Z0-9_-]+)$/);
  if (tvMatch) {
    return { shortcode: tvMatch[1], contentType: 'tv' };
  }

  // 4. User-prefixed Post or Reel: /{username}/p/{shortcode} or /{username}/reel/{shortcode}
  const userPostMatch = cleanPath.match(/^\/([a-zA-Z0-9_.]+)\/p\/([a-zA-Z0-9_-]+)$/);
  if (userPostMatch) {
    return { shortcode: userPostMatch[2], username: userPostMatch[1], contentType: 'post' };
  }

  const userReelMatch = cleanPath.match(/^\/([a-zA-Z0-9_.]+)\/reels?\/([a-zA-Z0-9_-]+)$/);
  if (userReelMatch) {
    return { shortcode: userReelMatch[2], username: userReelMatch[1], contentType: 'reel' };
  }

  // 5. User Profile: /{username}
  const profileMatch = cleanPath.match(/^\/([a-zA-Z0-9_.]+)$/);
  if (profileMatch) {
    const candidate = profileMatch[1];
    if (!RESERVED_INSTAGRAM_PATHS.has(candidate.toLowerCase()) && USERNAME_REGEX.test(candidate)) {
      return { shortcode: candidate, username: candidate, contentType: 'profile' };
    }
  }

  return null;
}

/**
 * Robust URL parser and canonicalizer for Instagram media links.
 * Supports standard web posts, Reels, IGTV, verified Meta CDN media URLs, and user profiles.
 */
export function parseInstagramUrl(rawUrl: string): ParsedInstagramUrl {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { valid: false, originalUrl: rawUrl || '', error: 'URL must be a non-empty string' };
  }

  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { valid: false, originalUrl: rawUrl, error: 'URL cannot be empty or blank' };
  }

  // Reject path traversal sequences
  if (trimmed.includes('/../') || trimmed.includes('/..') || trimmed.includes('\\')) {
    return {
      valid: false,
      originalUrl: rawUrl,
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
    return { valid: false, originalUrl: rawUrl, error: 'Malformed URL structure' };
  }

  // 1. Strict protocol check: Only HTTPS permitted
  if (parsed.protocol !== 'https:') {
    return {
      valid: false,
      originalUrl: rawUrl,
      error: 'Only HTTPS URLs are permitted'
    };
  }

  // 2. Embedded authentication credentials rejection
  if (parsed.username || parsed.password) {
    return {
      valid: false,
      originalUrl: rawUrl,
      error: 'Embedded authentication credentials are not permitted'
    };
  }

  // 3. Disallow unexpected custom ports
  if (parsed.port && parsed.port !== '443') {
    return {
      valid: false,
      originalUrl: rawUrl,
      error: 'Non-standard ports are prohibited'
    };
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.+$/, '');

  // 4. Case A: Direct Meta CDN Media Link
  if (isInstagramCdnHostname(hostname)) {
    const pathname = parsed.pathname.toLowerCase();
    let extension: DirectMediaInfo['extension'] = 'unknown';

    if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) {
      extension = 'jpg';
    } else if (pathname.endsWith('.mp4')) {
      extension = 'mp4';
    } else if (pathname.endsWith('.webp')) {
      extension = 'webp';
    }

    const hasCryptoTokens = parsed.searchParams.has('oh') && parsed.searchParams.has('oe');
    const expiresAtUnixHex = parsed.searchParams.get('oe') || undefined;

    // Direct CDN URLs preserve essential query parameters
    return {
      valid: true,
      originalUrl: rawUrl,
      canonicalUrl: `https://${hostname}${parsed.pathname}${parsed.search}`,
      contentType: 'direct_media',
      directMediaInfo: {
        hostname,
        extension,
        hasCryptoTokens,
        expiresAtUnixHex
      }
    };
  }

  // 5. Case B: Official Instagram Web Permalinks & Profiles
  if (!EXACT_ALLOWED_WEB_HOSTS.has(hostname)) {
    return {
      valid: false,
      originalUrl: rawUrl,
      error: `Hostname '${hostname}' is not in the allowed domain list`
    };
  }

  const match = matchInstagramWebPath(parsed.pathname);
  if (!match) {
    return {
      valid: false,
      originalUrl: rawUrl,
      error: 'Unrecognized Instagram path (expected /p/, /reel/, /reels/, /tv/, or valid profile /<username>/)'
    };
  }

  if (match.contentType === 'profile') {
    const canonicalUrl = `https://www.instagram.com/${match.username}/`;
    return {
      valid: true,
      originalUrl: rawUrl,
      canonicalUrl,
      contentType: 'profile',
      username: match.username,
      shortcode: match.username
    };
  }

  if (!SHORTCODE_REGEX.test(match.shortcode)) {
    return {
      valid: false,
      originalUrl: rawUrl,
      error: `Invalid shortcode '${match.shortcode}'. Must be 3-40 alphanumeric characters, underscores, or hyphens.`
    };
  }

  // Canonicalize web URL without tracking parameters
  const pathPrefix = match.contentType === 'reel' ? 'reel' : match.contentType === 'tv' ? 'tv' : 'p';
  const canonicalUrl = `https://www.instagram.com/${pathPrefix}/${match.shortcode}/`;

  return {
    valid: true,
    originalUrl: rawUrl,
    canonicalUrl,
    contentType: match.contentType,
    shortcode: match.shortcode,
    username: match.username
  };
}
