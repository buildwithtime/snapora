import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { YouTubeWorkspace } from './YouTubeWorkspace.js';
import * as youtubeApi from './services/youtubeApi.js';
import App from '../../App.js';

describe('YouTubeWorkspace Integration Suite', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  const mockSuccessData = {
    videoId: 'dQw4w9WgXcQ',
    canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    title: 'Rick Astley - Never Gonna Give You Up',
    author: 'Rick Astley',
    authorUrl: 'https://www.youtube.com/@RickAstleyYT',
    description: 'The official music video for Rick Astley',
    durationSeconds: 213,
    durationFormatted: '03:33',
    publishedAt: '2009-10-25T06:57:33Z',
    embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    embedStatus: 'allowed' as const,
    isEmbeddable: true,
    embeddingAllowed: true,
    metadataCapability: 'FULL_METADATA' as const,
    metadataFetchedAt: new Date().toISOString(),
    metadataExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    thumbnails: [
      {
        resolution: 'maxresdefault',
        url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
        width: 1280,
        height: 720,
        verified: true
      }
    ],
    isExpired: false
  };

  it('renders workspace with compliance notices and input form', () => {
    render(<YouTubeWorkspace />);

    expect(screen.getByText('YouTube Media Workspace')).toBeDefined();
    expect(screen.getByText('Stream Ripping Prohibited')).toBeDefined();
    expect(screen.getByText('30-Day Data Retention')).toBeDefined();
    expect(screen.getByPlaceholderText(/Paste YouTube URL/i)).toBeDefined();
  });

  it('resolves a YouTube video URL, renders preview player, metadata, thumbnails, and history', async () => {
    vi.spyOn(youtubeApi, 'resolveYouTubeVideo').mockResolvedValueOnce({
      ok: true,
      data: mockSuccessData
    });

    render(<YouTubeWorkspace />);

    const input = screen.getByPlaceholderText(/Paste YouTube URL/i);
    fireEvent.change(input, { target: { value: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } });

    const submitBtn = screen.getByRole('button', { name: /Resolve Video/i });
    fireEvent.click(submitBtn);

    // Wait for resolution to render
    await waitFor(() => {
      expect(screen.getAllByText('Rick Astley - Never Gonna Give You Up').length).toBeGreaterThan(0);
    });

    // Preview rendered
    expect(screen.getByTestId('youtube-video-preview')).toBeDefined();
    expect(screen.getByText('✓ Embedding Allowed')).toBeDefined();

    // Metadata card rendered
    expect(screen.getByTestId('youtube-metadata-card')).toBeDefined();
    expect(screen.getAllByText(/03:33/).length).toBeGreaterThan(0);

    // Thumbnail gallery rendered
    expect(screen.getByTestId('youtube-thumbnail-gallery')).toBeDefined();
    expect(screen.getByText('1280 × 720')).toBeDefined();

    // History item saved and displayed
    expect(screen.getByTestId('history-item-dQw4w9WgXcQ')).toBeDefined();
  });

  it('handles resolution failure and displays accessible error banner with dismiss', async () => {
    vi.spyOn(youtubeApi, 'resolveYouTubeVideo').mockResolvedValueOnce({
      ok: false,
      error: {
        code: 'PRIVATE_VIDEO',
        message: 'This YouTube video is private or restricted by the creator.'
      }
    });

    render(<YouTubeWorkspace />);

    const input = screen.getByPlaceholderText(/Paste YouTube URL/i);
    fireEvent.change(input, { target: { value: 'https://www.youtube.com/watch?v=abcdef12345' } });

    const submitBtn = screen.getByRole('button', { name: /Resolve Video/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByTestId('youtube-error-banner')).toBeDefined();
      expect(screen.getByText(/PRIVATE_VIDEO/)).toBeDefined();
      expect(screen.getByText(/private or restricted/i)).toBeDefined();
    });

    // Dismiss error
    const dismissBtn = screen.getByRole('button', { name: /Dismiss/i });
    fireEvent.click(dismissBtn);

    expect(screen.queryByTestId('youtube-error-banner')).toBeNull();
  });

  it('handles cancellation when Cancel button is clicked', async () => {
    let abortSignalCaptured: AbortSignal | undefined;
    vi.spyOn(youtubeApi, 'resolveYouTubeVideo').mockImplementation(async (_url, opts) => {
      abortSignalCaptured = opts?.signal;
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            ok: false,
            error: { code: 'CANCELLED', message: 'Resolution request was cancelled.' }
          });
        }, 500);
      });
    });

    render(<YouTubeWorkspace />);

    const input = screen.getByPlaceholderText(/Paste YouTube URL/i);
    fireEvent.change(input, { target: { value: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } });

    const submitBtn = screen.getByRole('button', { name: /Resolve Video/i });
    fireEvent.click(submitBtn);

    // Cancel button appears during loading
    const cancelBtn = screen.getByRole('button', { name: /Cancel/i });
    fireEvent.click(cancelBtn);

    expect(abortSignalCaptured?.aborted).toBe(true);
  });

  it('switches between Instagram Queue and YouTube Workspace tabs seamlessly in App', async () => {
    render(<App />);

    // Default tab is Instagram Queue
    expect(screen.getByRole('tab', { name: /Instagram Queue/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /YouTube Workspace/i })).toBeDefined();
    expect(screen.getByText(/Fetch Media/i)).toBeDefined();

    // Click YouTube Workspace tab
    const ytTab = screen.getByTestId('tab-youtube');
    fireEvent.click(ytTab);

    // YouTube workspace is now rendered
    expect(screen.getByTestId('youtube-workspace')).toBeDefined();
    expect(screen.getByText('YouTube Media Workspace')).toBeDefined();

    // Click back to Instagram Queue tab
    const instaTab = screen.getByTestId('tab-instagram');
    fireEvent.click(instaTab);

    expect(screen.getByText(/Fetch Media/i)).toBeDefined();
  });
});
