export interface ProfileInfo {
  username: string;
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
    code: string;
    message: string;
    details?: string;
    retryAfterSeconds?: number;
  };
}

export type ProfileDiscoveryResult = ProfileDiscoverySuccess | ProfileDiscoveryFailure;

export type ProfileFilterType = 'all' | 'image' | 'video' | 'carousel';

/**
 * Maximum number of posts discoverable in one profile gallery session
 * to prevent browser DOM lag and memory pressure on large profiles.
 */
export const MAX_PROFILE_ITEMS = 250;

export interface ProfileGalleryState {
  isOpen: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  profile: ProfileInfo | null;
  items: ProfileMediaItem[];
  pagination: ProfilePagination;
  selectedIds: Set<string>;
  filter: ProfileFilterType;
  inspectingCarousel: ProfileMediaItem | null;
  error: {
    code: string;
    message: string;
    retryAfterSeconds?: number;
  } | null;
}

