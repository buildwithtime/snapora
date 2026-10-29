import { describe, it, expect } from 'vitest';
import { isPrivateOrReservedIPv4, isPrivateOrReservedIPv6, isPrivateOrReservedIp, assertSafeDestinationHost } from './ssrf.js';

describe('SSRF & IP Range Defense Suite', () => {
  describe('IPv4 Address Filtering', () => {
    it('detects and blocks loopback (127.0.0.0/8)', () => {
      expect(isPrivateOrReservedIPv4('127.0.0.1')).toBe(true);
      expect(isPrivateOrReservedIPv4('127.0.0.254')).toBe(true);
    });

    it('detects and blocks private RFC1918 ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)', () => {
      expect(isPrivateOrReservedIPv4('10.0.0.1')).toBe(true);
      expect(isPrivateOrReservedIPv4('10.254.254.254')).toBe(true);
      expect(isPrivateOrReservedIPv4('172.16.0.1')).toBe(true);
      expect(isPrivateOrReservedIPv4('172.31.255.255')).toBe(true);
      expect(isPrivateOrReservedIPv4('192.168.1.1')).toBe(true);
    });

    it('detects and blocks cloud metadata and link-local (169.254.0.0/16)', () => {
      expect(isPrivateOrReservedIPv4('169.254.169.254')).toBe(true);
      expect(isPrivateOrReservedIPv4('169.254.1.1')).toBe(true);
    });

    it('detects and blocks broadcast and multicast (224.0.0.0/4, 255.255.255.255)', () => {
      expect(isPrivateOrReservedIPv4('224.0.0.1')).toBe(true);
      expect(isPrivateOrReservedIPv4('239.255.255.255')).toBe(true);
      expect(isPrivateOrReservedIPv4('255.255.255.255')).toBe(true);
    });

    it('permits valid public IPv4 addresses', () => {
      expect(isPrivateOrReservedIPv4('157.240.22.35')).toBe(false);
      expect(isPrivateOrReservedIPv4('8.8.8.8')).toBe(false);
      expect(isPrivateOrReservedIPv4('1.1.1.1')).toBe(false);
    });
  });

  describe('IPv6 Address Filtering', () => {
    it('detects and blocks IPv6 loopback (::1)', () => {
      expect(isPrivateOrReservedIPv6('::1')).toBe(true);
      expect(isPrivateOrReservedIPv6('0:0:0:0:0:0:0:1')).toBe(true);
    });

    it('detects and blocks link-local (fe80::/10)', () => {
      expect(isPrivateOrReservedIPv6('fe80::1')).toBe(true);
      expect(isPrivateOrReservedIPv6('febf::abcd')).toBe(true);
    });

    it('detects and blocks unique-local (fc00::/7)', () => {
      expect(isPrivateOrReservedIPv6('fc00::1')).toBe(true);
      expect(isPrivateOrReservedIPv6('fd12:3456:789a::1')).toBe(true);
    });

    it('detects and blocks IPv4-mapped private IPv6 addresses', () => {
      expect(isPrivateOrReservedIPv6('::ffff:127.0.0.1')).toBe(true);
      expect(isPrivateOrReservedIPv6('::ffff:169.254.169.254')).toBe(true);
      expect(isPrivateOrReservedIPv6('::ffff:192.168.1.1')).toBe(true);
    });

    it('permits public IPv6 addresses', () => {
      expect(isPrivateOrReservedIPv6('2a03:2880:f12c:83:face:b00c:0:25de')).toBe(false);
      expect(isPrivateOrReservedIPv6('2606:4700:4700::1111')).toBe(false);
    });
  });

  describe('DNS Resolution & Destination Assertion', () => {
    it('blocks hosts that resolve to private or loopback IPs', async () => {
      const mockLookup = async () => [{ address: '127.0.0.1', family: 4 }];
      const res = await assertSafeDestinationHost('evil-rebinding.local', mockLookup as any);
      expect(res.safe).toBe(false);
      expect(res.error).toContain('private/reserved IP');
    });

    it('blocks hosts that resolve to cloud metadata service', async () => {
      const mockLookup = async () => [{ address: '169.254.169.254', family: 4 }];
      const res = await assertSafeDestinationHost('metadata.attacker.com', mockLookup as any);
      expect(res.safe).toBe(false);
      expect(res.error).toContain('private/reserved IP');
    });

    it('permits hosts that resolve strictly to public IPs', async () => {
      const mockLookup = async () => [
        { address: '157.240.22.35', family: 4 },
        { address: '2a03:2880:f12c:83:face:b00c:0:25de', family: 6 }
      ];
      const res = await assertSafeDestinationHost('scontent-iad3-1.cdninstagram.com', mockLookup as any);
      expect(res.safe).toBe(true);
      expect(res.resolvedIps).toHaveLength(2);
    });

    it('handles DNS resolution failure cleanly', async () => {
      const mockLookup = async () => {
        throw new Error('ENOTFOUND');
      };
      const res = await assertSafeDestinationHost('nonexistent-host.example', mockLookup as any);
      expect(res.safe).toBe(false);
      expect(res.error).toContain('DNS resolution failed');
    });
  });
});
