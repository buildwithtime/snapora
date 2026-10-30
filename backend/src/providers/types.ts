import { ErrorCode } from '../utils/errors.js';

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
}

export interface ResolveSuccess {
  ok: true;
  status: ResolutionStatus;
  provider: string;
  shortcode: string;
  canonicalUrl: string;
  title?: string;
  author?: string;
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

export interface ProviderCapabilities {
  supportsPreview: boolean;
  supportsMetadata: boolean;
  supportsOriginalDownload: boolean;
  supportsCarousel: boolean;
  requiresAuthentication: boolean;
  requiresConfiguration: boolean;
}

export interface ResolveOptions {
  userAccessToken?: string;
}

export interface IMediaProvider {
  readonly id: string;
  readonly name: string;
  getCapabilities(): ProviderCapabilities;
  canResolve(url: string): boolean;
  resolve(url: string, shortcode: string, options?: ResolveOptions): Promise<ResolveResult>;
}
