import { MediaItem, CarouselItem, ResolutionStatus, PreviewData } from '../types/queue.js';
import { ProfileDiscoveryResult, ProfileMediaItem } from '../types/profile.js';

export interface ClientResolveResult {
  ok: boolean;
  shortcode: string;
  status?: ResolutionStatus;
  provider?: string;
  title?: string;
  author?: string;
  downloadAvailable?: boolean;
  disclaimer?: string;
  preview?: PreviewData;
  media?: MediaItem[];
  carouselItems?: CarouselItem[];
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
      status: 'preview_unavailable',
      provider: 'MockProvider (Demo Mode)',
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
      status: 'provider_error',
      provider: 'MockProvider (Demo Mode)',
      shortcode,
      error: {
        code: 'PROVIDER_ERROR',
        message: 'Upstream media endpoint failed to respond.'
      }
    };
  }

  // Simulated Live Preview only (no media file)
  if (lower.includes('preview') || lower.includes('oembed')) {
    return {
      ok: true,
      status: 'live_preview_retrieved',
      provider: 'MockOEmbed (Demo Preview)',
      shortcode,
      title: `Live Preview Demo for @creator_${shortcode}`,
      author: `creator_${shortcode}`,
      downloadAvailable: false,
      disclaimer: 'Official Meta oEmbed preview. Meta public APIs provide embedding and thumbnail metadata, but do not provide raw downloadable media files.',
      preview: {
        type: 'embed',
        html: `<blockquote class="instagram-media">Preview fixture for ${shortcode}</blockquote>`,
        thumbnailUrl: `https://picsum.photos/seed/${shortcode}/640/640`,
        thumbnailWidth: 640,
        thumbnailHeight: 640,
        authorName: `creator_${shortcode}`,
        title: `Live Preview Demo for @creator_${shortcode}`,
        providerName: 'Instagram'
      },
      media: []
    };
  }

  if (lower.includes('video') || lower.includes('reel')) {
    const videoItem: MediaItem = {
      id: `demo_vid_${shortcode}`,
      postId: shortcode,
      type: 'video',
      url: `https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4?shortcode=${shortcode}`,
      previewUrl: `https://picsum.photos/seed/${shortcode}/1080/1920`,
      thumbnailUrl: `https://picsum.photos/seed/${shortcode}/1080/1920`,
      width: 1080,
      height: 1920,
      filename: `snapora_demo_video_${shortcode}.mp4`,
      provider: 'MockProvider (Demo Mode)',
      downloadable: true,
      carouselPosition: { index: 0, total: 1 }
    };

    return {
      ok: true,
      status: 'media_download_available',
      provider: 'MockProvider (Demo Mode)',
      shortcode,
      title: `Reel by @creator_${shortcode} (Demo Fixture)`,
      author: `creator_${shortcode}`,
      downloadAvailable: true,
      disclaimer: 'Simulated demo fixture generated client-side.',
      preview: {
        type: 'thumbnail',
        thumbnailUrl: videoItem.thumbnailUrl,
        thumbnailWidth: 1080,
        thumbnailHeight: 1920,
        authorName: `creator_${shortcode}`,
        title: `Reel by @creator_${shortcode}`
      },
      media: [videoItem]
    };
  }

  if (lower.includes('carousel') || lower.includes('multi')) {
    const mediaItems: MediaItem[] = [
      {
        id: `demo_car_${shortcode}_1`,
        postId: shortcode,
        type: 'image',
        url: `https://picsum.photos/seed/${shortcode}_1/1080/1080`,
        previewUrl: `https://picsum.photos/seed/${shortcode}_1/1080/1080`,
        thumbnailUrl: `https://picsum.photos/seed/${shortcode}_1/320/320`,
        width: 1080,
        height: 1080,
        filename: `snapora_demo_photo_${shortcode}_1.jpg`,
        provider: 'MockProvider (Demo Mode)',
        downloadable: true,
        carouselPosition: { index: 0, total: 2 }
      },
      {
        id: `demo_car_${shortcode}_2`,
        postId: shortcode,
        type: 'image',
        url: `https://picsum.photos/seed/${shortcode}_2/1080/1080`,
        previewUrl: `https://picsum.photos/seed/${shortcode}_2/1080/1080`,
        thumbnailUrl: `https://picsum.photos/seed/${shortcode}_2/320/320`,
        width: 1080,
        height: 1080,
        filename: `snapora_demo_photo_${shortcode}_2.jpg`,
        provider: 'MockProvider (Demo Mode)',
        downloadable: true,
        carouselPosition: { index: 1, total: 2 }
      }
    ];

    const carouselItems: CarouselItem[] = mediaItems.map((item, idx) => ({
      id: item.id || `demo_car_${shortcode}_${idx + 1}`,
      postId: shortcode,
      index: idx,
      type: item.type,
      url: item.url,
      previewUrl: item.previewUrl,
      filename: item.filename,
      thumbnailUrl: item.thumbnailUrl,
      provider: 'MockProvider (Demo Mode)',
      downloadable: true,
      carouselPosition: item.carouselPosition
    }));

    return {
      ok: true,
      status: 'media_download_available',
      provider: 'MockProvider (Demo Mode)',
      shortcode,
      title: `Carousel by @photographer_${shortcode} (Demo Fixture)`,
      author: `photographer_${shortcode}`,
      downloadAvailable: true,
      disclaimer: 'Simulated demo fixture generated client-side.',
      preview: {
        type: 'thumbnail',
        thumbnailUrl: mediaItems[0].thumbnailUrl,
        thumbnailWidth: 1080,
        thumbnailHeight: 1080,
        authorName: `photographer_${shortcode}`,
        title: `Carousel by @photographer_${shortcode}`
      },
      media: mediaItems,
      carouselItems
    };
  }

  // Standard photo fixture
  const photoItem: MediaItem = {
    id: `demo_photo_${shortcode}`,
    postId: shortcode,
    type: 'image',
    url: `https://picsum.photos/seed/${shortcode}/1080/1080`,
    previewUrl: `https://picsum.photos/seed/${shortcode}/1080/1080`,
    thumbnailUrl: `https://picsum.photos/seed/${shortcode}/320/320`,
    width: 1080,
    height: 1080,
    filename: `snapora_demo_photo_${shortcode}.jpg`,
    provider: 'MockProvider (Demo Mode)',
    downloadable: true,
    carouselPosition: { index: 0, total: 1 }
  };

  return {
    ok: true,
    status: 'media_download_available',
    provider: 'MockProvider (Demo Mode)',
    shortcode,
    title: `Photo by @user_${shortcode} (Demo Fixture)`,
    author: `user_${shortcode}`,
    downloadAvailable: true,
    disclaimer: 'Simulated demo fixture generated client-side.',
    preview: {
      type: 'thumbnail',
      thumbnailUrl: photoItem.thumbnailUrl,
      thumbnailWidth: 1080,
      thumbnailHeight: 1080,
      authorName: `user_${shortcode}`,
      title: `Photo by @user_${shortcode}`
    },
    media: [photoItem]
  };
}

