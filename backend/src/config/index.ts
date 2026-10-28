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
  defaultProvider: 'mock' | 'public';
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
  defaultProvider: (process.env.DEFAULT_PROVIDER as 'mock' | 'public') || 'mock'
};
