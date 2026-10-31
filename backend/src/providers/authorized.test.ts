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
    expect(caps.supportsProfileDiscovery).toBe(true);
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

  it('discovers profile media when authorized token is supplied', async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/me?')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            id: '12345',
            username: 'auth_creator',
            name: 'Authorized Creator',
            media_count: 5
          })
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            {
              id: 'post_1',
              media_type: 'IMAGE',
              media_url: 'https://cdn.example.com/photo.jpg',
              permalink: 'https://www.instagram.com/p/Code1/',
              caption: 'Hello World'
            }
          ],
          paging: { cursors: { after: 'next_cursor' } }
        })
      });
    });

    const provider = new AuthorizedAccountMediaProvider({
      userAccessToken: 'valid_token',
      fetchFn: mockFetch as any
    });

    const res = await provider.discoverProfile('auth_creator');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.profile.username).toBe('auth_creator');
      expect(res.items).toHaveLength(1);
      expect(res.items[0].shortcode).toBe('Code1');
    }

    // Verify Bearer header was sent
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('https://graph.facebook.com/'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer valid_token'
        })
      })
    );
  });

  it('rejects profile discovery when requested user does not match authorized token owner', async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          id: '12345',
          username: 'my_creator_account',
          name: 'My Creator Account'
        })
      });
    });

    const provider = new AuthorizedAccountMediaProvider({
      userAccessToken: 'valid_token',
      fetchFn: mockFetch as any
    });

    const res = await provider.discoverProfile('arbitrary_other_user');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('AUTHENTICATION_REQUIRED');
      expect(res.error.message).toContain('only provides authorized access to your own managed creator or business account');
    }
  });

  it('rejects malformed pagination cursor with invalid characters', async () => {
    const provider = new AuthorizedAccountMediaProvider({
      userAccessToken: 'valid_token'
    });

    const res = await provider.discoverProfile('auth_creator', {
      cursor: 'https://attacker.com/evil'
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('INVALID_REQUEST');
      expect(res.error.message).toContain('Malformed pagination cursor');
    }
  });

  it('accepts valid Meta Graph API Base64 cursor with padding and constructs proper after parameter', async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/me?')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ id: '12345', username: 'auth_creator' })
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ data: [] })
      });
    });

    const provider = new AuthorizedAccountMediaProvider({
      userAccessToken: 'valid_token',
      fetchFn: mockFetch as any
    });

    const validMetaCursor = 'QVFIUk9xTXpFeU16RTFPRFkzTmpFM09EZ3lNREU9PQ==';
    const res = await provider.discoverProfile('auth_creator', {
      cursor: validMetaCursor
    });

    expect(res.ok).toBe(true);
    // Check that destination host remained graph.facebook.com and cursor was passed in searchParams
    const mediaCall = mockFetch.mock.calls.find((c: any[]) => c[0].includes('/me/media'));
    expect(mediaCall).toBeDefined();
    expect(mediaCall[0]).toContain('https://graph.facebook.com/');
    expect(mediaCall[0]).toContain(encodeURIComponent(validMetaCursor));
  });

  it('returns AUTHENTICATION_ERROR when Meta Graph API returns OAuthException code 190', async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/me?')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ id: '12345', username: 'auth_creator' })
        });
      }
      return Promise.resolve({
        ok: false,
        status: 400,
        json: async () => ({
          error: { message: 'Error validating access token: Session expired', code: 190, type: 'OAuthException' }
        })
      });
    });

    const provider = new AuthorizedAccountMediaProvider({
      userAccessToken: 'valid_token',
      fetchFn: mockFetch as any
    });

    const res = await provider.discoverProfile('auth_creator');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('AUTHENTICATION_ERROR');
    }
  });
});
