import { safeHttpsRequest } from '../../utils/ssrfClient.js';

export const PINTEREST_PIN_ID_REGEX = /^\d{16,22}$/;

// Canonical supported web hosts
export const EXACT_ALLOWED_PINTEREST_HOSTS = new Set([
  'pinterest.com',
  'www.pinterest.com',
  'm.pinterest.com',
  'pin.it'
]);

// Known regional ccTLDs
export const PINTEREST_CCTLD_REGEX = /^([a-z]{2,5}\.)?pinterest\.(co\.uk|ca|de|fr|com\.au|es|it|jp|co\.kr|ch|at|co\.nz|ie|se|pt)$/;

export const EXACT_ALLOWED_PINTEREST_DOWNLOAD_HOSTS = new Set([
  'i.pinimg.com'
]);

/**
 * Checks whether a hostname belongs to Pinterest's web domain network.
 */
export function isAllowedPinterestHost(hostname: string): boolean {
  const clean = hostname.toLowerCase().replace(/\.+$/, '');
  if (EXACT_ALLOWED_PINTEREST_HOSTS.has(clean)) {
    return true;
  }
  // Allow *.pinterest.com subdomains (e.g. in.pinterest.com, br.pinterest.com)
  if (clean.endsWith('.pinterest.com') && !clean.includes('..')) {
    return true;
  }
  // Allow recognized regional ccTLDs (e.g. pinterest.co.uk, www.pinterest.ca)
  if (PINTEREST_CCTLD_REGEX.test(clean)) {
    return true;
  }
  return false;
}

/**
 * Validates redirect destination hostnames for shortlink traversal.
 * Restricts traversal to pin.it, api.pinterest.com, and official pinterest web domains.
 */
export function isAllowedPinterestRedirectHost(hostname: string): boolean {
  const clean = hostname.toLowerCase().replace(/\.+$/, '');
  if (clean === 'pin.it' || clean === 'api.pinterest.com') {
    return true;
  }
  return isAllowedPinterestHost(clean);
}

export interface ParsedPinResult {
  pinId: string;
  canonicalUrl: string;
}

export class PinterestUrlParser {
  /**
   * Deterministically parses a Pin ID from a direct Pinterest URL.
   */
  parsePinId(url: string | URL): ParsedPinResult | null {
    let parsed: URL;
    try {
      parsed = typeof url === 'string' ? new URL(url) : url;
    } catch {
      return null;
    }

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null;
    }

    if (!isAllowedPinterestHost(parsed.hostname)) {
      return null;
    }

    // Match /pin/{id} or /pin/{id}/
    const match = parsed.pathname.match(/^\/pin\/(\d+)\/?$/);
    if (!match) {
      return null;
    }

    const pinId = match[1];
    if (!PINTEREST_PIN_ID_REGEX.test(pinId)) {
      return null;
    }

    return {
      pinId,
      canonicalUrl: `https://www.pinterest.com/pin/${pinId}/`
    };
  }

  /**
   * Safely resolves a pin.it shortlink to its target canonical Pin URL.
   * Traverses redirects through Snapora's connection-pinned, SSRF-safe HTTP client.
   */
  async resolveShortLink(
    shortUrl: string,
    options?: { timeoutMs?: number; maxRedirects?: number; signal?: AbortSignal }
  ): Promise<ParsedPinResult> {
    let parsed: URL;
    try {
      parsed = new URL(shortUrl);
    } catch {
      const err = new Error('INVALID_URL: Malformed short-link URL');
      (err as any).code = 'INVALID_URL';
      throw err;
    }

    if (parsed.protocol !== 'https:') {
      const err = new Error('SSRF_BLOCKED: Only HTTPS destinations are permitted for shortlink resolution');
      (err as any).code = 'SSRF_BLOCKED';
      throw err;
    }

    const hostname = parsed.hostname.toLowerCase().replace(/\.+$/, '');
    if (hostname !== 'pin.it') {
      const err = new Error(`INVALID_URL: Short-link host '${hostname}' must be pin.it`);
      (err as any).code = 'INVALID_URL';
      throw err;
    }

    const shortcode = parsed.pathname.replace(/^\/+|\/+$/g, '');
    if (!/^[a-zA-Z0-9_-]{3,20}$/.test(shortcode)) {
      const err = new Error(`INVALID_PIN_ID: Malformed pin.it shortcode '${shortcode}'`);
      (err as any).code = 'INVALID_PIN_ID';
      throw err;
    }

    // Execute SSRF-safe HEAD traversal through safeHttpsRequest
    const safeResponse = await safeHttpsRequest(shortUrl, {
      method: 'HEAD',
      maxRedirects: options?.maxRedirects ?? 5,
      timeoutMs: options?.timeoutMs ?? 10000,
      signal: options?.signal,
      allowedHostsValidator: isAllowedPinterestRedirectHost
    });

    // Close underlying stream immediately
    safeResponse.stream.destroy();

    const finalUrl = safeResponse.finalUrl;
    const parsedPin = this.parsePinId(finalUrl);

    if (!parsedPin) {
      // If the shortlink redirected to home or an unexpected path (e.g. deleted or invalid pin)
      const err = new Error(`PINTEREST_REDIRECT_REJECTED: Shortlink resolved to non-Pin URL: '${finalUrl}'`);
      (err as any).code = 'PINTEREST_REDIRECT_REJECTED';
      throw err;
    }

    return parsedPin;
  }
}

export const pinterestUrlParser = new PinterestUrlParser();
