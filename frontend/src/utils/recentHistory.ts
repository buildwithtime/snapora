import { isMetadataExpired } from './retention.js';

export interface RecentDownloadItem {
  id: string;
  url: string;
  shortcode: string;
  author?: string;
  title?: string;
  timestamp: number;
  metadataExpiresAt?: string;
  platform?: string;
  isStale?: boolean;
}

const STORAGE_KEY = 'snapora_recent_downloads';
const MAX_HISTORY_ITEMS = 20;

export function getRecentDownloads(): RecentDownloadItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      let modified = false;
      const sanitized: RecentDownloadItem[] = parsed.slice(0, MAX_HISTORY_ITEMS).map((item) => {
        // Enforce 30-day API metadata retention on cached history items
        if (item.metadataExpiresAt && isMetadataExpired(item.metadataExpiresAt)) {
          if (item.title || item.author) {
            modified = true;
          }
          return {
            ...item,
            title: undefined,
            author: undefined,
            isStale: true
          };
        }
        return item;
      });

      if (modified) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
      }

      return sanitized;
    }
    return [];
  } catch {
    return [];
  }
}

export function addRecentDownload(item: Omit<RecentDownloadItem, 'timestamp'>): RecentDownloadItem[] {
  try {
    const existing = getRecentDownloads();
    const filtered = existing.filter((i) => i.shortcode !== item.shortcode && i.url !== item.url);
    const updated: RecentDownloadItem[] = [
      {
        ...item,
        timestamp: Date.now()
      },
      ...filtered
    ].slice(0, MAX_HISTORY_ITEMS);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
}

export function clearRecentDownloads(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}
