import { describe, it, expect, vi } from 'vitest';
import { createSafeLookup, safeHttpsRequest, defaultIsAllowedHost } from './ssrfClient.js';

describe('SSRF Client & Connection-Level Rebinding Defense Suite', () => {
  describe('createSafeLookup (Socket Connection Time Defense)', () => {
    it('blocks connection if resolved IP is loopback (127.0.0.1)', () => {
      const mockDnsLookup: any = (_host: string, _opts: any, cb: Function) => {
        cb(null, '127.0.0.1', 4);
      };

      const safeLookup = createSafeLookup(mockDnsLookup);
      safeLookup('rebind.attacker.local', {} as any, (err, address) => {
        expect(err).toBeDefined();
        expect(err?.message).toContain('SSRF_BLOCKED');
        expect(address).toBe('');
      });
    });

    it('blocks connection if resolved IP is cloud metadata (169.254.169.254)', () => {
      const mockDnsLookup: any = (_host: string, _opts: any, cb: Function) => {
        cb(null, '169.254.169.254', 4);
      };

      const safeLookup = createSafeLookup(mockDnsLookup);
      safeLookup('metadata.rebind.attacker', {} as any, (err) => {
        expect(err).toBeDefined();
        expect(err?.message).toContain('SSRF_BLOCKED');
      });
    });

    it('blocks connection if resolved IP is private RFC1918 (10.0.0.5 or 192.168.1.1)', () => {
      const mockDnsLookup: any = (_host: string, _opts: any, cb: Function) => {
        cb(null, '192.168.1.1', 4);
      };

      const safeLookup = createSafeLookup(mockDnsLookup);
      safeLookup('internal.corp.local', {} as any, (err) => {
        expect(err).toBeDefined();
        expect(err?.message).toContain('SSRF_BLOCKED');
      });
    });

    it('blocks connection if resolved IP is IPv6 loopback (::1)', () => {
      const mockDnsLookup: any = (_host: string, _opts: any, cb: Function) => {
        cb(null, '::1', 6);
      };

      const safeLookup = createSafeLookup(mockDnsLookup);
      safeLookup('ipv6.loopback.local', {} as any, (err) => {
        expect(err).toBeDefined();
        expect(err?.message).toContain('SSRF_BLOCKED');
      });
    });

    it('blocks connection if resolved IP is IPv4-mapped private IPv6', () => {
      const mockDnsLookup: any = (_host: string, _opts: any, cb: Function) => {
        cb(null, '::ffff:127.0.0.1', 6);
      };

      const safeLookup = createSafeLookup(mockDnsLookup);
      safeLookup('mapped.loopback.local', {} as any, (err) => {
        expect(err).toBeDefined();
        expect(err?.message).toContain('SSRF_BLOCKED');
      });
    });

    it('permits connection when resolved IP is authentic public address', () => {
      const mockDnsLookup: any = (_host: string, _opts: any, cb: Function) => {
        cb(null, '157.240.22.35', 4);
      };

      const safeLookup = createSafeLookup(mockDnsLookup);
      safeLookup('scontent-iad3-1.cdninstagram.com', {} as any, (err, address, family) => {
        expect(err).toBeNull();
        expect(address).toBe('157.240.22.35');
        expect(family).toBe(4);
      });
    });
  });

  describe('safeHttpsRequest Validation Boundaries', () => {
    it('rejects unencrypted HTTP requests before socket creation', async () => {
      await expect(
        safeHttpsRequest('http://www.instagram.com/p/test/')
      ).rejects.toThrow('SSRF_BLOCKED: Only HTTPS destinations are permitted');
    });

    it('rejects non-standard ports (e.g. port 8443 scan attempt)', async () => {
      await expect(
        safeHttpsRequest('https://www.instagram.com:8443/p/test/')
      ).rejects.toThrow('SSRF_BLOCKED: Non-standard port');
    });

    it('rejects embedded credentials in target URL', async () => {
      await expect(
        safeHttpsRequest('https://admin:pass@www.instagram.com/p/test/')
      ).rejects.toThrow('SSRF_BLOCKED: Embedded credentials are prohibited');
    });

    it('rejects unapproved destination hosts', async () => {
      await expect(
        safeHttpsRequest('https://evil-unapproved.com/photo.jpg')
      ).rejects.toThrow('SSRF_BLOCKED: Hostname \'evil-unapproved.com\' is not in the allowed destination list');
    });
  });

  describe('defaultIsAllowedHost Hostname Allowlist', () => {
    it('permits official Instagram domains', () => {
      expect(defaultIsAllowedHost('instagram.com')).toBe(true);
      expect(defaultIsAllowedHost('www.instagram.com')).toBe(true);
      expect(defaultIsAllowedHost('m.instagram.com')).toBe(true);
      expect(defaultIsAllowedHost('instagr.am')).toBe(true);
    });

    it('permits verified Meta CDN hostnames', () => {
      expect(defaultIsAllowedHost('scontent-iad3-1.cdninstagram.com')).toBe(true);
      expect(defaultIsAllowedHost('scontent.cdninstagram.com')).toBe(true);
      expect(defaultIsAllowedHost('instagram.fdel1-1.fna.fbcdn.net')).toBe(true);
    });

    it('strictly rejects lookalike or arbitrary domains', () => {
      expect(defaultIsAllowedHost('attacker.com')).toBe(false);
      expect(defaultIsAllowedHost('instagram.com.attacker.com')).toBe(false);
      expect(defaultIsAllowedHost('evil-instagram.com')).toBe(false);
    });
  });
});
