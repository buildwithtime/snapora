import { describe, it, expect, vi } from 'vitest';
import { DirectMediaUrlProvider } from './direct.js';

describe('DirectMediaUrlProvider Suite', () => {
  it('correctly matches and identifies valid CDN URLs', () => {
    const provider = new DirectMediaUrlProvider();
    expect(provider.canResolve('https://scontent-iad3-1.cdninstagram.com/v/t51.2885-15/photo.jpg?oh=1&oe=2')).toBe(true);
    expect(provider.canResolve('https://instagram.fdel1-1.fna.fbcdn.net/v/t51.2885-15/video.mp4?oh=1&oe=2')).toBe(true);
    expect(provider.canResolve('https://www.instagram.com/p/Cxyz123/')).toBe(false);
  });

  it('declares authentic capabilities for direct downloads', () => {
    const provider = new DirectMediaUrlProvider();
    const caps = provider.getCapabilities();
    expect(caps.supportsPreview).toBe(true);
    expect(caps.supportsOriginalDownload).toBe(true);
    expect(caps.supportsCarousel).toBe(false);
    expect(caps.requiresAuthentication).toBe(false);
    expect(caps.requiresConfiguration).toBe(false);
  });

  it('resolves valid direct CDN image with mock safe DNS', async () => {
    const mockLookup = vi.fn().mockResolvedValue([{ address: '157.240.22.35', family: 4 }]);
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({
        'content-length': '204800',
        'content-type': 'image/jpeg'
      })
    });

    const provider = new DirectMediaUrlProvider({
      lookupFn: mockLookup,
      fetchFn: mockFetch as any
    });

    const cdnUrl = 'https://scontent-iad3-1.cdninstagram.com/v/t51.2885-15/test.jpg?_nc_cat=1&oh=abc12345&oe=7fffffff';
    const result = await provider.resolve(cdnUrl, 'test_shortcode');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe('media_download_available');
      expect(result.downloadAvailable).toBe(true);
      expect(result.media).toHaveLength(1);
      expect(result.media?.[0].type).toBe('image');
      expect(result.media?.[0].filename).toContain('.jpg');
    }
  });

  it('rejects expired direct media URLs via oe hex timestamp', async () => {
    const mockLookup = vi.fn().mockResolvedValue([{ address: '157.240.22.35', family: 4 }]);
    const provider = new DirectMediaUrlProvider({ lookupFn: mockLookup });

    // oe timestamp 60000000 (Jan 2021, expired)
    const expiredUrl = 'https://scontent-iad3-1.cdninstagram.com/v/t51.2885-15/test.jpg?oh=abc&oe=60000000';
    const result = await provider.resolve(expiredUrl, 'test_expired');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('CONTENT_UNAVAILABLE');
      expect(result.error.message).toContain('expired');
    }
  });

  it('blocks direct media resolution if DNS resolves to private IP (SSRF)', async () => {
    const mockLookup = vi.fn().mockResolvedValue([{ address: '10.0.0.5', family: 4 }]);
    const provider = new DirectMediaUrlProvider({ lookupFn: mockLookup });

    const cdnUrl = 'https://scontent-iad3-1.cdninstagram.com/v/t51.2885-15/test.jpg?oh=abc&oe=7fffffff';
    const result = await provider.resolve(cdnUrl, 'test_ssrf');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('SSRF_BLOCKED');
    }
  });
});
