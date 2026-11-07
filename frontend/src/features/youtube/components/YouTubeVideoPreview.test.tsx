import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { YouTubeVideoPreview } from './YouTubeVideoPreview.js';
import { YouTubeResolvedData } from '../types.js';

describe('YouTubeVideoPreview Component Suite', () => {
  const baseData: YouTubeResolvedData = {
    videoId: 'dQw4w9WgXcQ',
    canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    title: 'Rick Astley - Never Gonna Give You Up',
    author: 'Rick Astley',
    embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    embedStatus: 'allowed',
    isEmbeddable: true,
    embeddingAllowed: true,
    metadataCapability: 'FULL_METADATA',
    metadataFetchedAt: new Date().toISOString(),
    metadataExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    thumbnails: []
  };

  it('renders iframe embedded player when embedStatus is allowed', () => {
    const { container } = render(<YouTubeVideoPreview data={baseData} />);

    expect(screen.getByText(/Embedding Allowed/i)).toBeDefined();
    const iframe = container.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute('src')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(iframe?.getAttribute('title')).toContain('Rick Astley');
    expect(iframe?.getAttribute('sandbox')).toContain('allow-scripts');
  });

  it('strictly does NOT render iframe when embedStatus is disabled', () => {
    const disabledData: YouTubeResolvedData = {
      ...baseData,
      embedStatus: 'disabled',
      isEmbeddable: false,
      embeddingAllowed: false,
      embedUrl: undefined
    };

    const { container } = render(<YouTubeVideoPreview data={disabledData} />);

    // Must NOT render an iframe
    const iframe = container.querySelector('iframe');
    expect(iframe).toBeNull();

    // Must show clear notice explaining embedding restriction
    expect(screen.getByTestId('embed-disabled-notice')).toBeDefined();
    expect(screen.getByText(/Embedding Disabled for this Video/i)).toBeDefined();

    // Must provide link to watch on YouTube
    const watchLink = screen.getByRole('link', { name: /Watch Video on YouTube/i });
    expect(watchLink.getAttribute('href')).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });

  it('renders embed attempt with explicit unconfirmed permission notice when embedStatus is unknown', () => {
    const unknownData: YouTubeResolvedData = {
      ...baseData,
      embedStatus: 'unknown',
      isEmbeddable: undefined,
      embeddingAllowed: undefined,
      embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'
    };

    const { container } = render(<YouTubeVideoPreview data={unknownData} />);

    // Must show notice that permission is unconfirmed
    expect(screen.getByText(/Embedding Permission Unconfirmed/i)).toBeDefined();
    expect(screen.getByText(/YouTube embedding permission has not been confirmed/i)).toBeDefined();

    // Attempts playback via iframe
    const iframe = container.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute('src')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');

    // Provides fallback link to YouTube
    const openLink = screen.getByRole('link', { name: /Open on YouTube/i });
    expect(openLink.getAttribute('href')).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });

  it('rejects unsafe non-nocookie embed URL origins', () => {
    const unsafeData: YouTubeResolvedData = {
      ...baseData,
      embedUrl: 'https://attacker.com/embed/dQw4w9WgXcQ'
    };

    const { container } = render(<YouTubeVideoPreview data={unsafeData} />);
    const iframe = container.querySelector('iframe');
    expect(iframe).toBeNull();
  });
});
