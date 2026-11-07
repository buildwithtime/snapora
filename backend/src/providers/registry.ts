import { IMediaProvider, PlatformId, ProviderCapabilities, ResolveResult } from './types.js';
import { MockProvider } from './mock.js';
import { InstagramOEmbedProvider } from './oembed.js';
import { DirectMediaUrlProvider } from './direct.js';
import { AuthorizedAccountMediaProvider } from './authorized.js';
import { PublicWebMediaProvider } from './public.js';
import { YouTubeMediaProvider } from './youtube/index.js';
import { PinterestMediaProvider } from './pinterest/index.js';
import { parseInstagramUrl } from '../utils/urlParser.js';
import { universalPlatformRegistry, UniversalPlatformRegistry } from '../utils/platformDetector.js';
import { config } from '../config/index.js';

export interface ProviderRegistrationInfo {
  id: string;
  name: string;
  platformId: PlatformId;
  capabilities: ProviderCapabilities;
}

export class ProviderCapabilityRegistry {
  private providers: Map<string, IMediaProvider> = new Map();
  private defaultProviderId: string = config.defaultProvider || 'public';
  private platformRegistry: UniversalPlatformRegistry = universalPlatformRegistry;

  constructor(platformRegistry?: UniversalPlatformRegistry) {
    if (platformRegistry) {
      this.platformRegistry = platformRegistry;
    }

    // Register built-in providers
    this.register(new MockProvider());
    this.register(new InstagramOEmbedProvider());
    this.register(new DirectMediaUrlProvider());
    this.register(new AuthorizedAccountMediaProvider({ userAccessToken: config.instagramUserAccessToken }));
    this.register(new PublicWebMediaProvider());
    this.register(new YouTubeMediaProvider());
    this.register(new PinterestMediaProvider());

    if (config.defaultProvider && this.providers.has(config.defaultProvider)) {
      this.defaultProviderId = config.defaultProvider;
    }
  }

  register(provider: IMediaProvider): void {
    this.providers.set(provider.id, provider);
  }

  getProvider(id: string): IMediaProvider | undefined {
    return this.providers.get(id);
  }

  getProvidersForPlatform(platformId: PlatformId): IMediaProvider[] {
    return Array.from(this.providers.values()).filter((p) => p.platformId === platformId);
  }

  setDefaultProvider(id: string): void {
    if (!this.providers.has(id)) {
      throw new Error(`Cannot set default provider to unregistered provider '${id}'`);
    }
    this.defaultProviderId = id;
  }

  getDefaultProvider(): IMediaProvider {
    const provider = this.providers.get(this.defaultProviderId);
    if (!provider) {
      return new MockProvider();
    }
    return provider;
  }

  listProviders(): ProviderRegistrationInfo[] {
    return Array.from(this.providers.values()).map((p) => ({
      id: p.id,
      name: p.name,
      platformId: p.platformId,
      capabilities: p.getCapabilities()
    }));
  }

  /**
   * Aggregates allowed media download hosts across all registered providers
   * and platform detectors.
   */
  getAllowedDownloadHosts(): Array<string | RegExp> {
    const rules: Array<string | RegExp> = [];
    for (const provider of this.providers.values()) {
      rules.push(...provider.getAllowedDownloadHosts());
    }
    rules.push(...this.platformRegistry.getAllowedDownloadHosts());
    return rules;
  }

  /**
   * Checks whether a destination hostname is authorized for media streaming/downloads.
   * Dynamically checks rules declared by registered providers and platform detectors.
   */
  isAllowedDownloadHost(hostname: string): boolean {
    const clean = hostname.toLowerCase().replace(/\.+$/, '');

    // Check registered providers
    for (const provider of this.providers.values()) {
      const rules = provider.getAllowedDownloadHosts();
      for (const rule of rules) {
        if (typeof rule === 'string' && clean === rule.toLowerCase()) return true;
        if (rule instanceof RegExp && rule.test(clean)) return true;
      }
    }

    // Check platform registry detectors
    return this.platformRegistry.isAllowedDownloadHost(clean);
  }

  /**
   * Intelligently selects the best provider based on URL structure, platform detection, and configuration.
   * If a direct CDN media URL is detected, selects DirectMediaUrlProvider.
   * If an explicit preferred provider is passed, selects it.
   * Otherwise falls back to the configured default provider.
   */
  selectProviderForUrl(url: string, preferredProviderId?: string): IMediaProvider {
    if (preferredProviderId && this.providers.has(preferredProviderId)) {
      return this.providers.get(preferredProviderId)!;
    }

    const detected = this.platformRegistry.detectPlatform(url);

    // If direct CDN media link, always route to DirectMediaUrlProvider
    if (detected.matched && detected.info?.contentType === 'direct_media') {
      const directProvider = this.providers.get('direct');
      if (directProvider) {
        return directProvider;
      }
    }

    // If a platform has providers registered, choose the active or default for that platform
    if (detected.matched && detected.platformId) {
      const platformProviders = this.getProvidersForPlatform(detected.platformId);
      const defaultForPlatform = platformProviders.find((p) => p.id === this.defaultProviderId);
      if (defaultForPlatform) {
        return defaultForPlatform;
      }
      if (platformProviders.length > 0) {
        return platformProviders[0];
      }
    }

    return this.getDefaultProvider();
  }

  /**
   * Selects a provider capable of profile-wide discovery.
   * If a preferredProviderId is specified and available, selects it.
   * Otherwise uses the default provider if it supports profile discovery,
   * or falls back to public / mock.
   */
  selectProviderForProfile(urlOrUsername: string, preferredProviderId?: string): IMediaProvider {
    if (preferredProviderId && this.providers.has(preferredProviderId)) {
      return this.providers.get(preferredProviderId)!;
    }

    const defaultProvider = this.getDefaultProvider();
    if (defaultProvider.canDiscoverProfile && defaultProvider.canDiscoverProfile(urlOrUsername)) {
      return defaultProvider;
    }

    const publicProvider = this.providers.get('public');
    if (publicProvider?.canDiscoverProfile && publicProvider.canDiscoverProfile(urlOrUsername)) {
      return publicProvider;
    }

    const mockProvider = this.providers.get('mock');
    if (mockProvider) {
      return mockProvider;
    }

    return defaultProvider;
  }
}

// Global shared registry instance
export const providerRegistry = new ProviderCapabilityRegistry();
