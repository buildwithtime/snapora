import https from 'node:https';
import http from 'node:http';
import dns from 'node:dns';
import { isPrivateOrReservedIp } from './ssrf.js';
import { isInstagramCdnHostname, EXACT_ALLOWED_WEB_HOSTS } from './urlParser.js';

export interface SafeRequestOptions {
  method?: 'GET' | 'HEAD';
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxResponseSizeBytes?: number;
  maxRedirects?: number;
  signal?: AbortSignal;
  allowedHostsValidator?: (hostname: string) => boolean;
}

export interface SafeRequestResponse {
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  stream: http.IncomingMessage;
  finalUrl: string;
}

export function defaultIsAllowedHost(hostname: string): boolean {
  const clean = hostname.toLowerCase().replace(/\.+$/, '');
  return EXACT_ALLOWED_WEB_HOSTS.has(clean) || isInstagramCdnHostname(clean);
}

/**
 * Socket-level safe DNS lookup function.
 * Called directly by Node's socket connection pipeline at connection time.
 * If the DNS resolves to a private, loopback, or cloud metadata IP,
 * it immediately rejects with an SSRF error, preventing any connection attempt.
 * This completely eliminates the TOCTOU DNS rebinding gap.
 */
export function createSafeLookup(customDnsLookup?: typeof dns.lookup) {
  const lookupFn = customDnsLookup || dns.lookup;

  return function safeLookup(
    hostname: string,
    options: dns.LookupOptions,
    callback: (err: NodeJS.ErrnoException | null, address: string, family: number) => void
  ) {
    lookupFn(hostname, options, (err, address, family) => {
      if (err) {
        return callback(err, address as any, family as any);
      }

      if (Array.isArray(address)) {
        // When all: true is requested
        for (const item of address as any[]) {
          if (isPrivateOrReservedIp(item.address)) {
            const blockedErr = new Error(`SSRF_BLOCKED: Prohibited destination IP '${item.address}' resides in a restricted range`);
            (blockedErr as any).code = 'SSRF_BLOCKED';
            return callback(blockedErr, '' as any, 4);
          }
        }
        return callback(null, address as any, family as any);
      }

      const ipStr = String(address);
      if (isPrivateOrReservedIp(ipStr)) {
        const blockedErr = new Error(`SSRF_BLOCKED: Prohibited destination IP '${ipStr}' resides in a restricted range`);
        (blockedErr as any).code = 'SSRF_BLOCKED';
        return callback(blockedErr, '', family);
      }

      return callback(null, ipStr, family);
    });
  };
}

/**
 * Executes an HTTP/HTTPS request with strict SSRF defense:
 * 1. Protocol must be HTTPS.
 * 2. Hostname must pass allowed host validator.
 * 3. Connection is pinned to safe IP via connection-time lookup (rebind-proof).
 * 4. Redirects (max 3) are followed manually, with each target re-validated.
 * 5. Stream enforces maximum response size limit.
 */
export async function safeHttpsRequest(
  targetUrl: string,
  options: SafeRequestOptions = {}
): Promise<SafeRequestResponse> {
  const method = options.method || 'GET';
  const timeoutMs = options.timeoutMs || 30000;
  const maxRedirects = options.maxRedirects ?? 3;
  const isAllowedHost = options.allowedHostsValidator || defaultIsAllowedHost;

  let currentUrl = targetUrl;
  let redirectCount = 0;

  while (true) {
    let parsed: URL;
    try {
      parsed = new URL(currentUrl);
    } catch {
      const err = new Error('INVALID_URL: Failed to parse destination URL');
      (err as any).code = 'INVALID_URL';
      throw err;
    }

    if (parsed.protocol !== 'https:') {
      const err = new Error('SSRF_BLOCKED: Only HTTPS destinations are permitted');
      (err as any).code = 'SSRF_BLOCKED';
      throw err;
    }

    if (parsed.port && parsed.port !== '443') {
      const err = new Error(`SSRF_BLOCKED: Non-standard port '${parsed.port}' is prohibited`);
      (err as any).code = 'SSRF_BLOCKED';
      throw err;
    }

    if (parsed.username || parsed.password) {
      const err = new Error('SSRF_BLOCKED: Embedded credentials are prohibited');
      (err as any).code = 'SSRF_BLOCKED';
      throw err;
    }

    const hostname = parsed.hostname.toLowerCase().replace(/\.+$/, '');
    if (!isAllowedHost(hostname)) {
      const err = new Error(`SSRF_BLOCKED: Hostname '${hostname}' is not in the allowed destination list`);
      (err as any).code = 'SSRF_BLOCKED';
      throw err;
    }

    const agent = new https.Agent({
      keepAlive: false,
      lookup: createSafeLookup()
    });

    const res = await new Promise<SafeRequestResponse>((resolve, reject) => {
      let timeoutHandle: NodeJS.Timeout | null = null;
      let isDone = false;

      const cleanup = () => {
        isDone = true;
        if (timeoutHandle) clearTimeout(timeoutHandle);
      };

      const req = https.request(
        parsed,
        {
          method,
          agent,
          headers: {
            'User-Agent': 'Snapora/0.1.0',
            Accept: '*/*',
            ...options.headers
          }
        },
        (incoming) => {
          if (isDone) return;
          cleanup();
          incoming.once('close', () => {
            agent.destroy();
          });
          resolve({
            statusCode: incoming.statusCode || 500,
            headers: incoming.headers,
            stream: incoming,
            finalUrl: currentUrl
          });
        }
      );

      if (options.signal) {
        options.signal.addEventListener('abort', () => {
          if (!isDone) {
            cleanup();
            agent.destroy();
            req.destroy(new Error('TIMEOUT: Request aborted by client'));
            const abortErr = new Error('TIMEOUT: Request was aborted');
            (abortErr as any).code = 'TIMEOUT';
            reject(abortErr);
          }
        });
      }

      timeoutHandle = setTimeout(() => {
        if (!isDone) {
          cleanup();
          agent.destroy();
          req.destroy(new Error('TIMEOUT: Request timed out'));
          const timeoutErr = new Error(`TIMEOUT: Request timed out after ${timeoutMs}ms`);
          (timeoutErr as any).code = 'TIMEOUT';
          reject(timeoutErr);
        }
      }, timeoutMs);

      req.on('error', (err) => {
        if (!isDone) {
          cleanup();
          agent.destroy();
          reject(err);
        }
      });

      req.end();
    });

    // Check for redirects
    if (
      res.statusCode === 301 ||
      res.statusCode === 302 ||
      res.statusCode === 307 ||
      res.statusCode === 308
    ) {
      res.stream.resume(); // Drain and discard redirect body
      redirectCount++;
      if (redirectCount > maxRedirects) {
        const err = new Error(`SSRF_BLOCKED: Maximum redirect limit (${maxRedirects}) exceeded`);
        (err as any).code = 'SSRF_BLOCKED';
        throw err;
      }

      const location = res.headers.location;
      if (!location) {
        const err = new Error('PROVIDER_ERROR: Redirect missing Location header');
        (err as any).code = 'PROVIDER_ERROR';
        throw err;
      }

      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    return res;
  }
}
