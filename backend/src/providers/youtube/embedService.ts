export interface YouTubeEmbedAttributes {
  src: string;
  allow: string;
  allowFullScreen: boolean;
  referrerPolicy: string;
  sandbox: string;
  title?: string;
}

/**
 * Service for generating official, privacy-enhanced YouTube embed URLs and properties.
 * Uses 'www.youtube-nocookie.com' to honor user privacy and prevent non-consensual tracking cookies.
 * Never injects externally supplied, untrusted iframe HTML from oEmbed responses.
 */
export class YouTubeEmbedService {
  /**
   * Generates the canonical privacy-enhanced embed URL for a given YouTube video ID.
   */
  generateEmbedUrl(videoId: string): string {
    const cleanId = encodeURIComponent(videoId.trim());
    return `https://www.youtube-nocookie.com/embed/${cleanId}`;
  }

  /**
   * Generates safe iframe attributes adhering to strict browser sandbox and permissions policies.
   */
  getEmbedAttributes(videoId: string, title?: string): YouTubeEmbedAttributes {
    return {
      src: this.generateEmbedUrl(videoId),
      allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
      allowFullScreen: true,
      referrerPolicy: 'strict-origin-when-cross-origin',
      sandbox: 'allow-scripts allow-same-origin allow-presentation',
      title: title || 'YouTube video player'
    };
  }
}

export const youTubeEmbedService = new YouTubeEmbedService();
