import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import App from './App.js';

// Mock storage to avoid IndexedDB dependencies in jsdom
vi.mock('./utils/storage.js', () => ({
  saveJobsToStorage: vi.fn(),
  loadJobsFromStorage: vi.fn().mockResolvedValue([]),
  clearAllJobsFromStorage: vi.fn().mockResolvedValue(undefined)
}));

describe('App Workspace Navigation & Rendering Regression Suite', () => {
  const originalHash = window.location.hash;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.location.hash = '';
  });

  afterEach(() => {
    window.location.hash = originalHash;
  });

  it('1. Instagram workspace renders each component exactly once', () => {
    render(<App />);

    // UrlInputSection rendered once
    const textareas = screen.getAllByPlaceholderText(/Paste your Instagram link/i);
    expect(textareas).toHaveLength(1);

    const fetchButtons = screen.getAllByText('Fetch Media');
    expect(fetchButtons).toHaveLength(1);

    // QueueControls rendered once
    const concurrencyBadges = screen.getAllByText(/Concurrency: 1/i);
    expect(concurrencyBadges).toHaveLength(1);

    // QueueList rendered once
    const queueHeaders = screen.getAllByText('Queue Jobs');
    expect(queueHeaders).toHaveLength(1);

    const emptyMessages = screen.getAllByText('Queue is Empty');
    expect(emptyMessages).toHaveLength(1);

    // Header and SecurityBanner rendered once
    expect(screen.getAllByText('Snapora')).toHaveLength(1);
    expect(screen.getAllByText(/Zero credentials collected/i).length).toBeGreaterThanOrEqual(1);

    // YouTube workspace is NOT rendered
    expect(screen.queryByTestId('youtube-workspace')).toBeNull();
    expect(screen.queryByPlaceholderText(/Paste YouTube URL/i)).toBeNull();
  });

  it('2. YouTube workspace does not render Instagram queue components', () => {
    window.location.hash = '#youtube';
    render(<App />);

    // Instagram queue components must be completely omitted
    expect(screen.queryByPlaceholderText(/Paste your Instagram link/i)).toBeNull();
    expect(screen.queryByText('Fetch Media')).toBeNull();
    expect(screen.queryByText(/Concurrency: 1/i)).toBeNull();
    expect(screen.queryByText('Queue Jobs')).toBeNull();
    expect(screen.queryByText('Queue is Empty')).toBeNull();
  });

  it('3. YouTube workspace renders correctly', () => {
    window.location.hash = '#youtube';
    render(<App />);

    expect(screen.getByTestId('youtube-workspace')).toBeDefined();
    expect(screen.getByText('YouTube Media Workspace')).toBeDefined();
    expect(screen.getByPlaceholderText(/Paste YouTube URL/i)).toBeDefined();
    expect(screen.getByText('Stream Ripping Prohibited')).toBeDefined();
    expect(screen.getByText('30-Day Data Retention')).toBeDefined();

    // Persistent layout components remain intact
    expect(screen.getByText('Snapora')).toBeDefined();
    expect(screen.getByRole('tablist')).toBeDefined();
    expect(screen.getByTestId('tab-instagram')).toBeDefined();
    expect(screen.getByTestId('tab-youtube')).toBeDefined();
  });

  it('4. Switching from Instagram to YouTube works', () => {
    render(<App />);

    // Initially Instagram
    expect(screen.getByPlaceholderText(/Paste your Instagram link/i)).toBeDefined();
    expect(screen.queryByTestId('youtube-workspace')).toBeNull();

    // Switch to YouTube tab
    const youtubeTab = screen.getByTestId('tab-youtube');
    fireEvent.click(youtubeTab);

    // Instagram components removed
    expect(screen.queryByPlaceholderText(/Paste your Instagram link/i)).toBeNull();
    expect(screen.queryByText('Queue Jobs')).toBeNull();

    // YouTube workspace mounted
    expect(screen.getByTestId('youtube-workspace')).toBeDefined();
    expect(screen.getByPlaceholderText(/Paste YouTube URL/i)).toBeDefined();
    expect(window.location.hash).toBe('#youtube');
  });

  it('5. Switching back to Instagram works', () => {
    window.location.hash = '#youtube';
    render(<App />);

    // Confirm starting on YouTube
    expect(screen.getByTestId('youtube-workspace')).toBeDefined();

    // Switch to Instagram tab
    const instagramTab = screen.getByTestId('tab-instagram');
    fireEvent.click(instagramTab);

    // YouTube workspace unmounted
    expect(screen.queryByTestId('youtube-workspace')).toBeNull();

    // Instagram components restored once each
    expect(screen.getAllByPlaceholderText(/Paste your Instagram link/i)).toHaveLength(1);
    expect(screen.getAllByText('Fetch Media')).toHaveLength(1);
    expect(screen.getAllByText('Queue Jobs')).toHaveLength(1);
    expect(window.location.hash).toBe('#instagram');
  });

  it('6. Direct loading with #youtube selects YouTube', () => {
    window.location.hash = '#youtube';
    render(<App />);

    expect(screen.getByTestId('youtube-workspace')).toBeDefined();
    expect(screen.getByPlaceholderText(/Paste YouTube URL/i)).toBeDefined();
    expect(screen.queryByPlaceholderText(/Paste your Instagram link/i)).toBeNull();

    const youtubeTab = screen.getByTestId('tab-youtube');
    expect(youtubeTab.getAttribute('aria-selected')).toBe('true');
    const instagramTab = screen.getByTestId('tab-instagram');
    expect(instagramTab.getAttribute('aria-selected')).toBe('false');
  });

  it('7. Direct loading with #instagram selects Instagram', () => {
    window.location.hash = '#instagram';
    render(<App />);

    expect(screen.getByPlaceholderText(/Paste your Instagram link/i)).toBeDefined();
    expect(screen.queryByTestId('youtube-workspace')).toBeNull();

    const instagramTab = screen.getByTestId('tab-instagram');
    expect(instagramTab.getAttribute('aria-selected')).toBe('true');
    const youtubeTab = screen.getByTestId('tab-youtube');
    expect(youtubeTab.getAttribute('aria-selected')).toBe('false');
  });

  it('8. Browser hash changes update the selected workspace', () => {
    render(<App />);

    // Initially Instagram
    expect(screen.getByPlaceholderText(/Paste your Instagram link/i)).toBeDefined();
    expect(screen.queryByTestId('youtube-workspace')).toBeNull();

    // Browser navigates to #youtube
    act(() => {
      window.location.hash = '#youtube';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(screen.queryByPlaceholderText(/Paste your Instagram link/i)).toBeNull();
    expect(screen.getByTestId('youtube-workspace')).toBeDefined();

    // Browser navigates to #instagram
    act(() => {
      window.location.hash = '#instagram';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(screen.getByPlaceholderText(/Paste your Instagram link/i)).toBeDefined();
    expect(screen.queryByTestId('youtube-workspace')).toBeNull();

    // Browser back to empty hash (defaults to Instagram)
    act(() => {
      window.location.hash = '';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(screen.getByPlaceholderText(/Paste your Instagram link/i)).toBeDefined();
    expect(screen.queryByTestId('youtube-workspace')).toBeNull();
  });

  it('9. Cross-workspace YouTube URL detection prompts and switches to YouTube workspace', () => {
    render(<App />);

    const textarea = screen.getByPlaceholderText(/Paste your Instagram link/i);

    // Paste a YouTube link in the Instagram input
    fireEvent.change(textarea, {
      target: { value: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }
    });

    // Cross-workspace banner appears
    expect(
      screen.getByText(/Detected YouTube URL\. Would you like to open it in the YouTube Workspace\?/i)
    ).toBeDefined();

    // Click the prompt button
    const switchButton = screen.getByRole('button', { name: /Switch to YouTube Workspace/i });
    fireEvent.click(switchButton);

    // Workspace transitions to YouTube
    expect(screen.getByTestId('youtube-workspace')).toBeDefined();
    expect(screen.queryByPlaceholderText(/Paste your Instagram link/i)).toBeNull();
    expect(window.location.hash).toBe('#youtube');
  });
});
