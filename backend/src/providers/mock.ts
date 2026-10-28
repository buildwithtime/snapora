import { IMediaProvider, ResolveResult } from './types.js';

export class MockProvider implements IMediaProvider {
  name = 'MockProvider';

  canResolve(url: string): boolean {
    return url.includes('instagram.com') || url.includes('instagr.am');
  }

  async resolve(_url: string, shortcode: string): Promise<ResolveResult> {
    // Artificial slight delay for realistic queue testing
    await new Promise((resolve) => setTimeout(resolve, 50));

    const lower = shortcode.toLowerCase();

    if (lower.includes('private')) {
      return {
        ok: false,
        error: {
          code: 'PRIVATE_ACCOUNT',
          message: 'This account or post is private and cannot be retrieved.'
        }
      };
    }

    if (lower.includes('error')) {
      return {
        ok: false,
        error: {
          code: 'PROVIDER_ERROR',
          message: 'Upstream media endpoint failed to respond.'
        }
      };
    }

    if (lower.includes('video') || lower.includes('reel')) {
      return {
        ok: true,
        shortcode,
        title: `Reel by @creator_${shortcode}`,
        author: `creator_${shortcode}`,
        media: [
          {
            type: 'video',
            url: `https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4?shortcode=${shortcode}`,
            thumbnailUrl: `https://picsum.photos/seed/${shortcode}/1080/1920`,
            width: 1080,
            height: 1920,
            filename: `snapora_video_${shortcode}.mp4`
          }
        ]
      };
    }

    if (lower.includes('carousel') || lower.includes('multi')) {
      return {
        ok: true,
        shortcode,
        title: `Carousel by @photographer_${shortcode}`,
        author: `photographer_${shortcode}`,
        media: [
          {
            type: 'image',
            url: `https://picsum.photos/seed/${shortcode}_1/1080/1080`,
            thumbnailUrl: `https://picsum.photos/seed/${shortcode}_1/320/320`,
            width: 1080,
            height: 1080,
            filename: `snapora_photo_${shortcode}_1.jpg`
          },
          {
            type: 'image',
            url: `https://picsum.photos/seed/${shortcode}_2/1080/1080`,
            thumbnailUrl: `https://picsum.photos/seed/${shortcode}_2/320/320`,
            width: 1080,
            height: 1080,
            filename: `snapora_photo_${shortcode}_2.jpg`
          }
        ]
      };
    }

    // Default single photo fixture
    return {
      ok: true,
      shortcode,
      title: `Photo by @user_${shortcode}`,
      author: `user_${shortcode}`,
      media: [
        {
          type: 'image',
          url: `https://picsum.photos/seed/${shortcode}/1080/1080`,
          thumbnailUrl: `https://picsum.photos/seed/${shortcode}/320/320`,
          width: 1080,
          height: 1080,
          filename: `snapora_photo_${shortcode}.jpg`
        }
      ]
    };
  }
}
