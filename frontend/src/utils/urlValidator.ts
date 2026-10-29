export type InstagramMediaType = 'post' | 'reel' | 'tv' | 'direct_media';

export interface DirectMediaInfo {
  hostname: string;
  extension: 'jpg' | 'jpeg' | 'mp4' | 'webp' | 'unknown';
  hasCryptoTokens: boolean;
  expiresAtUnixHex?: string;
}

export interface ParsedUrlResult {
  valid: boolean;
  originalUrl: string;
  normalizedUrl?: string;
  shortcode?: string;
  mediaType?: InstagramMediaType;
  directMediaInfo?: DirectMediaInfo;
  error?: string;
}

// Exactly supported official Instagram domains for media content
export const EXACT_ALLOWED_HOSTS = new Set([
  'instagram.com',
  'www.instagram.com',
  'm.instagram.com',
  'instagr.am'
]);

// Valid shortcode regex: Base64URL-style characters between 3 and 40 chars
export const SHORTCODE_REGEX = /^[a-zA-Z0-9_-]{3,40}$/;

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

export function isInstagramCdnHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase().replace(/\.+$/, '');
  return (
    /^scontent[a-zA-Z0-9.-]*\.cdninstagram\.com$/.test(lower) ||
    /^[a-zA-Z0-9.-]*\.fbcdn\.net$/.test(lower)
  );
}

interface PathMatch {
  shortcode: string;
  mediaType: InstagramMediaType;
}

function matchInstagramPath(pathname: string): PathMatch | null {
  // Normalize path by stripping trailing slashes for regex testing
  const cleanPath = pathname.replace(/\/+$/, '');

  // 1. Standard Post: /p/{shortcode}
  const postMatch = cleanPath.match(/^\/p\/([a-zA-Z0-9_-]+)$/);
  if (postMatch) {
    return { shortcode: postMatch[1], mediaType: 'post' };
  }

  // 2. Reels: /reel/{shortcode} or /reels/{shortcode}
  const reelMatch = cleanPath.match(/^\/reels?\/([a-zA-Z0-9_-]+)$/);
  if (reelMatch) {
    return { shortcode: reelMatch[1], mediaType: 'reel' };
  }

  // 3. TV: /tv/{shortcode}
  const tvMatch = cleanPath.match(/^\/tv\/([a-zA-Z0-9_-]+)$/);
  if (tvMatch) {
    return { shortcode: tvMatch[1], mediaType: 'tv' };
  }

  // 4. User-prefixed Post or Reel: /{username}/p/{shortcode} or /{username}/reel/{shortcode}
  const userPostMatch = cleanPath.match(/^\/[a-zA-Z0-9_.]+\/p\/([a-zA-Z0-9_-]+)$/);
  if (userPostMatch) {
    return { shortcode: userPostMatch[1], mediaType: 'post' };
  }

  const userReelMatch = cleanPath.match(/^\/[a-zA-Z0-9_.]+\/reels?\/([a-zA-Z0-9_-]+)$/);
  if (userReelMatch) {
    return { shortcode: userReelMatch[1], mediaType: 'reel' };
  }

  return null;
}

export function parseInstagramUrl(rawUrl: string): ParsedUrlResult {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { valid: false, originalUrl: rawUrl || '', error: 'Empty URL' };
  }

  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { valid: false, originalUrl: rawUrl, error: 'Empty URL' };
  }

  let parsed: URL;
  try {
    const urlWithProtocol = trimmed.startsWith('http://') || trimmed.startsWith('https://')
      ? trimmed
      : `https://${trimmed}`;

    parsed = new URL(urlWithProtocol);
  } catch {
    return { valid: false, originalUrl: rawUrl, error: 'Malformed URL structure' };
  }

  // 1. Disallow embedded credentials (e.g. user:pass@instagram.com)
  if (parsed.username || parsed.password) {
    return {
      valid: false,
      originalUrl: rawUrl,
      error: 'URLs containing embedded credentials are prohibited'
    };
  }

  // 2. Disallow unexpected custom ports
  if (parsed.port && parsed.port !== '443' && parsed.port !== '80') {
    return {
      valid: false,
      originalUrl: rawUrl,
      error: `Non-standard port '${parsed.port}' is not permitted`
    };
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.+$/, '');

  // 3. Direct Meta CDN Media Link
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

    return {
      valid: true,
      originalUrl: rawUrl,
      normalizedUrl: `https://${hostname}${parsed.pathname}${parsed.search}`,
      shortcode: parsed.pathname.split('/').filter(Boolean).pop() || 'direct_media',
      mediaType: 'direct_media',
      directMediaInfo: {
        hostname,
        extension,
        hasCryptoTokens,
        expiresAtUnixHex
      }
    };
  }

  // 4. Strict hostname allowlist check (reject deceptive subdomains or lookalikes)
  if (!EXACT_ALLOWED_HOSTS.has(hostname)) {
    return {
      valid: false,
      originalUrl: rawUrl,
      error: `Unsupported domain '${hostname}'. Only official Instagram domains (instagram.com, www.instagram.com, m.instagram.com, instagr.am) are supported.`
    };
  }

  // 5. Path and media type matching
  const match = matchInstagramPath(parsed.pathname);
  if (!match) {
    return {
      valid: false,
      originalUrl: rawUrl,
      error: 'Unrecognized Instagram path (expected /p/, /reel/, /reels/, or /tv/)'
    };
  }

  // 6. Shortcode sanity check
  if (!SHORTCODE_REGEX.test(match.shortcode)) {
    return {
      valid: false,
      originalUrl: rawUrl,
      error: `Invalid shortcode '${match.shortcode}'. Must be 3-40 alphanumeric characters, underscores, or hyphens.`
    };
  }

  // 7. Build consistent canonical normalized URL (clean of query params and hash fragments)
  const pathPrefix = match.mediaType === 'reel' ? 'reel' : match.mediaType === 'tv' ? 'tv' : 'p';
  const normalizedUrl = `https://www.instagram.com/${pathPrefix}/${match.shortcode}/`;

  return {
    valid: true,
    originalUrl: rawUrl,
    normalizedUrl,
    shortcode: match.shortcode,
    mediaType: match.mediaType
  };
}

export function parseBatchUrls(text: string): {
  valid: Array<{ url: string; normalizedUrl: string; shortcode: string; mediaType: InstagramMediaType }>;
  invalid: Array<{ url: string; error: string }>;
} {
  const lines = text
    .split(/(?:\r?\n|,|\s)+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const valid: Array<{ url: string; normalizedUrl: string; shortcode: string; mediaType: InstagramMediaType }> = [];
  const invalid: Array<{ url: string; error: string }> = [];
  const seenUrls = new Set<string>();

  for (const line of lines) {
    const res = parseInstagramUrl(line);
    if (res.valid && res.normalizedUrl && res.shortcode && res.mediaType) {
      if (!seenUrls.has(res.normalizedUrl)) {
        seenUrls.add(res.normalizedUrl);
        valid.push({
          url: res.originalUrl,
          normalizedUrl: res.normalizedUrl,
          shortcode: res.shortcode,
          mediaType: res.mediaType
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
