import { describe, it, expect } from 'vitest';
import {
  validateStartupConfig,
  resolveCorsOrigin,
  sanitizeOrigin,
  DEFAULT_PRODUCTION_ORIGIN,
  AppConfig
} from './index.js';

describe('Configuration Validation Suite', () => {
  it('validates default mock provider configuration without errors or warnings', () => {
    const mockCfg: AppConfig = {
      port: 3001,
      host: '0.0.0.0',
      nodeEnv: 'test',
      rateLimitMax: 30,
      rateLimitWindowMs: 60000,
      resolverTimeoutMs: 10000,
      maxResponseSizeBytes: 52428800,
      allowedHostnames: ['instagram.com'],
      corsOrigin: true,
      defaultProvider: 'mock'
    };

    const res = validateStartupConfig(mockCfg);
    expect(res.valid).toBe(true);
    expect(res.warnings).toHaveLength(0);
    expect(res.errors).toHaveLength(0);
  });

  it('warns when defaultProvider is oembed but credentials are missing', () => {
    const oembedCfg: AppConfig = {
      port: 3001,
      host: '0.0.0.0',
      nodeEnv: 'test',
      rateLimitMax: 30,
      rateLimitWindowMs: 60000,
      resolverTimeoutMs: 10000,
      maxResponseSizeBytes: 52428800,
      allowedHostnames: ['instagram.com'],
      corsOrigin: true,
      defaultProvider: 'oembed'
    };

    const res = validateStartupConfig(oembedCfg);
    expect(res.valid).toBe(true);
    expect(res.warnings).toHaveLength(1);
    expect(res.warnings[0]).toContain('DEFAULT_PROVIDER is set to \'oembed\'');
  });

  it('warns when defaultProvider is authorized but user token is missing', () => {
    const authCfg: AppConfig = {
      port: 3001,
      host: '0.0.0.0',
      nodeEnv: 'test',
      rateLimitMax: 30,
      rateLimitWindowMs: 60000,
      resolverTimeoutMs: 10000,
      maxResponseSizeBytes: 52428800,
      allowedHostnames: ['instagram.com'],
      corsOrigin: true,
      defaultProvider: 'authorized'
    };

    const res = validateStartupConfig(authCfg);
    expect(res.valid).toBe(true);
    expect(res.warnings).toHaveLength(1);
    expect(res.warnings[0]).toContain('DEFAULT_PROVIDER is set to \'authorized\'');
  });

  it('reports errors when configured port is out of range', () => {
    const invalidPortCfg: AppConfig = {
      port: 70000,
      host: '0.0.0.0',
      nodeEnv: 'test',
      rateLimitMax: 30,
      rateLimitWindowMs: 60000,
      resolverTimeoutMs: 10000,
      maxResponseSizeBytes: 52428800,
      allowedHostnames: ['instagram.com'],
      corsOrigin: true,
      defaultProvider: 'mock'
    };

    const res = validateStartupConfig(invalidPortCfg);
    expect(res.valid).toBe(false);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]).toContain('not a valid TCP port');
  });

  it('warns when production environment is configured with permissive wildcard CORS origin', () => {
    const prodWildcardCfg: AppConfig = {
      port: 3001,
      host: '0.0.0.0',
      nodeEnv: 'production',
      rateLimitMax: 30,
      rateLimitWindowMs: 60000,
      resolverTimeoutMs: 10000,
      maxResponseSizeBytes: 52428800,
      allowedHostnames: ['instagram.com'],
      corsOrigin: true,
      defaultProvider: 'mock'
    };

    const res = validateStartupConfig(prodWildcardCfg);
    expect(res.valid).toBe(true);
    expect(res.warnings).toHaveLength(1);
    expect(res.warnings[0]).toContain("CORS_ORIGIN is configured with wildcard '*' in production");
  });
});

describe('CORS Origin Resolution Suite', () => {
  it('resolves production origin strictly to Render production URL when no env override is provided', () => {
    const origins = resolveCorsOrigin('production', undefined, undefined);
    expect(origins).toEqual([DEFAULT_PRODUCTION_ORIGIN]);
    expect(origins).not.toBe(true);
  });

  it('supports explicitly approved preview origins alongside production origin', () => {
    const origins = resolveCorsOrigin('production', undefined, 'https://snapora-pr-42.onrender.com, https://preview.example.com');
    expect(origins).toEqual([
      DEFAULT_PRODUCTION_ORIGIN,
      'https://snapora-pr-42.onrender.com',
      'https://preview.example.com'
    ]);
  });

  it('supports custom comma-delimited CORS_ORIGIN override', () => {
    const origins = resolveCorsOrigin('production', 'https://mycustomapp.com, https://sub.mycustomapp.com', undefined);
    expect(origins).toEqual(['https://mycustomapp.com', 'https://sub.mycustomapp.com']);
  });

  it('returns true (permissive) in development or test environments for local iteration', () => {
    expect(resolveCorsOrigin('development', undefined, undefined)).toBe(true);
    expect(resolveCorsOrigin('test', undefined, undefined)).toBe(true);
  });

  it('normalizes origins with paths, query params, and trailing slashes to canonical origins', () => {
    const origins = resolveCorsOrigin(
      'production',
      'https://mycustomapp.com/path?foo=bar, https://sub.mycustomapp.com:8443/',
      undefined
    );
    expect(origins).toEqual(['https://mycustomapp.com', 'https://sub.mycustomapp.com:8443']);
  });

  it('safely rejects wildcards in production and falls back to default production origin', () => {
    const origins = resolveCorsOrigin('production', '*', undefined);
    expect(origins).toEqual([DEFAULT_PRODUCTION_ORIGIN]);
  });

  it('filters out invalid URLs, non-HTTP protocols, and insecure HTTP preview origins in production', () => {
    const origins = resolveCorsOrigin(
      'production',
      undefined,
      'invalid-origin, http://insecure.example.com, javascript:alert(1), https://preview.example.com/, *'
    );
    expect(origins).toEqual([
      DEFAULT_PRODUCTION_ORIGIN,
      'https://preview.example.com'
    ]);
  });
});

describe('Origin Sanitization Unit Suite', () => {
  it('strips paths, trailing slashes, queries, and embedded credentials', () => {
    expect(sanitizeOrigin('https://snapora.example.com/')).toBe('https://snapora.example.com');
    expect(sanitizeOrigin('https://user:pass@snapora.example.com/path?key=val#hash')).toBe('https://snapora.example.com');
  });

  it('rejects malformed strings, javascript URLs, and data URLs', () => {
    expect(sanitizeOrigin('not a url')).toBeNull();
    expect(sanitizeOrigin('javascript:alert(1)')).toBeNull();
    expect(sanitizeOrigin('data:text/html,test')).toBeNull();
    expect(sanitizeOrigin('')).toBeNull();
  });

  it('enforces HTTPS in production mode for non-localhost hosts', () => {
    expect(sanitizeOrigin('http://insecure.example.com', true)).toBeNull();
    expect(sanitizeOrigin('https://secure.example.com', true)).toBe('https://secure.example.com');
    expect(sanitizeOrigin('http://localhost:3000', true)).toBe('http://localhost:3000');
    expect(sanitizeOrigin('http://127.0.0.1:3000', true)).toBe('http://127.0.0.1:3000');
  });

  it('prohibits wildcards in production while permitting them in development', () => {
    expect(sanitizeOrigin('*', true)).toBeNull();
    expect(sanitizeOrigin('*', false)).toBe('*');
  });
});
