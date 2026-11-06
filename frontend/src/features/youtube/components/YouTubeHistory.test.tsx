import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { YouTubeHistory } from './YouTubeHistory.js';
import { YouTubeWorkspaceRecord } from '../types.js';

describe('YouTubeHistory Component Suite', () => {
  const records: YouTubeWorkspaceRecord[] = [
    {
      id: 'yt_rec_1',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      videoId: 'dQw4w9WgXcQ',
      data: {
        videoId: 'dQw4w9WgXcQ',
        canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        title: 'Rick Astley - Never Gonna Give You Up',
        author: 'Rick Astley',
        durationFormatted: '03:33',
        embedStatus: 'allowed',
        metadataCapability: 'FULL_METADATA',
        metadataFetchedAt: '2026-01-01T00:00:00Z',
        metadataExpiresAt: '2026-01-31T00:00:00Z',
        thumbnails: [{ resolution: 'hqdefault', url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg' }],
        isExpired: false
      },
      notes: 'Favorite 80s track',
      tags: ['music', 'retro'],
      collections: ['Classics'],
      createdAt: 1700000000000,
      updatedAt: 1700000000000
    },
    {
      id: 'yt_rec_2',
      url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
      canonicalUrl: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
      videoId: 'jNQXAC9IVRw',
      data: {
        videoId: 'jNQXAC9IVRw',
        canonicalUrl: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
        title: '[Metadata Expired - Please Refresh]',
        author: '[Expired]',
        embedStatus: 'unknown',
        metadataCapability: 'UNAVAILABLE',
        metadataFetchedAt: '2025-10-01T00:00:00Z',
        metadataExpiresAt: '2025-10-31T00:00:00Z',
        thumbnails: [],
        isExpired: true
      },
      notes: 'Historic video',
      tags: ['history'],
      createdAt: 1690000000000,
      updatedAt: 1690000000000
    }
  ];

  it('renders history records with thumbnails, titles, authors, and notes/tags', () => {
    const onSelect = vi.fn();
    const onDelete = vi.fn();
    const onRefresh = vi.fn();
    const onClear = vi.fn();

    render(
      <YouTubeHistory
        records={records}
        onSelectRecord={onSelect}
        onDeleteRecord={onDelete}
        onRefreshRecord={onRefresh}
        onClearAll={onClear}
      />
    );

    expect(screen.getByText('Rick Astley - Never Gonna Give You Up')).toBeDefined();
    expect(screen.getByText('Rick Astley')).toBeDefined();
    expect(screen.getByText(/Favorite 80s track/)).toBeDefined();
    expect(screen.getByText('#music')).toBeDefined();
    expect(screen.getByText('📁 Classics')).toBeDefined();

    // Expired item shows expired badge
    expect(screen.getAllByText('Expired').length).toBeGreaterThan(0);
  });

  it('triggers onSelectRecord when Reopen button is clicked', () => {
    const onSelect = vi.fn();
    const onDelete = vi.fn();
    const onRefresh = vi.fn();
    const onClear = vi.fn();

    render(
      <YouTubeHistory
        records={records}
        onSelectRecord={onSelect}
        onDeleteRecord={onDelete}
        onRefreshRecord={onRefresh}
        onClearAll={onClear}
      />
    );

    const reopenBtns = screen.getAllByRole('button', { name: /Reopen/i });
    fireEvent.click(reopenBtns[0]);

    expect(onSelect).toHaveBeenCalledWith(records[0]);
  });

  it('triggers onDeleteRecord when delete button is clicked', () => {
    const onSelect = vi.fn();
    const onDelete = vi.fn();
    const onRefresh = vi.fn();
    const onClear = vi.fn();

    render(
      <YouTubeHistory
        records={records}
        onSelectRecord={onSelect}
        onDeleteRecord={onDelete}
        onRefreshRecord={onRefresh}
        onClearAll={onClear}
      />
    );

    const deleteBtns = screen.getAllByTitle(/Remove from history/i);
    fireEvent.click(deleteBtns[0]);

    expect(onDelete).toHaveBeenCalledWith('yt_rec_1');
  });

  it('triggers onRefreshRecord for expired items', () => {
    const onSelect = vi.fn();
    const onDelete = vi.fn();
    const onRefresh = vi.fn();
    const onClear = vi.fn();

    render(
      <YouTubeHistory
        records={records}
        onSelectRecord={onSelect}
        onDeleteRecord={onDelete}
        onRefreshRecord={onRefresh}
        onClearAll={onClear}
      />
    );

    const refreshBtn = screen.getByRole('button', { name: /Refresh/i });
    fireEvent.click(refreshBtn);

    expect(onRefresh).toHaveBeenCalledWith(records[1]);
  });

  it('renders empty state when history is empty', () => {
    const onSelect = vi.fn();
    const onDelete = vi.fn();
    const onRefresh = vi.fn();
    const onClear = vi.fn();

    render(
      <YouTubeHistory
        records={[]}
        onSelectRecord={onSelect}
        onDeleteRecord={onDelete}
        onRefreshRecord={onRefresh}
        onClearAll={onClear}
      />
    );

    expect(screen.getByTestId('youtube-history-empty')).toBeDefined();
  });
});
