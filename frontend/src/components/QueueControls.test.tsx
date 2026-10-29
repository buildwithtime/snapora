import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueueControls } from './QueueControls.js';
import { QueueProvider } from '../context/QueueContext.js';
import { QueueJob } from '../types/queue.js';
import * as storage from '../utils/storage.js';

vi.mock('../utils/storage.js', () => ({
  saveJobsToStorage: vi.fn(),
  loadJobsFromStorage: vi.fn(),
  clearAllJobsFromStorage: vi.fn()
}));

describe('QueueControls Dropdown Suite', () => {
  const sampleResolvedJob: QueueJob = {
    id: 'job_test_1',
    url: 'https://www.instagram.com/p/TEST12345/',
    normalizedUrl: 'https://www.instagram.com/p/TEST12345/',
    shortcode: 'TEST12345',
    status: 'ready',
    createdAt: Date.now(),
    retryCount: 0,
    media: [
      {
        id: 'media_1',
        filename: 'creator_2026-10-25_TEST12345_slide-01.jpg',
        type: 'image',
        url: 'https://scontent.cdninstagram.com/photo1.jpg',
        downloadable: true
      },
      {
        id: 'media_2',
        filename: 'creator_2026-10-25_TEST12345_slide-02.jpg',
        type: 'image',
        url: 'https://scontent.cdninstagram.com/photo2.jpg',
        downloadable: true
      }
    ]
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(storage.loadJobsFromStorage).mockResolvedValue([sampleResolvedJob]);
  });

  it('renders Download All button with individual mode as default', async () => {
    render(
      <QueueProvider>
        <QueueControls />
      </QueueProvider>
    );

    const downloadBtn = await screen.findByRole('button', { name: /Download All/i });
    expect(downloadBtn).toBeDefined();
    expect(downloadBtn.textContent).toContain('Download All (2)');

    // Dropdown trigger is rendered adjacent
    const trigger = screen.getByLabelText(/Choose download format/i);
    expect(trigger).toBeDefined();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens dropdown menu on trigger click and displays both options', async () => {
    render(
      <QueueProvider>
        <QueueControls />
      </QueueProvider>
    );

    const trigger = await screen.findByLabelText(/Choose download format/i);
    fireEvent.click(trigger);

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('menu')).toBeDefined();
    expect(screen.getByText('⬇️ Download individually')).toBeDefined();
    expect(screen.getByText('📦 Download as ZIP')).toBeDefined();
  });

  it('switches mode to ZIP when "Download as ZIP" is selected', async () => {
    render(
      <QueueProvider>
        <QueueControls />
      </QueueProvider>
    );

    // Open dropdown
    const trigger = await screen.findByLabelText(/Choose download format/i);
    fireEvent.click(trigger);

    // Select ZIP mode
    const zipOption = screen.getByText('📦 Download as ZIP');
    fireEvent.click(zipOption);

    // Dropdown closes and button label updates
    await waitFor(() => {
      expect(screen.queryByRole('menu')).toBeNull();
    });

    const downloadBtn = screen.getByRole('button', { name: /Download All as ZIP/i });
    expect(downloadBtn.textContent).toContain('Download All as ZIP (2)');
  });

  it('closes dropdown when Escape key is pressed', async () => {
    render(
      <QueueProvider>
        <QueueControls />
      </QueueProvider>
    );

    const trigger = await screen.findByLabelText(/Choose download format/i);
    fireEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeDefined();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('menu')).toBeNull();
    });
  });

  it('closes dropdown when clicking outside', async () => {
    render(
      <QueueProvider>
        <div>Outside Element</div>
        <QueueControls />
      </QueueProvider>
    );

    const trigger = await screen.findByLabelText(/Choose download format/i);
    fireEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeDefined();

    fireEvent.mouseDown(screen.getByText('Outside Element'));
    await waitFor(() => {
      expect(screen.queryByRole('menu')).toBeNull();
    });
  });
});
