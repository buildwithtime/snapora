import { describe, it, expect } from 'vitest';
import { validateStartupConfig, AppConfig } from './index.js';

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
});
