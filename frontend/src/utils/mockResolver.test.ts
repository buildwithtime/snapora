import { describe, it, expect } from 'vitest';
import { resolveClientMock } from './mockResolver.js';

describe('Client-Side Mock Resolver Suite', () => {
  it('resolves photo fixture for standard shortcode', async () => {
    const res = await resolveClientMock('Cxyz123');
    expect(res.ok).toBe(true);
    expect(res.media).toHaveLength(1);
    expect(res.media![0].type).toBe('image');
    expect(res.media![0].filename).toContain('.jpg');
  });

  it('resolves video reel fixture for reel shortcode', async () => {
    const res = await resolveClientMock('my_video_reel');
    expect(res.ok).toBe(true);
    expect(res.media![0].type).toBe('video');
    expect(res.media![0].filename).toContain('.mp4');
  });

  it('resolves multi-image carousel fixture', async () => {
    const res = await resolveClientMock('vacation_carousel');
    expect(res.ok).toBe(true);
    expect(res.media!.length).toBeGreaterThanOrEqual(2);
  });

  it('returns private account error for private shortcode', async () => {
    const res = await resolveClientMock('private_account_post');
    expect(res.ok).toBe(false);
    expect(res.error?.code).toBe('PRIVATE_ACCOUNT');
  });

  it('returns provider error for error shortcode', async () => {
    const res = await resolveClientMock('error_shortcode');
    expect(res.ok).toBe(false);
    expect(res.error?.code).toBe('PROVIDER_ERROR');
  });
});
