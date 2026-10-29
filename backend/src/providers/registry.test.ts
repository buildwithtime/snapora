import { describe, it, expect } from 'vitest';
import { ProviderCapabilityRegistry } from './registry.js';
import { MockProvider } from './mock.js';
import { InstagramOEmbedProvider } from './oembed.js';
import { DirectMediaUrlProvider } from './direct.js';

describe('ProviderCapabilityRegistry Suite', () => {
  it('registers and lists all core providers with distinct capabilities', () => {
    const registry = new ProviderCapabilityRegistry();
    const list = registry.listProviders();
    expect(list.length).toBeGreaterThanOrEqual(4);

    const ids = list.map((p) => p.id);
    expect(ids).toContain('mock');
    expect(ids).toContain('oembed');
    expect(ids).toContain('direct');
    expect(ids).toContain('authorized');
    expect(ids).toContain('public');

    const publicInfo = list.find((p) => p.id === 'public');
    expect(publicInfo?.capabilities.supportsOriginalDownload).toBe(true);
    expect(publicInfo?.capabilities.supportsCarousel).toBe(true);
    expect(publicInfo?.capabilities.requiresAuthentication).toBe(false);

    const oembedInfo = list.find((p) => p.id === 'oembed');
    expect(oembedInfo?.capabilities.supportsPreview).toBe(true);
    expect(oembedInfo?.capabilities.supportsOriginalDownload).toBe(false);
    expect(oembedInfo?.capabilities.requiresConfiguration).toBe(true);

    const directInfo = list.find((p) => p.id === 'direct');
    expect(directInfo?.capabilities.supportsOriginalDownload).toBe(true);
    expect(directInfo?.capabilities.requiresAuthentication).toBe(false);
  });

  it('intelligently selects DirectMediaUrlProvider for direct CDN links', () => {
    const registry = new ProviderCapabilityRegistry();
    const cdnUrl = 'https://scontent-iad3-1.cdninstagram.com/v/t51.2885-15/photo.jpg?oh=1&oe=2';
    const provider = registry.selectProviderForUrl(cdnUrl);
    expect(provider.id).toBe('direct');
  });

  it('selects explicit preferred provider when available', () => {
    const registry = new ProviderCapabilityRegistry();
    const provider = registry.selectProviderForUrl('https://www.instagram.com/p/Cxyz123/', 'mock');
    expect(provider.id).toBe('mock');
  });

  it('falls back to default provider when preferred provider is not specified', () => {
    const registry = new ProviderCapabilityRegistry();
    registry.setDefaultProvider('mock');
    const provider = registry.selectProviderForUrl('https://www.instagram.com/p/Cxyz123/');
    expect(provider.id).toBe('mock');
  });
});
