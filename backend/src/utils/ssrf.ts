import { config } from '../config/index.js';

export interface ValidationResult {
  valid: boolean;
  normalizedUrl?: string;
  shortcode?: string;
  error?: string;
}

const SUPPORTED_PATH_PATTERNS = [
  /^\/p\/([a-zA-Z0-9_-]+)/,
  /^\/reel\/([a-zA-Z0-9_-]+)/,
  /^\/tv\/([a-zA-Z0-9_-]+)/,
  /^\/[a-zA-Z0-9_.]+\/p\/([a-zA-Z0-9_-]+)/
];

export function validateAndSanitizeUrl(rawUrl: string): ValidationResult {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { valid: false, error: 'URL must be a non-empty string' };
  }

  const trimmed = rawUrl.trim();

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  // 1. Protocol check: strict HTTPS
  if (parsed.protocol !== 'https:') {
    return { valid: false, error: 'Only HTTPS URLs are permitted' };
  }

  // 2. Embedded authentication credentials rejection
  if (parsed.username || parsed.password) {
    return { valid: false, error: 'Embedded authentication credentials are not permitted' };
  }

  // 3. Hostname check & normalization (strip trailing dots)
  const hostname = parsed.hostname.toLowerCase().replace(/\.+$/, '');
  const isAllowed = config.allowedHostnames.some(
    (allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`)
  );

  if (!isAllowed) {
    return {
      valid: false,
      error: `Hostname '${hostname}' is not in the allowed domain list`
    };
  }

  // 4. Disallow port numbers other than standard 443
  if (parsed.port && parsed.port !== '443') {
    return { valid: false, error: 'Non-standard ports are prohibited' };
  }

  // 5. Path matching & shortcode extraction
  const pathname = parsed.pathname;
  let shortcode: string | undefined;

  for (const pattern of SUPPORTED_PATH_PATTERNS) {
    const match = pathname.match(pattern);
    if (match && match[1]) {
      shortcode = match[1];
      break;
    }
  }

  if (!shortcode) {
    return {
      valid: false,
      error: 'URL does not match supported post, reel, or TV pattern (/p/, /reel/, /tv/)'
    };
  }

  // Strict alphanumeric shortcode sanity check (defense-in-depth against injection)
  if (!/^[a-zA-Z0-9_-]+$/.test(shortcode)) {
    return {
      valid: false,
      error: 'Invalid shortcode characters'
    };
  }

  // Build clean canonical URL - strips all query params, hashes, and custom paths
  const normalizedUrl = `https://www.instagram.com/p/${shortcode}/`;

  return {
    valid: true,
    normalizedUrl,
    shortcode
  };
}
