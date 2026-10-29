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
}

export const config: AppConfig = {
  port: parseInt(process.env.PORT || '3001', 10),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '30', 10),
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  resolverTimeoutMs: parseInt(process.env.RESOLVER_TIMEOUT_MS || '10000', 10),
  maxResponseSizeBytes: parseInt(process.env.MAX_RESPONSE_SIZE_BYTES || '52428800', 10), // 50MB
  allowedHostnames: (process.env.ALLOWED_HOSTNAMES || 'instagram.com,www.instagram.com,cdninstagram.com,instagr.am')
    .split(',')
    .map((h) => h.trim().toLowerCase()),
  corsOrigin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
    : true,
  defaultProvider: (process.env.DEFAULT_PROVIDER as 'mock' | 'oembed' | 'public' | 'authorized' | 'direct') || 'public',
  instagramAppId: process.env.INSTAGRAM_APP_ID?.trim() || undefined,
  instagramClientToken: process.env.INSTAGRAM_CLIENT_TOKEN?.trim() || undefined,
  instagramOembedAccessToken: process.env.INSTAGRAM_OEMBED_ACCESS_TOKEN?.trim() || undefined,
  instagramUserAccessToken: process.env.INSTAGRAM_USER_ACCESS_TOKEN?.trim() || undefined
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

  return {
    valid: errors.length === 0,
    warnings,
    errors
  };
}
