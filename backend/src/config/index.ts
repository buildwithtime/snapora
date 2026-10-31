export interface AppConfig {
  port: number;
  host: string;
  nodeEnv: string;
  rateLimitMax: number;
  rateLimitWindowMs: number;
  resolverTimeoutMs: number;
  maxResponseSizeBytes: number;
  allowedHostnames: string[];
  corsOrigin: string[] | boolean;
  defaultProvider: 'mock' | 'oembed' | 'public' | 'authorized' | 'direct';
  instagramAppId?: string;
  instagramClientToken?: string;
  instagramOembedAccessToken?: string;
  instagramUserAccessToken?: string;
  instagramGraphApiVersion?: string;
}

export const DEFAULT_PRODUCTION_ORIGIN = 'https://snapora-1r3i.onrender.com';

/**
 * Safely parses and normalizes an origin string into a canonical scheme://host[:port].
 * Rejects invalid URLs, 'null' origins, non-HTTP/HTTPS protocols, and wildcards in production.
 * Strips paths, query parameters, fragments, trailing slashes, and embedded credentials.
 */
export function sanitizeOrigin(originStr: string, isProduction: boolean = false): string | null {
  if (!originStr || typeof originStr !== 'string') return null;
  const trimmed = originStr.trim();
  if (!trimmed) return null;

  if (trimmed === '*') {
    return isProduction ? null : '*';
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    if (parsed.origin === 'null' || !parsed.origin) {
      return null;
    }
    // In production, enforce HTTPS for non-localhost hosts
    if (isProduction && parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

/**
 * Resolves CORS origin configuration securely:
 * - Production: Defaults strictly to the verified production domain ('https://snapora-1r3i.onrender.com').
 *   Wildcard '*' is prohibited as default. Preview origins (e.g. Render PR previews) must be explicitly listed.
 * - Development & Test: Defaults to true (permissive) to allow local developer iteration across ports.
 */
export function resolveCorsOrigin(
  nodeEnv: string,
  corsOriginEnv?: string,
  previewOriginsEnv?: string
): string[] | boolean {
  const isProd = nodeEnv === 'production';

  const parseOrigins = (raw?: string): string[] => {
    if (!raw) return [];
    return raw
      .split(',')
      .map((entry) => sanitizeOrigin(entry, isProd))
      .filter((origin): origin is string => origin !== null);
  };

  if (corsOriginEnv) {
    const rawTrimmed = corsOriginEnv.trim();
    if (!isProd && rawTrimmed === '*') {
      return true;
    }
    const origins = parseOrigins(corsOriginEnv);
    const previewOrigins = parseOrigins(previewOriginsEnv);
    const combined = Array.from(new Set([...origins, ...previewOrigins]));
    if (combined.length > 0) {
      return combined;
    }
    // If all configured origins were invalid or rejected wildcards in production,
    // fallback safely to canonical production origin.
    return isProd ? [DEFAULT_PRODUCTION_ORIGIN] : true;
  }

  if (isProd) {
    const prodOrigins = [DEFAULT_PRODUCTION_ORIGIN];
    const previewOrigins = parseOrigins(previewOriginsEnv);
    return Array.from(new Set([...prodOrigins, ...previewOrigins]));
  }

  return true;
}

export const config: AppConfig = {
  port: parseInt(process.env.PORT || '3001', 10),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '30', 10),
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  resolverTimeoutMs: parseInt(process.env.RESOLVER_TIMEOUT_MS || '10000', 10),
  maxResponseSizeBytes: parseInt(process.env.MAX_RESPONSE_SIZE_BYTES || '157286400', 10), // 150MB
  allowedHostnames: (process.env.ALLOWED_HOSTNAMES || 'instagram.com,www.instagram.com,cdninstagram.com,instagr.am')
    .split(',')
    .map((h) => h.trim().toLowerCase()),
  corsOrigin: resolveCorsOrigin(
    process.env.NODE_ENV || 'development',
    process.env.CORS_ORIGIN,
    process.env.CORS_PREVIEW_ORIGINS
  ),
  defaultProvider: (process.env.DEFAULT_PROVIDER as 'mock' | 'oembed' | 'public' | 'authorized' | 'direct') || 'public',
  instagramAppId: process.env.INSTAGRAM_APP_ID?.trim() || undefined,
  instagramClientToken: process.env.INSTAGRAM_CLIENT_TOKEN?.trim() || undefined,
  instagramOembedAccessToken: process.env.INSTAGRAM_OEMBED_ACCESS_TOKEN?.trim() || undefined,
  instagramUserAccessToken: process.env.INSTAGRAM_USER_ACCESS_TOKEN?.trim() || undefined,
  instagramGraphApiVersion: process.env.INSTAGRAM_GRAPH_API_VERSION?.trim() || 'v21.0'
};

export interface ConfigValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
}

/**
 * Validates configuration at application startup and reports any missing credentials
 * or unsupported settings without crashing the server.
 */
export function validateStartupConfig(cfg: AppConfig = config): ConfigValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Check oEmbed credentials if oEmbed is selected as default provider
  if (cfg.defaultProvider === 'oembed') {
    const hasComposite = Boolean(cfg.instagramAppId && cfg.instagramClientToken);
    const hasExplicitToken = Boolean(cfg.instagramOembedAccessToken);
    if (!hasComposite && !hasExplicitToken) {
      warnings.push(
        "DEFAULT_PROVIDER is set to 'oembed', but neither (INSTAGRAM_APP_ID and INSTAGRAM_CLIENT_TOKEN) nor INSTAGRAM_OEMBED_ACCESS_TOKEN is configured in the environment. Official live Instagram oEmbed resolution will fail until credentials are provided."
      );
    }
  }

  // Check user access token if authorized account media is selected as default provider
  if (cfg.defaultProvider === 'authorized') {
    if (!cfg.instagramUserAccessToken) {
      warnings.push(
        "DEFAULT_PROVIDER is set to 'authorized', but INSTAGRAM_USER_ACCESS_TOKEN is not configured in the environment. Instagram Graph API user media resolution will require authentication."
      );
    }
  }

  // Validate port range
  if (isNaN(cfg.port) || cfg.port <= 0 || cfg.port > 65535) {
    errors.push(`Configured PORT '${cfg.port}' is not a valid TCP port number (1-65535).`);
  }

  // Validate timeout
  if (isNaN(cfg.resolverTimeoutMs) || cfg.resolverTimeoutMs < 1000) {
    warnings.push(`RESOLVER_TIMEOUT_MS (${cfg.resolverTimeoutMs}ms) is unusually low; network requests may time out prematurely.`);
  }

  // Validate CORS configuration in production
  if (cfg.nodeEnv === 'production') {
    if (cfg.corsOrigin === true || (Array.isArray(cfg.corsOrigin) && cfg.corsOrigin.includes('*'))) {
      warnings.push(
        "CORS_ORIGIN is configured with wildcard '*' in production. This allows arbitrary cross-origin requests and should be restricted to verified production domains."
      );
    }
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors
  };
}
