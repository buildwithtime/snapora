import { universalPlatformRegistry, YouTubePlatformDetector, YOUTUBE_VIDEO_ID_REGEX } from '../../utils/platformDetector.js';

export interface ParsedYouTubeUrl {
  valid: boolean;
  videoId?: string;
  canonicalUrl?: string;
  originalUrl: string;
  error?: string;
}

/**
 * Validates and canonicalizes a YouTube video URL using YouTubePlatformDetector.
 */
export function parseYouTubeVideoUrl(rawUrl: string): ParsedYouTubeUrl {
  const detectResult = universalPlatformRegistry.detectPlatform(rawUrl);

  if (!detectResult.matched || detectResult.platformId !== 'youtube' || !detectResult.info) {
    return {
      valid: false,
      originalUrl: rawUrl || '',
      error: detectResult.error || 'The provided URL is not a recognized or supported YouTube URL'
    };
  }

  const videoId = detectResult.info.contentId;
  if (!videoId || !YOUTUBE_VIDEO_ID_REGEX.test(videoId)) {
    return {
      valid: false,
      originalUrl: rawUrl,
      error: `Invalid YouTube video ID '${videoId || ''}'. Must be exactly 11 alphanumeric characters, underscores, or hyphens.`
    };
  }

  return {
    valid: true,
    videoId,
    canonicalUrl: detectResult.info.canonicalUrl,
    originalUrl: rawUrl
  };
}
