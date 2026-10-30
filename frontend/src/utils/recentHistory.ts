export interface RecentDownloadItem {
  id: string;
  url: string;
  shortcode: string;
  author?: string;
  title?: string;
  timestamp: number;
}

const STORAGE_KEY = 'snapora_recent_downloads';
const MAX_HISTORY_ITEMS = 20;

export function getRecentDownloads(): RecentDownloadItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.slice(0, MAX_HISTORY_ITEMS);
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

