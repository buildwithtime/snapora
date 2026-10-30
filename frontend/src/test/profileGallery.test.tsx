import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../App.js';
import * as storage from '../utils/storage.js';
import * as zipDownloader from '../utils/zipDownloader.js';
import { MAX_PROFILE_ITEMS } from '../types/profile.js';
import { MAX_ZIP_ITEMS } from '../utils/zipDownloader.js';

vi.mock('../utils/storage.js', () => ({
  saveJobsToStorage: vi.fn(),
  loadJobsFromStorage: vi.fn().mockResolvedValue([]),
  clearAllJobsFromStorage: vi.fn().mockResolvedValue(undefined)
}));

describe('Instagram Profile Discovery & Selective Downloading Gallery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (storage.loadJobsFromStorage as any).mockResolvedValue([]);
  });

  it('detects profile URL submission and renders profile gallery with items', async () => {
    render(<App />);

    const textarea = screen.getByPlaceholderText(/Paste your Instagram link/i);
    const fetchBtn = screen.getByText('Fetch Media');

    fireEvent.change(textarea, { target: { value: 'https://www.instagram.com/creator_studio/' } });
    fireEvent.click(fetchBtn);

    // Profile header should appear
    await waitFor(() => {
      expect(screen.getByText('@creator_studio')).toBeDefined();
    });

    expect(screen.getByText('Instagram ↗')).toBeDefined();
    expect(screen.getByText('✕ Close')).toBeDefined();

    // Selection toolbar buttons should be present
    expect(screen.getByText(/Download Selected/)).toBeDefined();
    expect(screen.getByText('All')).toBeDefined();
    expect(screen.getByText(/Photos/)).toBeDefined();
    expect(screen.getByText(/Videos/)).toBeDefined();
    expect(screen.getByText(/Carousels/)).toBeDefined();
  });

  it('supports selecting all, none, inverting, and toggling individual items', async () => {
    render(<App />);

    const textarea = screen.getByPlaceholderText(/Paste your Instagram link/i);
    const fetchBtn = screen.getByText('Fetch Media');

    fireEvent.change(textarea, { target: { value: 'https://www.instagram.com/creator_studio/' } });
    fireEvent.click(fetchBtn);

    await waitFor(() => {
      expect(screen.getByText('@creator_studio')).toBeDefined();
    });

    // Initially 0 selected
    expect(screen.getByText('Download Selected (0)')).toBeDefined();

    // Click "All"
    const allBtn = screen.getByRole('button', { name: 'All' });
    fireEvent.click(allBtn);

    await waitFor(() => {
      expect(screen.getByText('Download Selected (12)')).toBeDefined();
    });

    // Click "None"
    const noneBtn = screen.getByRole('button', { name: 'None' });
    fireEvent.click(noneBtn);

    await waitFor(() => {
      expect(screen.getByText('Download Selected (0)')).toBeDefined();
    });

    // Click "Invert"
    const invertBtn = screen.getByRole('button', { name: 'Invert' });
    fireEvent.click(invertBtn);

    await waitFor(() => {
      expect(screen.getByText('Download Selected (12)')).toBeDefined();
    });
  });

  it('enqueues selected profile items into the sequential download queue', async () => {
    render(<App />);

    const textarea = screen.getByPlaceholderText(/Paste your Instagram link/i);
    const fetchBtn = screen.getByText('Fetch Media');

    fireEvent.change(textarea, { target: { value: 'https://www.instagram.com/creator_studio/' } });
    fireEvent.click(fetchBtn);

    await waitFor(() => {
      expect(screen.getByText('@creator_studio')).toBeDefined();
    });

    // Select all 12 loaded items
    const allBtn = screen.getByRole('button', { name: 'All' });
    fireEvent.click(allBtn);

    // Click Download Selected
    const downloadSelectedBtn = screen.getByText('Download Selected (12)');
    fireEvent.click(downloadSelectedBtn);

    // Queue list should receive the items
    await waitFor(() => {
      expect(screen.getByText(/Added 12 media posts to download queue!/)).toBeDefined();
    });
  });

  it('allows inspecting carousel slides via slide modal', async () => {
    render(<App />);

    const textarea = screen.getByPlaceholderText(/Paste your Instagram link/i);
    const fetchBtn = screen.getByText('Fetch Media');

    fireEvent.change(textarea, { target: { value: 'https://www.instagram.com/creator_studio/' } });
    fireEvent.click(fetchBtn);

    await waitFor(() => {
      expect(screen.getByText('@creator_studio')).toBeDefined();
    });

    // Filter to Carousels
    const carouselFilterBtn = screen.getByRole('button', { name: /Carousels/ });
    fireEvent.click(carouselFilterBtn);

    // Click on "👁️ Slides" button
    const slidesButtons = screen.getAllByText('👁️ Slides');
    expect(slidesButtons.length).toBeGreaterThan(0);
    fireEvent.click(slidesButtons[0]);

    // Modal dialog should appear
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeDefined();
      expect(screen.getByText(/Carousel Album/)).toBeDefined();
    });

    // Close modal via Close button
    const closeBtn = screen.getByTitle('Close (Esc)');
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('closes profile gallery when Close button is clicked', async () => {
    render(<App />);

    const textarea = screen.getByPlaceholderText(/Paste your Instagram link/i);
    const fetchBtn = screen.getByText('Fetch Media');

    fireEvent.change(textarea, { target: { value: 'https://www.instagram.com/creator_studio/' } });
    fireEvent.click(fetchBtn);

    await waitFor(() => {
      expect(screen.getByText('@creator_studio')).toBeDefined();
    });

    const closeGalleryBtn = screen.getByRole('button', { name: 'Close Profile Gallery' });
    fireEvent.click(closeGalleryBtn);

    await waitFor(() => {
      expect(screen.queryByText('@creator_studio')).toBeNull();
    });
  });

  it('isolates selected profile items when exporting ZIP without including unrelated queue jobs', async () => {
    // 1. Pre-seed storage with 5 unrelated resolved jobs
    const unrelatedJobs = [1, 2, 3, 4, 5].map((i) => ({
      id: `unrelated_job_${i}`,
      rawUrl: `https://www.instagram.com/p/unrelated_${i}/`,
      normalizedUrl: `https://www.instagram.com/p/unrelated_${i}/`,
      shortcode: `unrelated_${i}`,
      mediaType: 'image' as const,
      status: 'success' as const,
      resolutionStatus: 'direct_media_available' as const,
      addedAt: Date.now() - 1000 * i,
      downloadAvailable: true,
      media: [
        {
          id: `unrelated_media_${i}`,
          postId: `unrelated_${i}`,
          type: 'image' as const,
          url: `https://example.com/unrelated_${i}.jpg`,
          filename: `snapora_unrelated_${i}.jpg`,
          downloadable: true
        }
      ]
    }));

    (storage.loadJobsFromStorage as any).mockResolvedValue(unrelatedJobs);

    const zipSpy = vi.spyOn(zipDownloader, 'buildAndDownloadZip').mockResolvedValue({
      success: true,
      archiveName: 'Snapora_creator_studio_selection.zip',
      completed: 3,
      failed: 0,
      failedItemIds: [],
      totalBytes: 1024
    });

    render(<App />);

    await waitFor(() => {
      expect(storage.loadJobsFromStorage).toHaveBeenCalled();
    });

    const textarea = screen.getByPlaceholderText(/Paste your Instagram link/i);
    const fetchBtn = screen.getByText('Fetch Media');

    fireEvent.change(textarea, { target: { value: 'https://www.instagram.com/creator_studio/' } });
    fireEvent.click(fetchBtn);

    await waitFor(() => {
      expect(screen.getByText('@creator_studio')).toBeDefined();
    });

    // Toggle 2 individual media cards (first two checkboxes)
    const cards = screen.getAllByRole('checkbox');
    expect(cards.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(cards[0]);
    fireEvent.click(cards[1]);

    const zipButton = await screen.findByRole('button', { name: /ZIP \(2\)/i });
    expect(zipButton).toBeDefined();

    fireEvent.click(zipButton);

    await waitFor(() => {
      expect(zipSpy).toHaveBeenCalledTimes(1);
    });

    const callArgs = zipSpy.mock.calls[0][0];
    // Check that items passed to ZIP are strictly from the selected profile items
    expect(callArgs.items.length).toBeGreaterThan(0);
    expect(callArgs.archivePrefix).toBe('Snapora_creator_studio_selection');

    // Confirm NONE of the 5 unrelated queue jobs are in the ZIP items
    const passedJobIds = callArgs.items.map((i: any) => i.jobId);
    unrelatedJobs.forEach((job) => {
      expect(passedJobIds).not.toContain(job.id);
    });

    // Confirm all passed items belong to creator_studio posts
    callArgs.items.forEach((entry: any) => {
      expect(entry.jobId).toMatch(/^demo_creator_studio_/);
    });

    zipSpy.mockRestore();
  });

  it('enforces MAX_PROFILE_ITEMS independently from MAX_ZIP_ITEMS', () => {
    expect(MAX_PROFILE_ITEMS).toBe(250);
    expect(MAX_ZIP_ITEMS).toBe(100);
    expect(MAX_PROFILE_ITEMS).toBeGreaterThan(MAX_ZIP_ITEMS);
  });

  it('renders ZIP button with accurate counts and limit-aware title', async () => {
    render(<App />);

    const textarea = screen.getByPlaceholderText(/Paste your Instagram link/i);
    const fetchBtn = screen.getByText('Fetch Media');

    fireEvent.change(textarea, { target: { value: 'https://www.instagram.com/creator_studio/' } });
    fireEvent.click(fetchBtn);

    await waitFor(() => {
      expect(screen.getByText('@creator_studio')).toBeDefined();
    });

    const allBtn = screen.getByRole('button', { name: 'All' });
    fireEvent.click(allBtn);

    const zipButton = await screen.findByRole('button', { name: /ZIP \(12\)/i });
    expect(zipButton).toBeDefined();
    expect(zipButton.getAttribute('title')).toContain('12');
  });
});

