import dns from 'node:dns/promises';
import net from 'node:net';
import { parseInstagramUrl, ParsedInstagramUrl, isInstagramCdnHostname, EXACT_ALLOWED_WEB_HOSTS } from './urlParser.js';

export type InstagramMediaType = 'post' | 'reel' | 'tv' | 'direct_media';

export interface ValidationResult {
  valid: boolean;
  normalizedUrl?: string;
  shortcode?: string;
  mediaType?: InstagramMediaType;
  error?: string;
}

/**
 * Checks whether an IPv4 address falls within private, loopback, link-local,
 * multicast, or cloud-metadata address blocks.
 */
export function isPrivateOrReservedIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) {
    return true; // Malformed IPv4 is treated as unsafe
  }

  const [a, b, c, d] = parts;

  // 0.0.0.0/8 (Current network)
  if (a === 0) return true;

  // 10.0.0.0/8 (Private)
  if (a === 10) return true;

  // 100.64.0.0/10 (Carrier-grade NAT)
  if (a === 100 && b >= 64 && b <= 127) return true;

  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;

  // 169.254.0.0/16 (Link-local & AWS/GCP/Azure Cloud Metadata 169.254.169.254)
  if (a === 169 && b === 254) return true;

  // 172.16.0.0/12 (Private)
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.0.0.0/24 (IETF Protocol Assignments)
  if (a === 192 && b === 0 && c === 0) return true;

  // 192.0.2.0/24 (TEST-NET-1)
  if (a === 192 && b === 0 && c === 2) return true;

  // 192.168.0.0/16 (Private)
  if (a === 192 && b === 168) return true;

  // 198.18.0.0/15 (Network benchmark tests)
  if (a === 198 && b >= 18 && b <= 19) return true;

  // 198.51.100.0/24 (TEST-NET-2)
  if (a === 198 && b === 51 && c === 100) return true;

  // 203.0.113.0/24 (TEST-NET-3)
  if (a === 203 && b === 0 && c === 113) return true;

  // 224.0.0.0/4 (Multicast)
  if (a >= 224 && a <= 239) return true;

  // 240.0.0.0/4 (Reserved / Future use)
  if (a >= 240) return true;

  // 255.255.255.255 (Broadcast)
  if (a === 255 && b === 255 && c === 255 && d === 255) return true;

  return false;
}

/**
 * Checks whether an IPv6 address is loopback, link-local, unique-local,
 * multicast, or IPv4-mapped private.
 */
export function isPrivateOrReservedIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase().trim();

  // IPv6 loopback (::1)
  if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') return true;

  // Unspecified (::)
  if (normalized === '::' || normalized === '0:0:0:0:0:0:0:0') return true;

  // IPv4-mapped IPv6 (::ffff:x.x.x.x)
  if (normalized.startsWith('::ffff:')) {
    const ipv4Part = normalized.replace('::ffff:', '');
    if (net.isIPv4(ipv4Part)) {
      return isPrivateOrReservedIPv4(ipv4Part);
    }
  }

  // Link-local: fe80::/10
  if (normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) {
    return true;
  }

  // Unique local address: fc00::/7 (fc00:: to fdff::)
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) {
    return true;
  }

  // Multicast: ff00::/8
  if (normalized.startsWith('ff')) {
    return true;
  }

  // Documentation: 2001:db8::/32
  if (normalized.startsWith('2001:db8:')) {
    return true;
  }

  return false;
}

/**
 * Validates any IP address (IPv4 or IPv6) against private and dangerous ranges.
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    return isPrivateOrReservedIPv4(ip);
  }
  if (net.isIPv6(ip)) {
    return isPrivateOrReservedIPv6(ip);
  }
  return true; // Unknown IP formats are rejected as unsafe
}

/**
 * Pre-flight DNS resolution to protect against SSRF and DNS rebinding attacks.
 * Resolves the given hostname and asserts that none of the resolved IPs
 * point to internal, private, loopback, or cloud-metadata destinations.
 */
export async function assertSafeDestinationHost(
  hostname: string,
  lookupFn = dns.lookup
): Promise<{ safe: boolean; resolvedIps: string[]; error?: string }> {
  const cleanHost = hostname.toLowerCase().replace(/\.+$/, '');

  // 1. Literal IP check
  if (net.isIP(cleanHost)) {
    if (isPrivateOrReservedIp(cleanHost)) {
      return {
        safe: false,
        resolvedIps: [cleanHost],
        error: `Prohibited destination IP '${cleanHost}' resides in a private, loopback, or reserved range.`
      };
    }
    return { safe: true, resolvedIps: [cleanHost] };
  }

  // 2. DNS resolution check
  try {
    const results = await lookupFn(cleanHost, { all: true });
    if (!results || results.length === 0) {
      return {
        safe: false,
        resolvedIps: [],
        error: `DNS resolution failed: no IP addresses found for '${cleanHost}'`
      };
    }

    const resolvedIps = results.map((r) => r.address);

    for (const ip of resolvedIps) {
      if (isPrivateOrReservedIp(ip)) {
        return {
          safe: false,
          resolvedIps,
          error: `Prohibited destination: hostname '${cleanHost}' resolved to private/reserved IP '${ip}'`
        };
      }
    }

    return { safe: true, resolvedIps };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'DNS lookup error';
    return {
      safe: false,
      resolvedIps: [],
      error: `DNS resolution failed for '${cleanHost}': ${msg}`
    };
  }
}

/**
 * Validates and normalizes Instagram URLs for backend consumption.
 * Supports both web permalinks and direct Meta CDN URLs.
 */
export function validateAndSanitizeUrl(rawUrl: string): ValidationResult {
  const res = parseInstagramUrl(rawUrl);
  if (!res.valid || !res.canonicalUrl) {
    return {
      valid: false,
      error: res.error || 'Invalid or unsupported Instagram URL'
    };
  }

  return {
    valid: true,
    normalizedUrl: res.canonicalUrl,
    shortcode: res.shortcode || 'direct_media',
    mediaType: res.contentType
  };
}
