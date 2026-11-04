import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PublicWebMediaProvider } from './public.js';
import * as ssrfClient from '../utils/ssrfClient.js';
import { Readable } from 'node:stream';
import { UpstreamResilienceManager } from '../utils/resilience.js';

describe('PublicWebMediaProvider Suite', () => {
  let provider: PublicWebMediaProvider;
  let resilienceManager: UpstreamResilienceManager;

  beforeEach(() => {
    resilienceManager = new UpstreamResilienceManager();
    provider = new PublicWebMediaProvider({ timeoutMs: 5000, resilienceManager });
    vi.restoreAllMocks();
  });

  it('exposes accurate capabilities reflecting public web extraction', () => {
    const caps = provider.getCapabilities();
    expect(caps.supportsPreview).toBe(true);
    expect(caps.supportsMetadata).toBe(true);
    expect(caps.supportsOriginalDownload).toBe(true);
    expect(caps.supportsCarousel).toBe(true);
    expect(caps.requiresAuthentication).toBe(false);
    expect(caps.requiresConfiguration).toBe(false);
    expect(caps.supportsProfileDiscovery).toBe(true);
  });

  it('identifies eligible profile URLs and handles', () => {
    expect(provider.canDiscoverProfile('https://www.instagram.com/natgeo/')).toBe(true);
    expect(provider.canDiscoverProfile('natgeo')).toBe(true);
    expect(provider.canDiscoverProfile('@natgeo')).toBe(true);
    expect(provider.canDiscoverProfile('invalid..user')).toBe(false);
  });

  it('identifies eligible Instagram post and reel URLs', () => {
    expect(provider.canResolve('https://www.instagram.com/p/DfBnbDEGJSx/')).toBe(true);
    expect(provider.canResolve('https://instagram.com/reel/C8Reel123/')).toBe(true);
    expect(provider.canResolve('https://www.instagram.com/tv/C8Tv123/')).toBe(true);
    expect(provider.canResolve('https://twitter.com/post/123')).toBe(false);
    expect(provider.canResolve('https://scontent.cdninstagram.com/v/t51/img.jpg')).toBe(false);
  });

  it('rejects malformed or invalid URLs immediately', async () => {
    const res = await provider.resolve('invalid-url', 'invalid');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('UNSUPPORTED_URL');
    }
  });

  it('resolves multi-item mixed carousel posts and preserves 1-indexed ordering', async () => {
    const carouselJson = JSON.stringify({
      xig_polaris_media: {
        id: 'POLARIS_99999',
        code: 'C_carousel_test',
        media_type: 8,
        original_width: 1080,
        original_height: 1350,
        user: { username: 'creator_jane', full_name: 'Jane Creator' },
        caption: { text: 'Summer Vacation Photo Album' },
        carousel_media: [
          {
            id: 'slide_1',
            media_type: 1,
            original_width: 1080,
            original_height: 1350,
            image_versions2: {
              candidates: [
                { width: 1080, height: 1350, url: 'https://scontent.cdninstagram.com/v/slide1_high.jpg?oh=1&oe=2' },
                { width: 640, height: 800, url: 'https://scontent.cdninstagram.com/v/slide1_thumb.jpg?oh=1&oe=2' }
              ]
            }
          },
          {
            id: 'slide_2',
            media_type: 2,
            original_width: 1080,
            original_height: 1920,
            image_versions2: {
              candidates: [
                { width: 1080, height: 1920, url: 'https://scontent.cdninstagram.com/v/slide2_poster.jpg?oh=1&oe=2' }
              ]
            },
            video_versions: [
              { width: 1080, height: 1920, url: 'https://video.cdninstagram.com/v/slide2_video.mp4?oh=1&oe=2' }
            ]
          }
        ]
      }
    });

    const mockCarouselHtml = `<!DOCTYPE html><html><head><script type="application/json" data-sjs>${carouselJson}</script></head></html>`;

    vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValue({
      statusCode: 200,
      headers: { 'content-type': 'text/html' },
      stream: Readable.from([mockCarouselHtml]) as any,
      finalUrl: 'https://www.instagram.com/p/C_carousel_test/'
    });

    const res = await provider.resolve('https://www.instagram.com/p/C_carousel_test/', 'C_carousel_test');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.provider).toBe('public');
      expect(res.author).toBe('creator_jane');
      expect(res.title).toBe('Summer Vacation Photo Album');
      expect(res.carouselItems).toHaveLength(2);
      expect(res.media).toHaveLength(2);

      // Slide 1 check
      const slide1 = res.carouselItems![0];
      expect(slide1.type).toBe('image');
      expect(slide1.downloadable).toBe(true);
      expect(slide1.url).toBe('https://scontent.cdninstagram.com/v/slide1_high.jpg?oh=1&oe=2');
      expect(slide1.carouselPosition).toEqual({ index: 1, total: 2 });
      expect(slide1.filename).toBe('C_carousel_test_slide_1_slide_1.jpg');

      // Slide 2 check
      const slide2 = res.carouselItems![1];
      expect(slide2.type).toBe('video');
      expect(slide2.downloadable).toBe(true);
      expect(slide2.url).toBe('https://video.cdninstagram.com/v/slide2_video.mp4?oh=1&oe=2');
      expect(slide2.carouselPosition).toEqual({ index: 2, total: 2 });
      expect(slide2.filename).toBe('C_carousel_test_slide_2_slide_2.mp4');
    }
  });

  it('resolves single photo posts', async () => {
    const photoJson = JSON.stringify({
      xig_polaris_media: {
        id: 'single_photo_1',
        code: 'C_photo',
        media_type: 1,
        original_width: 1080,
        original_height: 1080,
        user: { username: 'photographer' },
        caption: { text: 'Golden Hour Sunset' },
        image_versions2: {
          candidates: [
            { width: 1080, height: 1080, url: 'https://scontent.cdninstagram.com/v/sunset.jpg?oh=1&oe=2' }
          ]
        }
      }
    });

    const mockPhotoHtml = `<!DOCTYPE html><html><head><script type="application/json" data-sjs>${photoJson}</script></head></html>`;

    vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValue({
      statusCode: 200,
      headers: { 'content-type': 'text/html' },
      stream: Readable.from([mockPhotoHtml]) as any,
      finalUrl: 'https://www.instagram.com/p/C_photo/'
    });

    const res = await provider.resolve('https://www.instagram.com/p/C_photo/', 'C_photo');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.media).toHaveLength(1);
      expect(res.media![0].type).toBe('image');
      expect(res.media![0].downloadable).toBe(true);
      expect(res.media![0].url).toBe('https://scontent.cdninstagram.com/v/sunset.jpg?oh=1&oe=2');
      expect(res.media![0].filename).toBe('C_photo.jpg');
    }
  });

  it('resolves single video Reel posts', async () => {
    const reelJson = JSON.stringify({
      xig_polaris_media: {
        id: 'reel_video_1',
        code: 'D_reel',
        media_type: 2,
        original_width: 1080,
        original_height: 1920,
        user: { username: 'traveler' },
        caption: { text: 'Mountains Drone Video' },
        image_versions2: {
          candidates: [
            { width: 1080, height: 1920, url: 'https://scontent.cdninstagram.com/v/thumb.jpg?oh=1&oe=2' }
          ]
        },
        video_versions: [
          { width: 1080, height: 1920, url: 'https://video.cdninstagram.com/v/drone.mp4?oh=1&oe=2' }
        ]
      }
    });

    const mockReelHtml = `<!DOCTYPE html><html><head><script type="application/json" data-sjs>${reelJson}</script></head></html>`;

    vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValue({
      statusCode: 200,
      headers: { 'content-type': 'text/html' },
      stream: Readable.from([mockReelHtml]) as any,
      finalUrl: 'https://www.instagram.com/reel/D_reel/'
    });

    const res = await provider.resolve('https://www.instagram.com/reel/D_reel/', 'D_reel');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.media).toHaveLength(1);
      expect(res.media![0].type).toBe('video');
      expect(res.media![0].downloadable).toBe(true);
      expect(res.media![0].url).toBe('https://video.cdninstagram.com/v/drone.mp4?oh=1&oe=2');
      expect(res.media![0].filename).toBe('D_reel.mp4');
    }
  });

  it('extracts from OpenGraph tags when script tags are absent', async () => {
    const mockOgHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta property="og:title" content="alex on Instagram: &quot;Awesome cityscape view&quot;" />
          <meta property="og:image" content="https://scontent.cdninstagram.com/v/city.jpg?oh=1&amp;oe=2" />
        </head>
      </html>
    `;

    vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValue({
      statusCode: 200,
      headers: { 'content-type': 'text/html' },
      stream: Readable.from([mockOgHtml]) as any,
      finalUrl: 'https://www.instagram.com/p/C_og/'
    });

    const res = await provider.resolve('https://www.instagram.com/p/C_og/', 'C_og');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.author).toBe('alex');
      expect(res.media).toHaveLength(1);
      expect(res.media![0].url).toBe('https://scontent.cdninstagram.com/v/city.jpg?oh=1&oe=2');
    }
  });

  it('handles HTTP 404 deleted posts cleanly', async () => {
    vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValue({
      statusCode: 404,
      headers: {},
      stream: Readable.from([]) as any,
      finalUrl: 'https://www.instagram.com/p/deleted_post/'
    });

    const res = await provider.resolve('https://www.instagram.com/p/deleted_post/', 'deleted_post');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('CONTENT_UNAVAILABLE');
      expect(res.status).toBe('permanently_inaccessible');
    }
  });

  it('handles HTTP 429 rate limits gracefully with generic message when Retry-After is absent', async () => {
    vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValue({
      statusCode: 429,
      headers: {},
      stream: Readable.from([]) as any,
      finalUrl: 'https://www.instagram.com/p/rate_limited/'
    });

    const res = await provider.resolve('https://www.instagram.com/p/rate_limited/', 'rate_limited');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('UPSTREAM_RATE_LIMITED');
      expect(res.status).toBe('rate_limited');
      expect(res.error.message).toBe('Instagram is temporarily limiting requests. Please try again in 1 minute.');
      expect(res.error.retryAfterSeconds).toBe(60);
    }
  });

  it('handles HTTP 429 rate limits with delta-seconds Retry-After header', async () => {
    vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValue({
      statusCode: 429,
      headers: { 'retry-after': '45' },
      stream: Readable.from([]) as any,
      finalUrl: 'https://www.instagram.com/p/rate_limited/'
    });

    const res = await provider.resolve('https://www.instagram.com/p/rate_limited/', 'rate_limited');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('UPSTREAM_RATE_LIMITED');
      expect(res.status).toBe('rate_limited');
      expect(res.error.message).toBe('Instagram is temporarily limiting requests. Please try again in 45 seconds.');
      expect(res.error.retryAfterSeconds).toBe(45);
    }
  });

  it('handles HTTP 429 rate limits with HTTP-date Retry-After header', async () => {
    const futureDate = new Date(Date.now() + 120000).toUTCString();
    vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValue({
      statusCode: 429,
      headers: { 'retry-after': futureDate },
      stream: Readable.from([]) as any,
      finalUrl: 'https://www.instagram.com/p/rate_limited/'
    });

    const res = await provider.resolve('https://www.instagram.com/p/rate_limited/', 'rate_limited');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('UPSTREAM_RATE_LIMITED');
      expect(res.status).toBe('rate_limited');
      expect(res.error.message).toMatch(/Instagram is temporarily limiting requests\. Please try again in \d+ minute/);
      expect(res.error.retryAfterSeconds).toBeGreaterThan(0);
    }
  });

  it('handles private post redirecting to login cleanly', async () => {
    vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValue({
      statusCode: 200,
      headers: { 'content-type': 'text/html' },
      stream: Readable.from(['<html><body>login_page</body></html>']) as any,
      finalUrl: 'https://www.instagram.com/accounts/login/?next=/p/private_post/'
    });

    const res = await provider.resolve('https://www.instagram.com/p/private_post/', 'private_post');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('CONTENT_PRIVATE');
    }
  });

  it('classifies unauthenticated SPA client shells as LOGIN_WALL_ENCOUNTERED', async () => {
    vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValue({
      statusCode: 200,
      headers: { 'content-type': 'text/html' },
      stream: Readable.from(['<html><head><title>Instagram</title></head><body><script>{"require":[["PolarisLogin"]]}</script></body></html>']) as any,
      finalUrl: 'https://www.instagram.com/reel/C8q84p7SOlM/'
    });

    const res = await provider.resolve('https://www.instagram.com/reel/C8q84p7SOlM/', 'C8q84p7SOlM');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('LOGIN_WALL_ENCOUNTERED');
      expect(res.status).toBe('authentication_required');
      expect(res.error.message).toContain('Instagram served an unauthenticated web shell');
    }
  });

  it('classifies missing metadata on rendered HTML as METADATA_NOT_FOUND', async () => {
    vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValue({
      statusCode: 200,
      headers: { 'content-type': 'text/html' },
      stream: Readable.from(['<html><head><title>Some User on Instagram</title></head><body>No scripts here</body></html>']) as any,
      finalUrl: 'https://www.instagram.com/p/valid_page_no_media/'
    });

    const res = await provider.resolve('https://www.instagram.com/p/valid_page_no_media/', 'valid_page_no_media');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('METADATA_NOT_FOUND');
      expect(res.status).toBe('unsupported_content');
    }
  });

  it('classifies DNS or network connectivity failure as PAGE_FETCH_FAILED', async () => {
    vi.spyOn(ssrfClient, 'safeHttpsRequest').mockRejectedValue(
      new Error('getaddrinfo ENOTFOUND www.instagram.com')
    );

    const res = await provider.resolve('https://www.instagram.com/p/dns_failure/', 'dns_failure');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('PAGE_FETCH_FAILED');
      expect(res.status).toBe('provider_error');
    }
  });

  describe('Public Profile Discovery & Identity Validation', () => {
    it('rejects anonymous cursor pagination with UNSUPPORTED_RETRIEVAL_METHOD', async () => {
      const res = await provider.discoverProfile('https://www.instagram.com/creator_studio/', { cursor: 'cursor_page_2' });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe('UNSUPPORTED_RETRIEVAL_METHOD');
        expect(res.error.message).toContain('Instagram does not support anonymous pagination on public profiles');
      }
    });

    it('classifies login wall HTML as LOGIN_WALL_ENCOUNTERED without extracting unrelated scripts', async () => {
      const loginWallHtml = `<!DOCTYPE html><html><head><title>Login • Instagram</title></head><body>
        <script type="application/json">{"suggested_users": [{"username": "unrelated_creator", "profile_pic_url": "https://cdn.example.com/pic.jpg"}]}</script>
        <div class="login-box">Please log in to continue</div>
      </body></html>`;

      vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValue({
        statusCode: 200,
        headers: { 'content-type': 'text/html' },
        stream: Readable.from([loginWallHtml]) as any,
        finalUrl: 'https://www.instagram.com/accounts/login/?next=/creator_studio/'
      });

      const res = await provider.discoverProfile('creator_studio');
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe('LOGIN_WALL_ENCOUNTERED');
      }
    });

    it('rejects suggested users and extracts only the node matching the requested username', async () => {
      const profileHtml = `<!DOCTYPE html><html><head><title>Target Creator (@target_creator) • Instagram</title></head><body>
        <script type="application/json">
        {
          "entry_data": {
            "ProfilePage": [{
              "edge_suggested_users": {
                "edges": [{
                  "node": {
                    "username": "some_other_influencer",
                    "profile_pic_url": "https://cdn.example.com/other.jpg"
                  }
                }]
              },
              "graphql": {
                "user": {
                  "username": "target_creator",
                  "full_name": "Target Creator",
                  "biography": "Official photography profile.",
                  "profile_pic_url": "https://cdn.example.com/target_avatar.jpg",
                  "is_private": false,
                  "is_verified": true,
                  "edge_owner_to_timeline_media": {
                    "count": 1,
                    "page_info": { "has_next_page": false },
                    "edges": [{
                      "node": {
                        "id": "111222333",
                        "shortcode": "CtArGeT123",
                        "is_video": false,
                        "display_url": "https://scontent.cdninstagram.com/v/target_post.jpg?oh=1",
                        "thumbnail_src": "https://scontent.cdninstagram.com/v/target_thumb.jpg?oh=1",
                        "edge_media_to_caption": { "edges": [{ "node": { "text": "Post caption" } }] }
                      }
                    }]
                  }
                }
              }
            }]
          }
        }
        </script>
      </body></html>`;

      vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValue({
        statusCode: 200,
        headers: { 'content-type': 'text/html' },
        stream: Readable.from([profileHtml]) as any,
        finalUrl: 'https://www.instagram.com/target_creator/'
      });

      const res = await provider.discoverProfile('target_creator');
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.profile.username).toBe('target_creator');
        expect(res.profile.profileUrl).toBe('https://www.instagram.com/target_creator/');
        expect(res.profile.fullName).toBe('Target Creator');
        expect(res.items).toHaveLength(1);
        expect(res.items[0].shortcode).toBe('CtArGeT123');
      }
    });

    it('returns CONTENT_UNAVAILABLE when only unrelated suggested creators exist in HTML', async () => {
      const unrelatedHtml = `<!DOCTYPE html><html><head><title>Instagram</title></head><body>
        <script type="application/json">
        {
          "entry_data": {
            "ProfilePage": [{
              "edge_suggested_users": {
                "edges": [{
                  "node": {
                    "username": "unrelated_creator",
                    "profile_pic_url": "https://cdn.example.com/other.jpg"
                  }
                }]
              }
            }]
          }
        }
        </script>
      </body></html>`;

      vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValue({
        statusCode: 200,
        headers: { 'content-type': 'text/html' },
        stream: Readable.from([unrelatedHtml]) as any,
        finalUrl: 'https://www.instagram.com/requested_creator/'
      });

      const res = await provider.discoverProfile('requested_creator');
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe('CONTENT_UNAVAILABLE');
      }
    });
  });
});
