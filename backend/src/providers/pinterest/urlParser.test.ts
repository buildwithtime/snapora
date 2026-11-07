import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PinterestUrlParser,
  isAllowedPinterestHost,
  isAllowedPinterestRedirectHost
} from './urlParser.js';
import * as ssrfClient from '../../utils/ssrfClient.js';
import { Readable } from 'node:stream';

describe('PinterestUrlParser Suite', () => {
  const parser = new PinterestUrlParser();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('isAllowedPinterestHost', () => {
    it('accepts exact allowed web hosts', () => {
      expect(isAllowedPinterestHost('pinterest.com')).toBe(true);
      expect(isAllowedPinterestHost('www.pinterest.com')).toBe(true);
      expect(isAllowedPinterestHost('m.pinterest.com')).toBe(true);
      expect(isAllowedPinterestHost('pin.it')).toBe(true);
    });

    it('accepts regional subdomains and ccTLDs', () => {
      expect(isAllowedPinterestHost('in.pinterest.com')).toBe(true);
      expect(isAllowedPinterestHost('pinterest.co.uk')).toBe(true);
      expect(isAllowedPinterestHost('www.pinterest.ca')).toBe(true);
      expect(isAllowedPinterestHost('pinterest.de')).toBe(true);
      expect(isAllowedPinterestHost('pinterest.fr')).toBe(true);
    });

    it('rejects foreign or phishing domains', () => {
      expect(isAllowedPinterestHost('evil.com')).toBe(false);
      expect(isAllowedPinterestHost('pinterest.com.evil.com')).toBe(false);
      expect(isAllowedPinterestHost('notpinterest.com')).toBe(false);
    });
  });

  describe('isAllowedPinterestRedirectHost', () => {
    it('allows pin.it and api.pinterest.com as redirect intermediates', () => {
      expect(isAllowedPinterestRedirectHost('pin.it')).toBe(true);
      expect(isAllowedPinterestRedirectHost('api.pinterest.com')).toBe(true);
      expect(isAllowedPinterestRedirectHost('www.pinterest.com')).toBe(true);
    });

    it('rejects external redirect hosts', () => {
      expect(isAllowedPinterestRedirectHost('attacker.com')).toBe(false);
      expect(isAllowedPinterestRedirectHost('169.254.169.254')).toBe(false);
    });
  });

  describe('parsePinId', () => {
    it('parses valid 18-digit Pin ID from canonical URL', () => {
      const res = parser.parsePinId('https://www.pinterest.com/pin/123456789012345678/');
      expect(res).not.toBeNull();
      expect(res?.pinId).toBe('123456789012345678');
      expect(res?.canonicalUrl).toBe('https://www.pinterest.com/pin/123456789012345678/');
    });

    it('parses valid Pin ID without trailing slash', () => {
      const res = parser.parsePinId('https://pinterest.com/pin/987654321098765432');
      expect(res).not.toBeNull();
      expect(res?.pinId).toBe('987654321098765432');
      expect(res?.canonicalUrl).toBe('https://www.pinterest.com/pin/987654321098765432/');
    });

    it('parses valid Pin ID from regional ccTLD and normalizes canonicalUrl', () => {
      const res = parser.parsePinId('https://pinterest.co.uk/pin/123456789012345678/');
      expect(res).not.toBeNull();
      expect(res?.pinId).toBe('123456789012345678');
      expect(res?.canonicalUrl).toBe('https://www.pinterest.com/pin/123456789012345678/');
    });

    it('returns null for non-numeric or malformed Pin IDs', () => {
      expect(parser.parsePinId('https://www.pinterest.com/pin/abc/')).toBeNull();
      expect(parser.parsePinId('https://www.pinterest.com/pin/12345/')).toBeNull(); // < 16 digits
      expect(parser.parsePinId('https://www.pinterest.com/pin/1234567890123456789012345/')).toBeNull(); // > 22 digits
    });

    it('returns null for non-Pinterest URLs or invalid protocols', () => {
      expect(parser.parsePinId('https://example.com/pin/123456789012345678/')).toBeNull();
      expect(parser.parsePinId('ftp://www.pinterest.com/pin/123456789012345678/')).toBeNull();
      expect(parser.parsePinId('not a url')).toBeNull();
    });
  });

  describe('resolveShortLink', () => {
    it('successfully resolves a pin.it shortlink via safeHttpsRequest', async () => {
      const mockStream = new Readable({ read() { this.push(null); } });
      vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValueOnce({
        statusCode: 200,
        headers: {},
        stream: mockStream as any,
        finalUrl: 'https://www.pinterest.com/pin/123456789012345678/'
      });

      const res = await parser.resolveShortLink('https://pin.it/abc1234');
      expect(res.pinId).toBe('123456789012345678');
      expect(res.canonicalUrl).toBe('https://www.pinterest.com/pin/123456789012345678/');
      expect(ssrfClient.safeHttpsRequest).toHaveBeenCalledWith(
        'https://pin.it/abc1234',
        expect.objectContaining({
          method: 'HEAD',
          maxRedirects: 5
        })
      );
    });

    it('rejects shortlink if it resolves to a non-Pin destination', async () => {
      const mockStream = new Readable({ read() { this.push(null); } });
      vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValueOnce({
        statusCode: 200,
        headers: {},
        stream: mockStream as any,
        finalUrl: 'https://www.pinterest.com/'
      });

      await expect(parser.resolveShortLink('https://pin.it/abc1234')).rejects.toThrow(
        /PINTEREST_REDIRECT_REJECTED/
      );
    });

    it('rejects non-HTTPS shortlinks', async () => {
      await expect(parser.resolveShortLink('http://pin.it/abc1234')).rejects.toThrow(
        /SSRF_BLOCKED/
      );
    });

    it('rejects invalid hosts for shortlink resolution', async () => {
      await expect(parser.resolveShortLink('https://evil.com/abc1234')).rejects.toThrow(
        /INVALID_URL/
      );
    });

    it('rejects malformed shortcodes', async () => {
      await expect(parser.resolveShortLink('https://pin.it/a')).rejects.toThrow(
        /INVALID_PIN_ID/
      );
    });
  });
});
