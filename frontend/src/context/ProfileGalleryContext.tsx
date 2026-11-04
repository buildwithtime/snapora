import React, { createContext, useContext, useReducer, useCallback, useMemo, useRef } from 'react';
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
  | { type: 'START_LOAD'; payload?: { username?: string } }
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
        targetUsername: action.payload?.username || state.targetUsername,
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
  const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true';
  const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

  const abortControllerRef = useRef<AbortController | null>(null);
  const loadMoreAbortControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef<number>(0);
  const activeUsernameRef = useRef<string>('');

  const filteredItems = useMemo(() => {
    if (state.filter === 'all') return state.items;
    return state.items.filter((item) => item.type === state.filter);
  }, [state.items, state.filter]);

  const loadProfile = useCallback(async (urlOrUsername: string) => {
    // Cancel any previous in-flight profile discovery or pagination request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (loadMoreAbortControllerRef.current) {
      loadMoreAbortControllerRef.current.abort();
      loadMoreAbortControllerRef.current = null;
    }

    const currentRequestId = ++requestIdRef.current;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    let username = urlOrUsername.trim();
    if (username.includes('/')) {
      const parsed = parseInstagramUrl(username);
      if (parsed.valid && parsed.username) {
        username = parsed.username;
      } else {
        const parts = username.split('/').filter(Boolean);
        username = parts.pop() || username;
      }
    }
    username = username.replace(/^@/, '');
    const cleanUsername = username.toLowerCase();
    activeUsernameRef.current = cleanUsername;

    dispatch({ type: 'START_LOAD', payload: { username: cleanUsername || urlOrUsername } });

    try {
      const resp = await safeFetchJson<ProfileDiscoveryResult>(`${apiBaseUrl}/api/profile/discover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlOrUsername }),
        signal: controller.signal
      });

      // Discard stale or cancelled responses
      if (requestIdRef.current !== currentRequestId || controller.signal.aborted) {
        return;
      }

      if (resp.ok && resp.data.ok) {
        const returnedUsername = (resp.data.profile.username || '').toLowerCase();
        // Identity validation: Ensure returned profile matches originally requested username
        if (cleanUsername && returnedUsername && returnedUsername !== cleanUsername) {
          dispatch({
            type: 'LOAD_ERROR',
            payload: {
              code: 'PROFILE_MISMATCH',
              message: `Requested profile @${cleanUsername} but received data for @${returnedUsername}. Discovery rejected for profile integrity.`
            }
          });
          return;
        }

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

      // If backend returned structured error inside successful HTTP response
      if (resp.ok && !resp.data.ok) {
        dispatch({
          type: 'LOAD_ERROR',
          payload: {
            code: resp.data.error.code,
            message: resp.data.error.message,
            retryAfterSeconds:
              resp.data.error.retryAfterSeconds ||
              (resp.data.error.code === 'UPSTREAM_RATE_LIMITED' || resp.data.error.code === 'RATE_LIMITED'
                ? 60
                : undefined)
          }
        });
        return;
      }

      // If network / HTTP non-2xx error (e.g. 429, 403, 502)
      if (!resp.ok) {
        if (isDemoMode) {
          // Attempt client mock fallback ONLY when demo mode is explicitly enabled
          const mockResult = await discoverProfileClientMock(username);
          if (requestIdRef.current !== currentRequestId || controller.signal.aborted) {
            return;
          }
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

        // Production mode: Surface genuine upstream error honestly
        dispatch({
          type: 'LOAD_ERROR',
          payload: {
            code: resp.error.code,
            message: resp.error.message,
            retryAfterSeconds:
              resp.error.retryAfterSeconds ||
              (resp.status === 429 || resp.error.code === 'UPSTREAM_RATE_LIMITED' || resp.error.code === 'RATE_LIMITED'
                ? 60
                : undefined)
          }
        });
        return;
      }
    } catch (err: unknown) {
      if (requestIdRef.current !== currentRequestId || controller.signal.aborted) {
        return;
      }

      if ((err instanceof DOMException && err.name === 'AbortError') || (err as { name?: string })?.name === 'AbortError') {
        return;
      }

      if (isDemoMode) {
        // Offline demo fallback
        try {
          const mockResult = await discoverProfileClientMock(username);
          if (requestIdRef.current !== currentRequestId || controller.signal.aborted) {
            return;
          }
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
        } catch (innerErr: unknown) {
          if (requestIdRef.current === currentRequestId && !controller.signal.aborted) {
            dispatch({
              type: 'LOAD_ERROR',
              payload: {
                code: 'NETWORK_ERROR',
                message: innerErr instanceof Error ? innerErr.message : 'Unable to connect to service'
              }
            });
          }
        }
        return;
      }

      // Production mode: Honest network error
      dispatch({
        type: 'LOAD_ERROR',
        payload: {
          code: 'NETWORK_ERROR',
          message: err instanceof Error ? err.message : 'Unable to connect to service'
        }
      });
    } finally {
      if (requestIdRef.current === currentRequestId) {
        abortControllerRef.current = null;
      }
    }
  }, [apiBaseUrl, isDemoMode]);

  const loadMore = useCallback(async () => {
    if (state.isLoadingMore || !state.pagination.hasMore || !state.profile || state.items.length >= MAX_PROFILE_ITEMS) {
      return;
    }

    if (loadMoreAbortControllerRef.current) {
      loadMoreAbortControllerRef.current.abort();
      loadMoreAbortControllerRef.current = null;
    }

    const currentRequestId = requestIdRef.current;
    const controller = new AbortController();
    loadMoreAbortControllerRef.current = controller;

    dispatch({ type: 'START_LOAD_MORE' });

    try {
      const resp = await safeFetchJson<ProfileDiscoveryResult>(`${apiBaseUrl}/api/profile/discover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: state.profile.username,
          cursor: state.pagination.nextCursor
        }),
        signal: controller.signal
      });

      if (requestIdRef.current !== currentRequestId || controller.signal.aborted) {
        return;
      }

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

      // If in demo mode, allow mock pagination
      if (isDemoMode) {
        const mockResult = await discoverProfileClientMock(
          state.profile.username,
          state.pagination.nextCursor
        );
        if (requestIdRef.current !== currentRequestId || controller.signal.aborted) {
          return;
        }
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
        return;
      }

      // Production mode: Surface honest error message
      const errMsg = resp.ok
        ? (!resp.data.ok ? resp.data.error.message : 'Failed to load additional items')
        : resp.error.message;
      dispatch({
        type: 'LOAD_MORE_ERROR',
        payload: { message: errMsg || 'Failed to load additional items' }
      });
    } catch (err: unknown) {
      if (requestIdRef.current !== currentRequestId || controller.signal.aborted) {
        return;
      }
      if ((err instanceof DOMException && err.name === 'AbortError') || (err as { name?: string })?.name === 'AbortError') {
        return;
      }
      dispatch({
        type: 'LOAD_MORE_ERROR',
        payload: { message: err instanceof Error ? err.message : 'Failed to load additional items' }
      });
    } finally {
      loadMoreAbortControllerRef.current = null;
    }
  }, [state.isLoadingMore, state.pagination, state.profile, state.items.length, apiBaseUrl, isDemoMode]);

  const closeGallery = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (loadMoreAbortControllerRef.current) {
      loadMoreAbortControllerRef.current.abort();
      loadMoreAbortControllerRef.current = null;
    }
    requestIdRef.current++;
    activeUsernameRef.current = '';
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
