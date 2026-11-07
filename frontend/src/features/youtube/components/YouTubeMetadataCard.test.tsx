import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { YouTubeMetadataCard } from './YouTubeMetadataCard.js';
import { YouTubeResolvedData } from '../types.js';

describe('YouTubeMetadataCard Component Suite', () => {
  const baseData: YouTubeResolvedData = {
    videoId: 'dQw4w9WgXcQ',
    canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    title: 'Rick Astley - Never Gonna Give You Up',
    author: 'Rick Astley',
    authorUrl: 'https://www.youtube.com/@RickAstleyYT',
    description: 'The official music video for Never Gonna Give You Up',
    durationSeconds: 213,
    durationFormatted: '03:33',
    publishedAt: '2009-10-25T06:57:33Z',
    embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    embedStatus: 'allowed',
    isEmbeddable: true,
    embeddingAllowed: true,
    metadataCapability: 'FULL_METADATA',
    metadataFetchedAt: '2026-01-01T00:00:00Z',
    metadataExpiresAt: '2026-01-31T00:00:00Z',
    thumbnails: [],
    isExpired: false
  };

  it('renders video title, author with link, duration, and canonical URL', () => {
    render(<YouTubeMetadataCard data={baseData} />);

    expect(screen.getByText('Rick Astley - Never Gonna Give You Up')).toBeDefined();
    const authorLink = screen.getByRole('link', { name: /Rick Astley/i });
    expect(authorLink.getAttribute('href')).toBe('https://www.youtube.com/@RickAstleyYT');
    expect(screen.getByText(/03:33/)).toBeDefined();
    expect(screen.getByText('Full Data API Metadata')).toBeDefined();
    expect(screen.getByText(/The official music video for Never Gonna Give You Up/)).toBeDefined();
  });

  it('displays expiration warning banner and Refresh button when metadata is expired', () => {
    const expiredData: YouTubeResolvedData = {
      ...baseData,
      isExpired: true
    };
    const onRefresh = vi.fn();

    render(<YouTubeMetadataCard data={expiredData} onRefreshMetadata={onRefresh} />);

    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByText(/API Metadata Expired/i)).toBeDefined();

    const refreshBtn = screen.getByRole('button', { name: /Refresh Metadata/i });
    fireEvent.click(refreshBtn);

    expect(onRefresh).toHaveBeenCalled();
  });

  it('allows editing and saving user notes, tags, and collections', () => {
    const onSave = vi.fn();
    render(
      <YouTubeMetadataCard
        data={baseData}
        notes="Initial study notes"
        tags={['music']}
        collections={['Favorites']}
        onSaveUserFields={onSave}
      />
    );

    // Toggle editor
    const toggleBtn = screen.getByRole('button', { name: /Notes & Tags/i });
    fireEvent.click(toggleBtn);

    expect(screen.getByTestId('user-notes-editor')).toBeDefined();
    const textarea = screen.getByPlaceholderText(/Add your study notes/i);
    expect((textarea as HTMLTextAreaElement).value).toBe('Initial study notes');

    // Add a new tag
    const tagInput = screen.getByPlaceholderText(/e.g. tutorial/i);
    fireEvent.change(tagInput, { target: { value: 'classic' } });
    fireEvent.click(screen.getByRole('button', { name: /Add Tag/i }));

    expect(screen.getByText(/#classic/)).toBeDefined();

    // Save notes
    const saveBtn = screen.getByRole('button', { name: /Save Notes & Tags/i });
    fireEvent.click(saveBtn);

    expect(onSave).toHaveBeenCalledWith('Initial study notes', ['music', 'classic'], ['Favorites']);
  });

  it('copies metadata JSON to clipboard when Copy JSON is clicked', () => {
    const writeTextMock = vi.fn();
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock
      }
    });

    render(<YouTubeMetadataCard data={baseData} />);

    const copyBtn = screen.getByRole('button', { name: /Copy JSON/i });
    fireEvent.click(copyBtn);

    expect(writeTextMock).toHaveBeenCalled();
    const payload = JSON.parse(writeTextMock.mock.calls[0][0]);
    expect(payload.title).toBe('Rick Astley - Never Gonna Give You Up');
    expect(payload.duration).toBe('03:33');
  });
});
