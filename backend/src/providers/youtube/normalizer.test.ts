import { describe, it, expect } from 'vitest';
import { youTubeMetadataNormalizer } from './normalizer.js';

describe('YouTubeMetadataNormalizer Suite', () => {
  const baseInput = {
    videoId: 'dQw4w9WgXcQ',
    canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    title: 'Test Video',
    author: 'Test Creator',
    authorUrl: 'https://www.youtube.com/@testcreator',
    thumbnails: [
      {
        resolution: 'hqdefault',
        url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
        width: 480,
        height: 360,
        verified: true
      }
    ],
    metadataCapability: 'BASIC_METADATA' as const
  };

  describe('Embedding status normalization', () => {
    it('normalizes confirmed allowed embedding correctly', () => {
      const normalized = youTubeMetadataNormalizer.normalize({
        ...baseInput,
        embedStatus: 'allowed',
        isEmbeddable: true,
        embeddingAllowed: true
      });

      expect(normalized.embedStatus).toBe('allowed');
      expect(normalized.isEmbeddable).toBe(true);
      expect(normalized.embeddingAllowed).toBe(true);
      expect(normalized.embedUrl).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');

      const resolveSuccess = youTubeMetadataNormalizer.buildResolveSuccess(normalized);
      expect(resolveSuccess.embedStatus).toBe('allowed');
      expect(resolveSuccess.isEmbeddable).toBe(true);
      expect(resolveSuccess.embeddingAllowed).toBe(true);
      expect(resolveSuccess.embedUrl).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
      expect(resolveSuccess.preview?.embedStatus).toBe('allowed');
      expect(resolveSuccess.preview?.isEmbeddable).toBe(true);
      expect(resolveSuccess.preview?.embeddingAllowed).toBe(true);
      expect(resolveSuccess.preview?.embedUrl).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    });

    it('normalizes confirmed disabled embedding correctly and omits embedUrl', () => {
      const normalized = youTubeMetadataNormalizer.normalize({
        ...baseInput,
        embedStatus: 'disabled',
        isEmbeddable: false,
        embeddingAllowed: false
      });

      expect(normalized.embedStatus).toBe('disabled');
      expect(normalized.isEmbeddable).toBe(false);
      expect(normalized.embeddingAllowed).toBe(false);
      expect(normalized.embedUrl).toBeUndefined();

      const resolveSuccess = youTubeMetadataNormalizer.buildResolveSuccess(normalized);
      expect(resolveSuccess.embedStatus).toBe('disabled');
      expect(resolveSuccess.isEmbeddable).toBe(false);
      expect(resolveSuccess.embeddingAllowed).toBe(false);
      expect(resolveSuccess.embedUrl).toBeUndefined();
      expect(resolveSuccess.preview?.embedStatus).toBe('disabled');
      expect(resolveSuccess.preview?.isEmbeddable).toBe(false);
      expect(resolveSuccess.preview?.embeddingAllowed).toBe(false);
      expect(resolveSuccess.preview?.embedUrl).toBeUndefined();
    });

    it('normalizes unknown embedding status (oEmbed / unverified) without claiming confirmed permission', () => {
      const normalized = youTubeMetadataNormalizer.normalize({
        ...baseInput,
        embedStatus: 'unknown'
      });

      // Must report 'unknown' and must NOT report true for confirmed permissions
      expect(normalized.embedStatus).toBe('unknown');
      expect(normalized.isEmbeddable).toBeUndefined();
      expect(normalized.embeddingAllowed).toBeUndefined();

      // Generates privacy-enhanced embed URL for attempting embed
      expect(normalized.embedUrl).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');

      const resolveSuccess = youTubeMetadataNormalizer.buildResolveSuccess(normalized);
      expect(resolveSuccess.embedStatus).toBe('unknown');
      expect(resolveSuccess.isEmbeddable).toBeUndefined();
      expect(resolveSuccess.embeddingAllowed).toBeUndefined();
      expect(resolveSuccess.embedUrl).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
      expect(resolveSuccess.preview?.embedStatus).toBe('unknown');
      expect(resolveSuccess.preview?.isEmbeddable).toBeUndefined();
      expect(resolveSuccess.preview?.embeddingAllowed).toBeUndefined();
      expect(resolveSuccess.preview?.embedUrl).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    });

    it('defaults unprovided embedding fields to unknown status', () => {
      const normalized = youTubeMetadataNormalizer.normalize(baseInput);

      expect(normalized.embedStatus).toBe('unknown');
      expect(normalized.isEmbeddable).toBeUndefined();
      expect(normalized.embeddingAllowed).toBeUndefined();
      expect(normalized.embedUrl).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    });
  });
});
