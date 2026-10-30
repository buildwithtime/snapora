import { describe, it, expect, beforeEach } from 'vitest';
import { getRecentDownloads, addRecentDownload, clearRecentDownloads } from './recentHistory.js';

describe('recentHistory utility suite', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns empty array when no history exists', () => {
    expect(getRecentDownloads()).toEqual([]);
  });

  it('adds recent items without duplicate shortcodes', () => {
    addRecentDownload({
      id: '1',
      url: 'https://www.instagram.com/p/TEST1/',
      shortcode: 'TEST1',
      author: 'creator1'
    });

    let items = getRecentDownloads();
    expect(items).toHaveLength(1);
    expect(items[0].shortcode).toBe('TEST1');

    // Adding duplicate shortcode moves it to the front
    addRecentDownload({
      id: '2',
      url: 'https://www.instagram.com/p/TEST2/',
      shortcode: 'TEST2'
    });
    addRecentDownload({
      id: '1_dup',
      url: 'https://www.instagram.com/p/TEST1/',
      shortcode: 'TEST1'
    });

    items = getRecentDownloads();
    expect(items).toHaveLength(2);
    expect(items[0].shortcode).toBe('TEST1');
    expect(items[1].shortcode).toBe('TEST2');
  });

  it('clears history completely', () => {
    addRecentDownload({
      id: '1',
      url: 'https://www.instagram.com/p/TEST1/',
      shortcode: 'TEST1'
    });
    expect(getRecentDownloads()).toHaveLength(1);

    clearRecentDownloads();
    expect(getRecentDownloads()).toEqual([]);
  });
});

