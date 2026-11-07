import {
  PinterestOEmbedResponse,
  PinterestResolvedData,
  PinterestThumbnailItem
} from './types.js';
import { ResolveSuccess, MediaItem } from '../types.js';
import { calculatePinterestRetention } from './retention.js';
import { pinterestEmbedService } from './embedService.js';

export interface PinterestNormalizerInput {
  pinId: string;
  canonicalUrl: string;
  oembed?: PinterestOEmbedResponse;
  thumbnails?: PinterestThumbnailItem[];
  fetchedAt?: Date;
  embedStatus?: 'allowed' | 'disabled' | 'unknown';
}

export class PinterestMetadataNormalizer {
  /**
   * Normalizes raw Pinterest oEmbed metadata and thumbnail discovery into a structured Pin object.
   */
  normalize(input: PinterestNormalizerInput): PinterestResolvedData {
    const { fetchedAt, expiresAt } = calculatePinterestRetention(input.fetchedAt);
    const { pinId, canonicalUrl, oembed, thumbnails = [] } = input;

    // Pinterest standalone embed URL:
    // Uses the official assets.pinterest.com iframe embedding path
    const embedUrl = pinterestEmbedService.generateEmbedUrl(pinId);

    // oEmbed does not provide authoritative embedding permission.
    // Following PR #19 YouTube oEmbed standards, we report 'unknown'
    // without misrepresenting it as confirmed permission.
    const embedStatus = input.embedStatus ?? 'unknown';

    // Extract title, clean up if empty
    const rawTitle = oembed?.title?.trim();
    const title = rawTitle && rawTitle.length > 0 ? rawTitle : `Pinterest Pin ${pinId}`;

    // Extract author information
    const author = oembed?.author_name?.trim() || undefined;
    const authorUrl = oembed?.author_url?.trim() || undefined;

    // Capability determination:
    // If oEmbed responded with title or author, it is BASIC_METADATA.
    // If empty or only embed fallback, EMBED_ONLY.
    const metadataCapability = oembed?.title || oembed?.author_name ? 'BASIC_METADATA' : 'EMBED_ONLY';

    return {
      pinId,
      canonicalUrl,
      title,
      author,
      authorUrl,
      embedUrl,
      embedStatus,
      isEmbeddable: undefined,
      embeddingAllowed: undefined,
      metadataCapability,
      metadataFetchedAt: fetchedAt,
      metadataExpiresAt: expiresAt,
      thumbnails
    };
  }

  /**
   * Builds the standardized ResolveSuccess response object for the backend resolve route.
   */
  buildResolveSuccess(normalized: PinterestResolvedData): ResolveSuccess {
    const primaryThumb = normalized.thumbnails[0];

    const media: MediaItem[] = normalized.thumbnails.map((t) => ({
      id: `${normalized.pinId}_${t.resolution}`,
      postId: normalized.pinId,
      platform: 'pinterest',
      type: 'image',
      url: t.url,
      previewUrl: t.url,
      thumbnailUrl: t.url,
      width: t.width,
      height: t.height,
      filename: `pinterest_${normalized.pinId}_${t.resolution}.jpg`,
      provider: 'pinterest',
      downloadable: false,
      resolutionStatus: 'live_metadata_retrieved'
    }));

    return {
      ok: true,
      status: 'live_metadata_retrieved',
      provider: 'pinterest',
      platform: 'pinterest',
      shortcode: normalized.pinId,
      contentId: normalized.pinId,
      canonicalUrl: normalized.canonicalUrl,
      title: normalized.title,
      author: normalized.author,
      authorUrl: normalized.authorUrl,
      description: normalized.description,
      embedUrl: normalized.embedUrl,
      isEmbeddable: normalized.isEmbeddable,
      embeddingAllowed: normalized.embeddingAllowed,
      embedStatus: normalized.embedStatus,
      metadataCapability: normalized.metadataCapability,
      metadataFetchedAt: normalized.metadataFetchedAt,
      metadataExpiresAt: normalized.metadataExpiresAt,
      downloadAvailable: false,
      disclaimer: 'Pinterest pin downloads are not supported. Preview thumbnails and metadata export are available.',
      preview: {
        type: 'thumbnail',
        title: normalized.title,
        authorName: normalized.author,
        authorUrl: normalized.authorUrl,
        thumbnailUrl: primaryThumb?.url,
        thumbnailWidth: primaryThumb?.width,
        thumbnailHeight: primaryThumb?.height,
        providerName: 'Pinterest',
        embedUrl: normalized.embedUrl,
        isEmbeddable: normalized.isEmbeddable,
        embeddingAllowed: normalized.embeddingAllowed,
        embedStatus: normalized.embedStatus,
        metadataCapability: normalized.metadataCapability,
        metadataFetchedAt: normalized.metadataFetchedAt,
        metadataExpiresAt: normalized.metadataExpiresAt,
        thumbnails: normalized.thumbnails
      },
      media
    };
  }
}

export const pinterestMetadataNormalizer = new PinterestMetadataNormalizer();
