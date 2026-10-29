import { IMediaProvider, ProviderCapabilities, ResolveResult } from './types.js';
import { MockProvider } from './mock.js';
import { InstagramOEmbedProvider } from './oembed.js';
import { DirectMediaUrlProvider } from './direct.js';
import { AuthorizedAccountMediaProvider } from './authorized.js';
import { PublicWebMediaProvider } from './public.js';
import { parseInstagramUrl } from '../utils/urlParser.js';
import { config } from '../config/index.js';

export interface ProviderRegistrationInfo {
  id: string;
  name: string;
  capabilities: ProviderCapabilities;
}

export class ProviderCapabilityRegistry {
  private providers: Map<string, IMediaProvider> = new Map();
  private defaultProviderId: string = config.defaultProvider || 'public';

  constructor() {
    // Register built-in providers
    this.register(new MockProvider());
    this.register(new InstagramOEmbedProvider());
    this.register(new DirectMediaUrlProvider());
    this.register(new AuthorizedAccountMediaProvider({ userAccessToken: config.instagramUserAccessToken }));
    this.register(new PublicWebMediaProvider());

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
      capabilities: p.getCapabilities()
    }));
  }

  /**
   * Intelligently selects the best provider based on URL structure and configuration.
   * If a direct CDN media URL is detected, selects DirectMediaUrlProvider.
   * If an explicit preferred provider is passed, selects it.
   * Otherwise falls back to the configured default provider.
   */
  selectProviderForUrl(url: string, preferredProviderId?: string): IMediaProvider {
    if (preferredProviderId && this.providers.has(preferredProviderId)) {
      return this.providers.get(preferredProviderId)!;
    }

    const parsed = parseInstagramUrl(url);

    // If direct CDN media link, always route to DirectMediaUrlProvider
    if (parsed.valid && parsed.contentType === 'direct_media') {
      const directProvider = this.providers.get('direct');
      if (directProvider) {
        return directProvider;
      }
    }

    return this.getDefaultProvider();
  }
}

// Global shared registry instance
export const providerRegistry = new ProviderCapabilityRegistry();
