import { MediaItem } from '../types/queue.js';

export interface ClientResolveResult {
  ok: boolean;
  shortcode: string;
  title?: string;
  author?: string;
  media?: MediaItem[];
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Client-Side Deterministic Mock Resolver
 * Allows the frontend static bundle to run seamlessly in standalone Demo Mode
 * (e.g. on GitHub Pages) without requiring a running backend proxy.
 */
export async function resolveClientMock(shortcode: string): Promise<ClientResolveResult> {
  // Simulate network latency (250ms) for realistic UX demonstration
  await new Promise((resolve) => setTimeout(resolve, 250));

  const lower = shortcode.toLowerCase();

  if (lower.includes('private')) {
    return {
      ok: false,
      shortcode,
      error: {
        code: 'PRIVATE_ACCOUNT',
        message: 'This account or post is private and cannot be retrieved.'
      }
    };
  }

  if (lower.includes('error')) {
    return {
      ok: false,
      shortcode,
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
      title: `Reel by @creator_${shortcode} (Demo Fixture)`,
      author: `creator_${shortcode}`,
      media: [
        {
          type: 'video',
          url: `https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4?shortcode=${shortcode}`,
          thumbnailUrl: `https://picsum.photos/seed/${shortcode}/1080/1920`,
          width: 1080,
          height: 1920,
          filename: `snapora_demo_video_${shortcode}.mp4`
        }
      ]
    };
  }

  if (lower.includes('carousel') || lower.includes('multi')) {
    return {
      ok: true,
      shortcode,
      title: `Carousel by @photographer_${shortcode} (Demo Fixture)`,
      author: `photographer_${shortcode}`,
      media: [
        {
          type: 'image',
          url: `https://picsum.photos/seed/${shortcode}_1/1080/1080`,
          thumbnailUrl: `https://picsum.photos/seed/${shortcode}_1/320/320`,
          width: 1080,
          height: 1080,
          filename: `snapora_demo_photo_${shortcode}_1.jpg`
        },
        {
          type: 'image',
          url: `https://picsum.photos/seed/${shortcode}_2/1080/1080`,
          thumbnailUrl: `https://picsum.photos/seed/${shortcode}_2/320/320`,
          width: 1080,
          height: 1080,
          filename: `snapora_demo_photo_${shortcode}_2.jpg`
        }
      ]
    };
  }

  // Standard photo fixture
  return {
    ok: true,
    shortcode,
    title: `Photo by @user_${shortcode} (Demo Fixture)`,
    author: `user_${shortcode}`,
    media: [
      {
        type: 'image',
        url: `https://picsum.photos/seed/${shortcode}/1080/1080`,
        thumbnailUrl: `https://picsum.photos/seed/${shortcode}/320/320`,
        width: 1080,
        height: 1080,
        filename: `snapora_demo_photo_${shortcode}.jpg`
      }
    ]
  };
}
