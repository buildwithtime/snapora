import { describe, it, expect } from 'vitest';
import { PinterestMetadataNormalizer } from './normalizer.js';

describe('PinterestMetadataNormalizer Suite', () => {
  const normalizer = new PinterestMetadataNormalizer();
  const validPinId = '123456789012345678';
  const canonicalUrl = `https://www.pinterest.com/pin/${validPinId}/`;

  it('normalizes full oEmbed metadata with unconfirmed embed status', () => {
    const fixedNow = new Date('2026-11-07T12:00:00.000Z');
    const input = {
      pinId: validPinId,
      canonicalUrl,
      oembed: {
        title: 'Minimalist Architecture Concept',
        author_name: 'ArchDaily',
        author_url: 'https://www.pinterest.com/archdaily/',
        thumbnail_url: 'https://i.pinimg.com/236x/ab/cd/ef/abcdef.jpg',
        thumbnail_width: 236,
        thumbnail_height: 354
      },
      thumbnails: [
        {
          resolution: '236x' as const,
          url: 'https://i.pinimg.com/236x/ab/cd/ef/abcdef.jpg',
          width: 236,
          height: 354,
          verified: true
        }
      ],
      fetchedAt: fixedNow
    };

    const normalized = normalizer.normalize(input);
    expect(normalized.pinId).toBe(validPinId);
    expect(normalized.canonicalUrl).toBe(canonicalUrl);
    expect(normalized.title).toBe('Minimalist Architecture Concept');
    expect(normalized.author).toBe('ArchDaily');
    expect(normalized.authorUrl).toBe('https://www.pinterest.com/archdaily/');
    expect(normalized.embedUrl).toContain(`id=${validPinId}&src=oembed`);
    expect(normalized.embedStatus).toBe('unknown');
    expect(normalized.isEmbeddable).toBeUndefined();
    expect(normalized.embeddingAllowed).toBeUndefined();
    expect(normalized.metadataCapability).toBe('BASIC_METADATA');
    expect(normalized.metadataFetchedAt).toBe('2026-11-07T12:00:00.000Z');
    expect(normalized.metadataExpiresAt).toBe('2026-12-07T12:00:00.000Z'); // +30 days
  });

  it('normalizes minimal oEmbed data with fallback title and EMBED_ONLY capability', () => {
    const normalized = normalizer.normalize({
      pinId: validPinId,
      canonicalUrl
    });

    expect(normalized.title).toBe(`Pinterest Pin ${validPinId}`);
    expect(normalized.author).toBeUndefined();
    expect(normalized.metadataCapability).toBe('EMBED_ONLY');
    expect(normalized.embedStatus).toBe('unknown');
    expect(normalized.isEmbeddable).toBeUndefined();
    expect(normalized.embeddingAllowed).toBeUndefined();
  });

  it('preserves identical unknown embedding permission status at top-level and nested preview', () => {
    const normalized = normalizer.normalize({
      pinId: validPinId,
      canonicalUrl,
      embedStatus: 'unknown'
    });

    const response = normalizer.buildResolveSuccess(normalized);

    // Top-level embedding status assertions
    expect(response.embedStatus).toBe('unknown');
    expect(response.isEmbeddable).toBeUndefined();
    expect(response.embeddingAllowed).toBeUndefined();
    expect(response.embedUrl).toBeDefined();

    // Nested preview embedding status assertions
    expect(response.preview).toBeDefined();
    expect(response.preview?.embedStatus).toBe('unknown');
    expect(response.preview?.isEmbeddable).toBeUndefined();
    expect(response.preview?.embeddingAllowed).toBeUndefined();
    expect(response.preview?.embedUrl).toBe(response.embedUrl);
  });

  it('builds ResolveSuccess response enforcing non-circumvention download policy', () => {
    const normalized = normalizer.normalize({
      pinId: validPinId,
      canonicalUrl,
      thumbnails: [
        {
          resolution: '236x',
          url: 'https://i.pinimg.com/236x/test.jpg',
          width: 236,
          height: 300,
          verified: true
        }
      ]
    });

    const response = normalizer.buildResolveSuccess(normalized);
    expect(response.ok).toBe(true);
    expect(response.status).toBe('live_metadata_retrieved');
    expect(response.provider).toBe('pinterest');
    expect(response.platform).toBe('pinterest');
    expect(response.downloadAvailable).toBe(false);
    expect(response.disclaimer).toMatch(/downloads are not supported/);

    expect(response.preview?.type).toBe('thumbnail');
    expect(response.preview?.thumbnailUrl).toBe('https://i.pinimg.com/236x/test.jpg');
    expect(response.preview?.embedStatus).toBe('unknown');

    expect(response.media).toHaveLength(1);
    expect(response.media![0].downloadable).toBe(false);
    expect(response.media![0].type).toBe('image');
    expect(response.media![0].platform).toBe('pinterest');
  });
});
