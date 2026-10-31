import React, { createContext, useContext, useReducer, useCallback, useMemo } from 'react';
import {
  ProfileGalleryState,
  ProfileInfo,
  ProfileMediaItem,
  ProfilePagination,
  ProfileFilterType,
  ProfileDiscoveryResult,
  MAX_PROFILE_ITEMS
} from '../types/profile.js';
import { safeFetchJson } from '../utils/apiClient.js';
import { discoverProfileClientMock } from '../utils/mockResolver.js';
import { parseInstagramUrl } from '../utils/urlValidator.js';

type ProfileAction =
  | { type: 'START_LOAD' }
  | {
      type: 'LOAD_SUCCESS';
      payload: {
        profile: ProfileInfo;
        items: ProfileMediaItem[];
        pagination: ProfilePagination;
      };
    }
  | {
      type: 'LOAD_ERROR';
      payload: {
        code: string;
        message: string;
        retryAfterSeconds?: number;
      };
    }
  | { type: 'START_LOAD_MORE' }
  | {
      type: 'LOAD_MORE_SUCCESS';
      payload: {
        items: ProfileMediaItem[];
        pagination: ProfilePagination;
      };
    }
  | { type: 'LOAD_MORE_ERROR'; payload: { message: string } }
  | { type: 'CLOSE_GALLERY' }
  | { type: 'TOGGLE_SELECT'; payload: { id: string } }
  | { type: 'SET_SELECTED_IDS'; payload: { ids: Set<string> } }
  | { type: 'SET_FILTER'; payload: { filter: ProfileFilterType } }
  | { type: 'SET_INSPECTING_CAROUSEL'; payload: { item: ProfileMediaItem | null } };

const initialState: ProfileGalleryState = {
  isOpen: false,
  isLoading: false,
  isLoadingMore: false,
  profile: null,
  items: [],
  pagination: { hasMore: false },
  selectedIds: new Set<string>(),
  filter: 'all',
  inspectingCarousel: null,
  error: null
};

function profileGalleryReducer(state: ProfileGalleryState, action: ProfileAction): ProfileGalleryState {
  switch (action.type) {
    case 'START_LOAD':
      return {
        ...state,
        isOpen: true,
        isLoading: true,
        isLoadingMore: false,
        error: null,
        profile: null,
        items: [],
        selectedIds: new Set<string>(),
        filter: 'all',
        inspectingCarousel: null
      };

    case 'LOAD_SUCCESS': {
      const rawItems = Array.isArray(action.payload.items) ? action.payload.items : [];
      const validItems = rawItems.filter((i) => i && i.id).slice(0, MAX_PROFILE_ITEMS);
      const hasMore = validItems.length >= MAX_PROFILE_ITEMS ? false : Boolean(action.payload.pagination?.hasMore);
      return {
        ...state,
        isOpen: true,
        isLoading: false,
        profile: action.payload.profile,
        items: validItems,
        pagination: {
          hasMore,
          nextCursor: hasMore ? action.payload.pagination?.nextCursor : undefined
        },
        error: null
      };
    }

    case 'LOAD_ERROR':
      return {
        ...state,
        isOpen: true,
        isLoading: false,
        error: action.payload
      };

    case 'START_LOAD_MORE':
      return {
        ...state,
        isLoadingMore: true
      };

    case 'LOAD_MORE_SUCCESS': {
      const rawItems = Array.isArray(action.payload.items) ? action.payload.items : [];
      const existingIds = new Set(state.items.map((i) => i.id));
      const newItems = rawItems.filter((i) => i && i.id && !existingIds.has(i.id));
      const combined = [...state.items, ...newItems].slice(0, MAX_PROFILE_ITEMS);

      const nextCursor = action.payload.pagination?.nextCursor;
      const isCircularCursor = Boolean(nextCursor && nextCursor === state.pagination.nextCursor);
      const isZeroProgress = newItems.length === 0;

      const hasMore =
        combined.length >= MAX_PROFILE_ITEMS || isCircularCursor || isZeroProgress
          ? false
          : Boolean(action.payload.pagination?.hasMore);

      return {
        ...state,
        isLoadingMore: false,
        items: combined,
        pagination: {
          hasMore,
          nextCursor: hasMore ? nextCursor : undefined
        }
      };
    }

    case 'LOAD_MORE_ERROR':
      return {
        ...state,
        isLoadingMore: false
      };

    case 'CLOSE_GALLERY':
      return {
        ...initialState
      };

    case 'TOGGLE_SELECT': {
      const next = new Set(state.selectedIds);
      if (next.has(action.payload.id)) {
        next.delete(action.payload.id);
      } else {
        next.add(action.payload.id);
      }
      return {
        ...state,
        selectedIds: next
      };
    }

    case 'SET_SELECTED_IDS':
      return {
        ...state,
        selectedIds: action.payload.ids
      };

    case 'SET_FILTER':
      return {
        ...state,
        filter: action.payload.filter
      };

    case 'SET_INSPECTING_CAROUSEL':
      return {
        ...state,
        inspectingCarousel: action.payload.item
      };

    default:
      return state;
  }
}

