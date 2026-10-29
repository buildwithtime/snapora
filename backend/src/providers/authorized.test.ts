import { describe, it, expect, vi } from 'vitest';
import { AuthorizedAccountMediaProvider } from './authorized.js';

describe('AuthorizedAccountMediaProvider Suite', () => {
  it('returns authentication_required status when userAccessToken is missing', async () => {
    const provider = new AuthorizedAccountMediaProvider();
    const result = await provider.resolve('https://www.instagram.com/p/Cxyz123/', 'Cxyz123');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe('authentication_required');
      expect(result.error.code).toBe('AUTHENTICATION_REQUIRED');
      expect(result.error.message).toContain('Connecting an authorized Instagram account is required');
    }
  });

  it('declares authentic capabilities for authorized creator downloads', () => {
    const provider = new AuthorizedAccountMediaProvider();
    const caps = provider.getCapabilities();
    expect(caps.supportsPreview).toBe(true);
    expect(caps.supportsOriginalDownload).toBe(true);
    expect(caps.supportsCarousel).toBe(true);
    expect(caps.requiresAuthentication).toBe(true);
    expect(caps.requiresConfiguration).toBe(true);
  });

  it('resolves authenticated media and carousel album when valid token and data are supplied', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: '17900123456789',
            permalink: 'https://www.instagram.com/p/Cxyz123/',
            caption: 'Our exciting project launch!',
            media_type: 'CAROUSEL_ALBUM',
            thumbnail_url: 'https://scontent.cdninstagram.com/thumb.jpg',
            children: {
              data: [
                {
                  id: 'child_1',
                  media_type: 'IMAGE',
                  media_url: 'https://scontent.cdninstagram.com/photo1.jpg'
                },
                {
                  id: 'child_2',
                  media_type: 'VIDEO',
                  media_url: 'https://scontent.cdninstagram.com/video2.mp4',
                  thumbnail_url: 'https://scontent.cdninstagram.com/thumb2.jpg'
                }
              ]
            }
          }
        ]
      })
    });

    const provider = new AuthorizedAccountMediaProvider({
      userAccessToken: 'mock_valid_user_oauth_token',
      fetchFn: mockFetch as any
    });

    const result = await provider.resolve('https://www.instagram.com/p/Cxyz123/', 'Cxyz123');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe('media_download_available');
      expect(result.downloadAvailable).toBe(true);
      expect(result.media).toHaveLength(2);
      expect(result.carouselItems).toHaveLength(2);
      expect(result.carouselItems?.[0].type).toBe('image');
      expect(result.carouselItems?.[1].type).toBe('video');
    }
  });

  it('handles expired or invalid token gracefully with authentication error', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        error: { message: 'Session has expired', type: 'OAuthException', code: 190 }
      })
    });

    const provider = new AuthorizedAccountMediaProvider({
      userAccessToken: 'expired_token',
      fetchFn: mockFetch as any
    });

    const result = await provider.resolve('https://www.instagram.com/p/Cxyz123/', 'Cxyz123');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe('authentication_required');
      expect(result.error.code).toBe('AUTHENTICATION_ERROR');
    }
  });
});
