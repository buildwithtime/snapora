import { describe, it, expect } from 'vitest';
import {
  PinterestEmbedService,
  PINTEREST_REQUIRED_IFRAME_SANDBOX,
  APPROVED_PINTEREST_EMBED_HOST,
  APPROVED_PINTEREST_EMBED_PATH
} from './embedService.js';

describe('PinterestEmbedService Suite', () => {
  const service = new PinterestEmbedService();
  const validPinId = '123456789012345678';

  describe('buildEmbedUrl & generateEmbedUrl', () => {
    it('constructs canonical privacy-enhanced standalone embed URL for valid Pin ID', () => {
      const url = service.buildEmbedUrl(validPinId);
      expect(url).toBe(
        `https://${APPROVED_PINTEREST_EMBED_HOST}${APPROVED_PINTEREST_EMBED_PATH}?id=${validPinId}&src=oembed`
      );
      expect(service.generateEmbedUrl(validPinId)).toBe(url);
    });

    it('throws on invalid or malformed Pin ID', () => {
      expect(() => service.buildEmbedUrl('12345')).toThrow(/INVALID_PIN_ID/);
      expect(() => service.buildEmbedUrl('non-numeric')).toThrow(/INVALID_PIN_ID/);
      expect(() => service.buildEmbedUrl('')).toThrow(/INVALID_PIN_ID/);
    });
  });

  describe('validateEmbedUrl', () => {
    it('validates canonical Pinterest embed URLs', () => {
      const url = `https://${APPROVED_PINTEREST_EMBED_HOST}${APPROVED_PINTEREST_EMBED_PATH}?id=${validPinId}&src=oembed`;
      expect(service.validateEmbedUrl(url)).toBe(true);
      expect(service.validateEmbedUrl(url, validPinId)).toBe(true);
    });

    it('rejects URLs where Pin ID does not match expectedPinId (Mismatched Pin ID rejection)', () => {
      const url = `https://${APPROVED_PINTEREST_EMBED_HOST}${APPROVED_PINTEREST_EMBED_PATH}?id=${validPinId}&src=oembed`;
      expect(service.validateEmbedUrl(url, '999999999999999999')).toBe(false);
    });

    it('rejects non-HTTPS protocol', () => {
      const url = `http://${APPROVED_PINTEREST_EMBED_HOST}${APPROVED_PINTEREST_EMBED_PATH}?id=${validPinId}&src=oembed`;
      expect(service.validateEmbedUrl(url)).toBe(false);
    });

    it('rejects foreign or spoofed hostnames (Invalid embed host rejection)', () => {
      expect(service.validateEmbedUrl(`https://evil.com/ext/embed.html?id=${validPinId}`)).toBe(false);
      expect(service.validateEmbedUrl(`https://assets.pinterest.com.evil.com/ext/embed.html?id=${validPinId}`)).toBe(false);
      expect(service.validateEmbedUrl(`https://attacker-domain.org/ext/embed.html?id=${validPinId}`)).toBe(false);
    });

    it('rejects unexpected paths', () => {
      expect(service.validateEmbedUrl(`https://${APPROVED_PINTEREST_EMBED_HOST}/other/path?id=${validPinId}`)).toBe(false);
    });

    it('rejects malicious or extraneous query parameters', () => {
      const dirtyUrl = `https://${APPROVED_PINTEREST_EMBED_HOST}${APPROVED_PINTEREST_EMBED_PATH}?id=${validPinId}&src=oembed&injected=true`;
      expect(service.validateEmbedUrl(dirtyUrl)).toBe(false);
    });
  });

  describe('resolveEmbedUrl', () => {
    it('extracts embed URL from oEmbed snippet and reports unconfirmed permission status', () => {
      const htmlSnippet = `<iframe src="https://${APPROVED_PINTEREST_EMBED_HOST}${APPROVED_PINTEREST_EMBED_PATH}?id=${validPinId}&amp;src=oembed" height="714" width="345"></iframe>`;
      const res = service.resolveEmbedUrl(htmlSnippet, validPinId);

      // Embed URL remains available for frontend playback attempt
      expect(res.embedUrl).toBe(`https://${APPROVED_PINTEREST_EMBED_HOST}${APPROVED_PINTEREST_EMBED_PATH}?id=${validPinId}&src=oembed`);

      // Permission status must be unconfirmed ('unknown')
      expect(res.embedStatus).toBe('unknown');
      expect(res.isEmbeddable).toBeUndefined();
      expect(res.embeddingAllowed).toBeUndefined();

      // Required sandbox flags preserved
      expect(res.requiredSandbox).toBe(PINTEREST_REQUIRED_IFRAME_SANDBOX);
    });

    it('falls back cleanly to buildEmbedUrl with unknown status when HTML snippet is empty', () => {
      const res = service.resolveEmbedUrl(null, validPinId);
      expect(res.embedUrl).toBe(`https://${APPROVED_PINTEREST_EMBED_HOST}${APPROVED_PINTEREST_EMBED_PATH}?id=${validPinId}&src=oembed`);
      expect(res.embedStatus).toBe('unknown');
      expect(res.isEmbeddable).toBeUndefined();
      expect(res.embeddingAllowed).toBeUndefined();
      expect(res.requiredSandbox).toBe(PINTEREST_REQUIRED_IFRAME_SANDBOX);
    });

    it('falls back cleanly when HTML snippet contains untrusted iframe src', () => {
      const untrustedHtml = '<iframe src="https://evil.com/fake-embed"></iframe>';
      const res = service.resolveEmbedUrl(untrustedHtml, validPinId);
      expect(res.embedUrl).toBe(`https://${APPROVED_PINTEREST_EMBED_HOST}${APPROVED_PINTEREST_EMBED_PATH}?id=${validPinId}&src=oembed`);
      expect(res.embedStatus).toBe('unknown');
      expect(res.isEmbeddable).toBeUndefined();
      expect(res.embeddingAllowed).toBeUndefined();
    });
  });
});