/**
 * Client-Side Deterministic Profile Discovery Mock
 * Enables profile browsing and selective downloading demo mode without a backend server.
 */
export async function discoverProfileClientMock(
  username: string,
  cursor?: string
): Promise<ProfileDiscoveryResult> {
  await new Promise((resolve) => setTimeout(resolve, 200));

  const clean = username.replace(/^@/, '').trim();
  const lower = clean.toLowerCase();

  if (lower.includes('private')) {
    return {
      ok: false,
      provider: 'MockProvider (Demo Mode)',
      error: {
        code: 'PRIVATE_ACCOUNT',
        message: `This account (@${clean}) is private. Posts are only visible to approved followers.`
      }
    };
  }

  if (lower.includes('ratelimit') || lower.includes('429')) {
    return {
      ok: false,
      provider: 'MockProvider (Demo Mode)',
      error: {
        code: 'RATE_LIMITED',
        message: 'Instagram is temporarily limiting requests. Please try again in 60 seconds.',
        retryAfterSeconds: 60
      }
    };
  }

  if (lower.includes('notfound') || lower.includes('404')) {
    return {
      ok: false,
      provider: 'MockProvider (Demo Mode)',
      error: {
        code: 'POST_NOT_FOUND',
        message: `Instagram profile '@${clean}' could not be found.`
      }
    };
  }

  if (lower.includes('empty')) {
    return {
      ok: true,
      provider: 'MockProvider (Demo Mode)',
      profile: {
        username: clean,
        fullName: 'Empty Profile Fixture',
        biography: 'No media posts yet.',
        avatarUrl: `https://picsum.photos/seed/${clean}_avatar/300/300`,
        isPrivate: false,
        isVerified: false,
        postsCount: 0,
        followersCount: 12,
        followingCount: 45
      },
      items: [],
      pagination: {
        hasMore: false,
        totalLoaded: 0
      }
    };
  }

  const isPage2 = cursor === 'cursor_page_2';
  const startIdx = isPage2 ? 13 : 1;
  const endIdx = isPage2 ? 24 : 12;

  const items: ProfileMediaItem[] = [];
  for (let i = startIdx; i <= endIdx; i++) {
    const type: 'image' | 'video' | 'carousel' =
      i % 3 === 0 ? 'carousel' : i % 3 === 1 ? 'image' : 'video';

    const shortcode = `DemoPost_${clean}_${i}`;
    const item: ProfileMediaItem = {
      id: `demo_${clean}_${i}`,
      shortcode,
      url: `https://www.instagram.com/p/${shortcode}/`,
      type,
      thumbnailUrl: `https://picsum.photos/seed/${clean}_${i}/480/480`,
      displayUrl: `https://picsum.photos/seed/${clean}_${i}/1080/1080`,
      caption: `Captivating creative post #${i} by @${clean} exploring photography and design compositions.`,
      likesCount: 1240 + i * 92,
      commentsCount: 38 + i * 5,
      timestamp: Date.now() - i * 86400000
    };

    if (type === 'video') {
      item.videoDurationSeconds = 30 + (i % 45);
    }

    if (type === 'carousel') {
      item.carouselMedia = [
        {
          id: `demo_${clean}_${i}_slide_1`,
          type: 'image',
          url: `https://picsum.photos/seed/${clean}_${i}_1/1080/1080`,
          thumbnailUrl: `https://picsum.photos/seed/${clean}_${i}_1/320/320`,
          width: 1080,
          height: 1080
        },
        {
          id: `demo_${clean}_${i}_slide_2`,
          type: 'image',
          url: `https://picsum.photos/seed/${clean}_${i}_2/1080/1080`,
          thumbnailUrl: `https://picsum.photos/seed/${clean}_${i}_2/320/320`,
          width: 1080,
          height: 1080
        },
        {
          id: `demo_${clean}_${i}_slide_3`,
          type: 'image',
          url: `https://picsum.photos/seed/${clean}_${i}_3/1080/1080`,
          thumbnailUrl: `https://picsum.photos/seed/${clean}_${i}_3/320/320`,
          width: 1080,
          height: 1080
        }
      ];
    }

    items.push(item);
  }

  return {
    ok: true,
    provider: 'MockProvider (Demo Mode)',
    profile: {
      username: clean,
      fullName: `${clean.charAt(0).toUpperCase() + clean.slice(1)} Visuals`,
      biography: `Design, architecture, and editorial photography. Demo profile for Snapora.`,
      avatarUrl: `https://picsum.photos/seed/${clean}_avatar/300/300`,
      isPrivate: false,
      isVerified: true,
      postsCount: 24,
      followersCount: 245000,
      followingCount: 380
    },
    items,
    pagination: {
      hasMore: !isPage2,
      nextCursor: isPage2 ? undefined : 'cursor_page_2',
      totalLoaded: isPage2 ? 24 : 12
    }
  };
}
