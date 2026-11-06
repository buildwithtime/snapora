import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { YouTubeThumbnailGallery } from './YouTubeThumbnailGallery.js';
import { YouTubeThumbnailItem } from '../types.js';

describe('YouTubeThumbnailGallery Component Suite', () => {
  const thumbnails: YouTubeThumbnailItem[] = [
    {
      resolution: 'maxresdefault',
      url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
      width: 1280,
      height: 720,
      verified: true
    },
    {
      resolution: 'hqdefault',
      url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
      width: 480,
      height: 360,
      verified: false
    }
  ];

  it('renders discovered thumbnail variants with dimensions and quality labels', () => {
    render(<YouTubeThumbnailGallery thumbnails={thumbnails} title="Test Video" />);

    expect(screen.getByText('Discovered Thumbnails')).toBeDefined();
    expect(screen.getByText('2 Variants')).toBeDefined();

    expect(screen.getByTestId('thumbnail-card-maxresdefault')).toBeDefined();
    expect(screen.getByText('1280 × 720')).toBeDefined();

    expect(screen.getByTestId('thumbnail-card-hqdefault')).toBeDefined();
    expect(screen.getByText('480 × 360')).toBeDefined();
  });

  it('distinguishes verified vs unverified thumbnails accurately', () => {
    render(<YouTubeThumbnailGallery thumbnails={thumbnails} title="Test Video" />);

    expect(screen.getByText('✓ Verified')).toBeDefined();
    expect(screen.getByText('Discovered')).toBeDefined();
  });

  it('strictly filters out thumbnails from unapproved domains', () => {
    const maliciousThumbnails: YouTubeThumbnailItem[] = [
      {
        resolution: 'hqdefault',
        url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
        width: 480,
        height: 360
      },
      {
        resolution: 'attacker',
        url: 'https://malicious-cdn.com/evil.jpg',
        width: 480,
        height: 360
      }
    ];

    render(<YouTubeThumbnailGallery thumbnails={maliciousThumbnails} title="Test Video" />);

    expect(screen.getByTestId('thumbnail-card-hqdefault')).toBeDefined();
    expect(screen.queryByTestId('thumbnail-card-attacker')).toBeNull();
  });

  it('handles broken thumbnail images gracefully on error', () => {
    render(<YouTubeThumbnailGallery thumbnails={thumbnails} title="Test Video" />);

    const img = screen.getByAltText(/Test Video - maxresdefault thumbnail/i);
    fireEvent.error(img);

    expect(screen.getByText(/Variant not available on CDN/i)).toBeDefined();
  });

  it('renders empty fallback state when no thumbnails are available', () => {
    render(<YouTubeThumbnailGallery thumbnails={[]} title="Test Video" />);

    expect(screen.getByText(/No approved thumbnail variants are currently available/i)).toBeDefined();
  });
});