export interface ProfileGalleryContextType {
  state: ProfileGalleryState;
  filteredItems: ProfileMediaItem[];
  loadProfile: (urlOrUsername: string) => Promise<void>;
  loadMore: () => Promise<void>;
  closeGallery: () => void;
  toggleSelect: (id: string) => void;
  selectAll: () => void;
  selectNone: () => void;
  invertSelection: () => void;
  selectByType: (type: ProfileFilterType) => void;
  setFilter: (filter: ProfileFilterType) => void;
  openCarouselModal: (item: ProfileMediaItem) => void;
  closeCarouselModal: () => void;
}

const ProfileGalleryContext = createContext<ProfileGalleryContextType | undefined>(undefined);

export const ProfileGalleryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(profileGalleryReducer, initialState);

  const filteredItems = useMemo(() => {
    if (state.filter === 'all') return state.items;
    return state.items.filter((item) => item.type === state.filter);
  }, [state.items, state.filter]);

  const loadProfile = useCallback(async (urlOrUsername: string) => {
    dispatch({ type: 'START_LOAD' });

    let username = urlOrUsername.trim();
    if (username.includes('/')) {
      const parsed = parseInstagramUrl(username);
      if (parsed.valid && parsed.username) {
        username = parsed.username;
      }
    }
    username = username.replace(/^@/, '');

    try {
      const resp = await safeFetchJson<ProfileDiscoveryResult>('/api/profile/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlOrUsername })
      });

      if (resp.ok && resp.data.ok) {
        dispatch({
          type: 'LOAD_SUCCESS',
          payload: {
            profile: resp.data.profile,
            items: resp.data.items,
            pagination: resp.data.pagination
          }
        });
        return;
      }

      // If backend returned structured error
      if (resp.ok && !resp.data.ok) {
        dispatch({
          type: 'LOAD_ERROR',
          payload: {
            code: resp.data.error.code,
            message: resp.data.error.message,
            retryAfterSeconds: resp.data.error.retryAfterSeconds
          }
        });
        return;
      }

      // If network / HTTP 404 / 502 error, check if client mock should take over for offline/demo
      if (!resp.ok) {
        // Attempt client mock fallback for demo mode
        const mockResult = await discoverProfileClientMock(username);
        if (mockResult.ok) {
          dispatch({
            type: 'LOAD_SUCCESS',
            payload: {
              profile: mockResult.profile,
              items: mockResult.items,
              pagination: mockResult.pagination
            }
          });
          return;
        }

        dispatch({
          type: 'LOAD_ERROR',
          payload: {
            code: mockResult.error.code || resp.error.code,
            message: mockResult.error.message || resp.error.message,
            retryAfterSeconds: mockResult.error.retryAfterSeconds
          }
        });
        return;
      }
    } catch {
      // Offline fallback
      try {
        const mockResult = await discoverProfileClientMock(username);
        if (mockResult.ok) {
          dispatch({
            type: 'LOAD_SUCCESS',
            payload: {
              profile: mockResult.profile,
              items: mockResult.items,
              pagination: mockResult.pagination
            }
          });
          return;
        }
        dispatch({
          type: 'LOAD_ERROR',
          payload: {
            code: mockResult.error.code,
            message: mockResult.error.message
          }
        });
      } catch (err: unknown) {
        dispatch({
          type: 'LOAD_ERROR',
          payload: {
            code: 'NETWORK_ERROR',
            message: err instanceof Error ? err.message : 'Unable to connect to service'
          }
        });
      }
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (state.isLoadingMore || !state.pagination.hasMore || !state.profile || state.items.length >= MAX_PROFILE_ITEMS) {
      return;
    }

    dispatch({ type: 'START_LOAD_MORE' });

    try {
      const resp = await safeFetchJson<ProfileDiscoveryResult>('/api/profile/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: state.profile.username,
          cursor: state.pagination.nextCursor
        })
      });

      if (resp.ok && resp.data.ok) {
        dispatch({
          type: 'LOAD_MORE_SUCCESS',
          payload: {
            items: resp.data.items,
            pagination: resp.data.pagination
          }
        });
        return;
      }

      // Offline / Demo fallback for cursor
      const mockResult = await discoverProfileClientMock(
        state.profile.username,
        state.pagination.nextCursor
      );
      if (mockResult.ok) {
        dispatch({
          type: 'LOAD_MORE_SUCCESS',
          payload: {
            items: mockResult.items,
            pagination: mockResult.pagination
          }
        });
      } else {
        dispatch({
          type: 'LOAD_MORE_ERROR',
          payload: { message: mockResult.error.message }
        });
      }
    } catch {
      dispatch({
        type: 'LOAD_MORE_ERROR',
        payload: { message: 'Failed to load additional items' }
      });
    }
  }, [state.isLoadingMore, state.pagination, state.profile]);

  const closeGallery = useCallback(() => {
    dispatch({ type: 'CLOSE_GALLERY' });
  }, []);

  const toggleSelect = useCallback((id: string) => {
    dispatch({ type: 'TOGGLE_SELECT', payload: { id } });
  }, []);

  const selectAll = useCallback(() => {
    const next = new Set(state.selectedIds);
    filteredItems.forEach((item) => next.add(item.id));
    dispatch({ type: 'SET_SELECTED_IDS', payload: { ids: next } });
  }, [filteredItems, state.selectedIds]);

  const selectNone = useCallback(() => {
    dispatch({ type: 'SET_SELECTED_IDS', payload: { ids: new Set<string>() } });
  }, []);

  const invertSelection = useCallback(() => {
    const next = new Set<string>(state.selectedIds);
    for (const item of filteredItems) {
      if (next.has(item.id)) {
        next.delete(item.id);
      } else {
        next.add(item.id);
      }
    }
    dispatch({ type: 'SET_SELECTED_IDS', payload: { ids: next } });
  }, [filteredItems, state.selectedIds]);

  const selectByType = useCallback(
    (type: ProfileFilterType) => {
      const ids = new Set<string>();
      for (const item of state.items) {
        if (type === 'all' || item.type === type) {
          ids.add(item.id);
        }
      }
      dispatch({ type: 'SET_SELECTED_IDS', payload: { ids } });
    },
    [state.items]
  );

  const setFilter = useCallback((filter: ProfileFilterType) => {
    dispatch({ type: 'SET_FILTER', payload: { filter } });
  }, []);

  const openCarouselModal = useCallback((item: ProfileMediaItem) => {
    dispatch({ type: 'SET_INSPECTING_CAROUSEL', payload: { item } });
  }, []);

  const closeCarouselModal = useCallback(() => {
    dispatch({ type: 'SET_INSPECTING_CAROUSEL', payload: { item: null } });
  }, []);

  const contextValue = useMemo<ProfileGalleryContextType>(
    () => ({
      state,
      filteredItems,
      loadProfile,
      loadMore,
      closeGallery,
      toggleSelect,
      selectAll,
      selectNone,
      invertSelection,
      selectByType,
      setFilter,
      openCarouselModal,
      closeCarouselModal
    }),
    [
      state,
      filteredItems,
      loadProfile,
      loadMore,
      closeGallery,
      toggleSelect,
      selectAll,
      selectNone,
      invertSelection,
      selectByType,
      setFilter,
      openCarouselModal,
      closeCarouselModal
    ]
  );

  return (
    <ProfileGalleryContext.Provider value={contextValue}>
      {children}
    </ProfileGalleryContext.Provider>
  );
};

export function useProfileGallery(): ProfileGalleryContextType {
  const context = useContext(ProfileGalleryContext);
  if (!context) {
    throw new Error('useProfileGallery must be used within a ProfileGalleryProvider');
  }
  return context;
}

