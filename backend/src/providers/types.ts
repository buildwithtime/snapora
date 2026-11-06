import { ErrorCode } from '../utils/errors.js';

export type PlatformId =
  | 'instagram'
  | 'youtube'
  | 'facebook'
  | 'tiktok'
  | 'pinterest'
  | 'twitter'
  | 'generic';

export type UnifiedMediaType =
  | 'post'
  | 'reel'
  | 'tv'
  | 'profile'
  | 'direct_media'
  | 'image'
  | 'video'
  | 'carousel'
  | 'audio'
  | 'collection';

export type ResolutionStatus =
  | 'url_validated'
  | 'live_preview_retrieved'
  | 'live_metadata_retrieved'
  | 'preview_unavailable'
  | 'authorized_media_source_available'
  | 'media_download_available'
  | 'authentication_required'
  | 'configuration_required'
  | 'unsupported_content'
  | 'invalid_url'
  | 'rate_limited'
  | 'temporarily_unavailable'
  | 'permanently_inaccessible'
  | 'unsupported_retrieval_method'
  | 'provider_error';

export interface MediaItem {
  id?: string;
  postId?: string;
  platform?: PlatformId;
  type: 'image' | 'video';
  url?: string;
  previewUrl?: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  filename: string;
  sizeBytes?: number;
  provider?: string;
  downloadable?: boolean;
  resolutionStatus?: ResolutionStatus;
  carouselPosition?: { index: number; total: number };
  status?: 'pending' | 'downloading' | 'completed' | 'failed';
  error?: string;
  takenAt?: number | string;
}

export interface CarouselItem {
  id: string;
  postId?: string;
  platform?: PlatformId;
  index: number;
  type: 'image' | 'video';
  url?: string;
  previewUrl?: string;
  thumbnailUrl?: string;
  filename: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
  provider?: string;
  downloadable?: boolean;
  resolutionStatus?: ResolutionStatus;
  carouselPosition?: { index: number; total: number };
  status?: 'pending' | 'downloading' | 'completed' | 'failed';
  error?: string;
  takenAt?: number | string;
}

export interface PreviewData {
  type: 'embed' | 'thumbnail';
  html?: string;
  thumbnailUrl?: string;
  thumbnailWidth?: number;
  thumbnailHeight?: number;
  authorName?: string;
  authorUrl?: string;
  title?: string;
  providerName?: string;
  version?: string;
  embedUrl?: string;
  isEmbeddable?: boolean;
  embeddingAllowed?: boolean;
  embedStatus?: 'allowed' | 'disabled' | 'unknown';
  description?: string;
  durationSeconds?: number;
  durationFormatted?: string;
  publishedAt?: string;
  metadataCapability?: 'FULL_METADATA' | 'BASIC_METADATA' | 'EMBED_ONLY' | 'UNAVAILABLE';
  metadataFetchedAt?: string;
  metadataExpiresAt?: string;
  thumbnails?: Array<{
    resolution: string;
    url: string;
    width?: number;
    height?: number;
    verified?: boolean;
  }>;
}

export interface ResolveSuccess {
  ok: true;
  status: ResolutionStatus;
  provider: string;
  platform?: PlatformId;
  shortcode: string;
  contentId?: string;
  canonicalUrl: string;
  title?: string;
  author?: string;
  authorUrl?: string;
  description?: string;
  durationSeconds?: number;
  durationFormatted?: string;
  publishedAt?: string;
  embedUrl?: string;
  isEmbeddable?: boolean;
  embeddingAllowed?: boolean;
  embedStatus?: 'allowed' | 'disabled' | 'unknown';
  metadataCapability?: 'FULL_METADATA' | 'BASIC_METADATA' | 'EMBED_ONLY' | 'UNAVAILABLE';
  metadataFetchedAt?: string;
  metadataExpiresAt?: string;
  takenAt?: number | string;
  preview?: PreviewData;
  media?: MediaItem[];
  carouselItems?: CarouselItem[];
  downloadAvailable: boolean;
  disclaimer?: string;
}

export interface ResolveFailure {
  ok: false;
  status: ResolutionStatus;
  provider: string;
  shortcode?: string;
  error: {
    code: ErrorCode;
    message: string;
    details?: string;
    retryAfterSeconds?: number;
  };
}

export type ResolveResult = ResolveSuccess | ResolveFailure;

export interface ProfileInfo {
  username: string;
  profileUrl?: string;
  fullName?: string;
  biography?: string;
  avatarUrl?: string;
  isPrivate: boolean;
  isVerified?: boolean;
  postsCount?: number;
  followersCount?: number;
  followingCount?: number;
}

export interface ProfileMediaChild {
  id: string;
  type: 'image' | 'video';
  url: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
}

export interface ProfileMediaItem {
  id: string;
  shortcode: string;
  url: string;
  type: 'image' | 'video' | 'carousel';
  thumbnailUrl: string;
  displayUrl: string;
  caption?: string;
  likesCount?: number;
  commentsCount?: number;
  timestamp?: number | string;
  videoDurationSeconds?: number;
  carouselMedia?: ProfileMediaChild[];
}

export interface ProfilePagination {
  hasMore: boolean;
  nextCursor?: string;
  totalLoaded?: number;
}

export interface ProfileDiscoverySuccess {
  ok: true;
  provider: string;
  profile: ProfileInfo;
  items: ProfileMediaItem[];
  pagination: ProfilePagination;
}

export interface ProfileDiscoveryFailure {
  ok: false;
  provider: string;
  error: {
    code: ErrorCode;
    message: string;
    details?: string;
    retryAfterSeconds?: number;
  };
}

export type ProfileDiscoveryResult = ProfileDiscoverySuccess | ProfileDiscoveryFailure;

export interface ProfileDiscoveryOptions {
  cursor?: string;
  userAccessToken?: string;
  limit?: number;
  signal?: AbortSignal;
}

export interface ProviderCapabilities {
  supportsPreview: boolean;
  supportsMetadata: boolean;
  supportsOriginalDownload: boolean;
  supportsCarousel: boolean;
  requiresAuthentication: boolean;
  requiresConfiguration: boolean;
  supportsProfileDiscovery?: boolean;
  supportsDirectDownload?: boolean;
  supportsCollectionExport?: boolean;
  supportsCreatorAuth?: boolean;
  downloadDisclaimer?: string;
}

export interface ResolveOptions {
  userAccessToken?: string;
  signal?: AbortSignal;
}

export interface IMediaProvider {
  readonly id: string;
  readonly name: string;
  readonly platformId: PlatformId;
  getCapabilities(): ProviderCapabilities;
  canResolve(url: string): boolean;
  resolve(url: string, shortcode: string, options?: ResolveOptions): Promise<ResolveResult>;
  canDiscoverProfile?(urlOrUsername: string): boolean;
  discoverProfile?(urlOrUsername: string, options?: ProfileDiscoveryOptions): Promise<ProfileDiscoveryResult>;
  getAllowedDownloadHosts(): Array<string | RegExp>;
}
