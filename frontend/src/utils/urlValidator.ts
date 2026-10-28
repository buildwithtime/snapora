export interface ParsedUrlResult {
  valid: boolean;
  originalUrl: string;
  normalizedUrl?: string;
  shortcode?: string;
  error?: string;
}

const ALLOWED_HOSTS = ['instagram.com', 'www.instagram.com', 'instagr.am'];

const PATTERNS = [
  /^\/p\/([a-zA-Z0-9_-]+)/,
  /^\/reel\/([a-zA-Z0-9_-]+)/,
  /^\/tv\/([a-zA-Z0-9_-]+)/,
  /^\/[a-zA-Z0-9_.]+\/p\/([a-zA-Z0-9_-]+)/
];

export function parseInstagramUrl(rawUrl: string): ParsedUrlResult {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { valid: false, originalUrl: rawUrl, error: 'Empty URL' };
  }

  let parsed: URL;
  try {
    // If protocol is missing, prepend https://
    const urlWithProtocol = trimmed.startsWith('http://') || trimmed.startsWith('https://')
      ? trimmed
      : `https://${trimmed}`;

    parsed = new URL(urlWithProtocol);
  } catch {
    return { valid: false, originalUrl: rawUrl, error: 'Malformed URL structure' };
  }

  const hostname = parsed.hostname.toLowerCase();
  const isAllowedHost = ALLOWED_HOSTS.some(
    (host) => hostname === host || hostname.endsWith(`.${host}`)
  );

  if (!isAllowedHost) {
    return {
      valid: false,
      originalUrl: rawUrl,
      error: `Unsupported domain: ${hostname}. Only Instagram URLs are supported.`
    };
  }

  const pathname = parsed.pathname;
  let shortcode: string | undefined;

  for (const pattern of PATTERNS) {
    const match = pathname.match(pattern);
    if (match && match[1]) {
      shortcode = match[1];
      break;
    }
  }

  if (!shortcode) {
    return {
      valid: false,
      originalUrl: rawUrl,
      error: 'Unrecognized Instagram path (expected /p/, /reel/, or /tv/)'
    };
  }

  const normalizedUrl = `https://www.instagram.com/p/${shortcode}/`;

  return {
    valid: true,
    originalUrl: rawUrl,
    normalizedUrl,
    shortcode
  };
}

export function parseBatchUrls(text: string): {
  valid: Array<{ url: string; normalizedUrl: string; shortcode: string }>;
  invalid: Array<{ url: string; error: string }>;
} {
  const lines = text
    .split(/[\r\n,]+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const valid: Array<{ url: string; normalizedUrl: string; shortcode: string }> = [];
  const invalid: Array<{ url: string; error: string }> = [];
  const seenShortcodes = new Set<string>();

  for (const line of lines) {
    const res = parseInstagramUrl(line);
    if (res.valid && res.normalizedUrl && res.shortcode) {
      if (!seenShortcodes.has(res.shortcode)) {
        seenShortcodes.add(res.shortcode);
        valid.push({
          url: res.originalUrl,
          normalizedUrl: res.normalizedUrl,
          shortcode: res.shortcode
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
