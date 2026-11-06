import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { YouTubeUrlInput } from './YouTubeUrlInput.js';

describe('YouTubeUrlInput Component Suite', () => {
  it('renders input field with placeholder and resolve button', () => {
    const onResolve = vi.fn();
    const onCancel = vi.fn();
    render(<YouTubeUrlInput onResolve={onResolve} onCancel={onCancel} isLoading={false} />);

    expect(screen.getByPlaceholderText(/Paste YouTube URL/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /Resolve Video/i })).toBeDefined();
  });

  it('detects standard watch URL and enables submit', async () => {
    const onResolve = vi.fn();
    const onCancel = vi.fn();
    render(<YouTubeUrlInput onResolve={onResolve} onCancel={onCancel} isLoading={false} />);

    const input = screen.getByPlaceholderText(/Paste YouTube URL/i);
    fireEvent.change(input, { target: { value: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } });

    await waitFor(() => {
      expect(screen.getByText(/Standard YouTube Watch Video/i)).toBeDefined();
    });

    const submitBtn = screen.getByRole('button', { name: /Resolve Video/i });
    expect(submitBtn).not.toHaveProperty('disabled', true);

    fireEvent.click(submitBtn);
    expect(onResolve).toHaveBeenCalledWith('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });

  it('detects youtu.be short URL format and normalizes to canonical watch URL', async () => {
    const onResolve = vi.fn();
    const onCancel = vi.fn();
    render(<YouTubeUrlInput onResolve={onResolve} onCancel={onCancel} isLoading={false} />);

    const input = screen.getByPlaceholderText(/Paste YouTube URL/i);
    fireEvent.change(input, { target: { value: 'https://youtu.be/dQw4w9WgXcQ' } });

    await waitFor(() => {
      expect(screen.getByText(/YouTube Shortened Link/i)).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /Resolve Video/i }));
    expect(onResolve).toHaveBeenCalledWith('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });

  it('detects YouTube Shorts URL and resolves canonically', async () => {
    const onResolve = vi.fn();
    const onCancel = vi.fn();
    render(<YouTubeUrlInput onResolve={onResolve} onCancel={onCancel} isLoading={false} />);

    const input = screen.getByPlaceholderText(/Paste YouTube URL/i);
    fireEvent.change(input, { target: { value: 'https://www.youtube.com/shorts/abcdef12345' } });

    await waitFor(() => {
      expect(screen.getByText(/YouTube Shorts/i)).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /Resolve Video/i }));
    expect(onResolve).toHaveBeenCalledWith('https://www.youtube.com/watch?v=abcdef12345');
  });

  it('detects YouTube Live URL and resolves canonically', async () => {
    const onResolve = vi.fn();
    const onCancel = vi.fn();
    render(<YouTubeUrlInput onResolve={onResolve} onCancel={onCancel} isLoading={false} />);

    const input = screen.getByPlaceholderText(/Paste YouTube URL/i);
    fireEvent.change(input, { target: { value: 'https://www.youtube.com/live/jfKfPfyJRdk' } });

    await waitFor(() => {
      expect(screen.getByText(/YouTube Live Stream/i)).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /Resolve Video/i }));
    expect(onResolve).toHaveBeenCalledWith('https://www.youtube.com/watch?v=jfKfPfyJRdk');
  });

  it('detects YouTube Embed URL and resolves canonically', async () => {
    const onResolve = vi.fn();
    const onCancel = vi.fn();
    render(<YouTubeUrlInput onResolve={onResolve} onCancel={onCancel} isLoading={false} />);

    const input = screen.getByPlaceholderText(/Paste YouTube URL/i);
    fireEvent.change(input, { target: { value: 'https://www.youtube.com/embed/dQw4w9WgXcQ' } });

    await waitFor(() => {
      expect(screen.getByText(/YouTube Embed Link/i)).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /Resolve Video/i }));
    expect(onResolve).toHaveBeenCalledWith('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });

  it('rejects unsupported playlist URLs with clear validation error', async () => {
    const onResolve = vi.fn();
    const onCancel = vi.fn();
    render(<YouTubeUrlInput onResolve={onResolve} onCancel={onCancel} isLoading={false} />);

    const input = screen.getByPlaceholderText(/Paste YouTube URL/i);
    fireEvent.change(input, { target: { value: 'https://www.youtube.com/playlist?list=PL123456789' } });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined();
      expect(screen.getByText(/Playlists are not supported/i)).toBeDefined();
    });

    expect(onResolve).not.toHaveBeenCalled();
  });

  it('rejects unsupported channel URLs with clear validation error', async () => {
    const onResolve = vi.fn();
    const onCancel = vi.fn();
    render(<YouTubeUrlInput onResolve={onResolve} onCancel={onCancel} isLoading={false} />);

    const input = screen.getByPlaceholderText(/Paste YouTube URL/i);
    fireEvent.change(input, { target: { value: 'https://www.youtube.com/@veritasium' } });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined();
      expect(screen.getByText(/Channel URLs are not supported/i)).toBeDefined();
    });
  });

  it('rejects invalid YouTube video ID with clear validation error', async () => {
    const onResolve = vi.fn();
    const onCancel = vi.fn();
    render(<YouTubeUrlInput onResolve={onResolve} onCancel={onCancel} isLoading={false} />);

    const input = screen.getByPlaceholderText(/Paste YouTube URL/i);
    fireEvent.change(input, { target: { value: 'https://www.youtube.com/watch?v=tooshort' } });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined();
      expect(screen.getByText(/Must be exactly 11 alphanumeric characters/i)).toBeDefined();
    });
  });

  it('rejects non-YouTube URLs', async () => {
    const onResolve = vi.fn();
    const onCancel = vi.fn();
    render(<YouTubeUrlInput onResolve={onResolve} onCancel={onCancel} isLoading={false} />);

    const input = screen.getByPlaceholderText(/Paste YouTube URL/i);
    fireEvent.change(input, { target: { value: 'https://www.instagram.com/p/Cxyz123/' } });

    await waitFor(() => {
      expect(screen.getByText(/Please enter a YouTube link/i)).toBeDefined();
    });
  });

  it('prevents duplicate submission if video is already loaded in workspace', async () => {
    const onResolve = vi.fn();
    const onCancel = vi.fn();
    render(
      <YouTubeUrlInput
        onResolve={onResolve}
        onCancel={onCancel}
        isLoading={false}
        activeCanonicalUrl="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
      />
    );

    const input = screen.getByPlaceholderText(/Paste YouTube URL/i);
    fireEvent.change(input, { target: { value: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } });

    const submitBtn = screen.getByRole('button', { name: /Resolve Video/i });
    fireEvent.click(submitBtn);

    expect(screen.getByText(/already loaded in the workspace/i)).toBeDefined();
    expect(onResolve).not.toHaveBeenCalled();
  });

  it('renders Cancel button and calls onCancel during loading state', () => {
    const onResolve = vi.fn();
    const onCancel = vi.fn();
    render(<YouTubeUrlInput onResolve={onResolve} onCancel={onCancel} isLoading={true} />);

    const cancelBtn = screen.getByRole('button', { name: /Cancel/i });
    expect(cancelBtn).toBeDefined();

    fireEvent.click(cancelBtn);
    expect(onCancel).toHaveBeenCalled();
  });

  it('clears input when Clear button is clicked', async () => {
    const onResolve = vi.fn();
    const onCancel = vi.fn();
    render(<YouTubeUrlInput onResolve={onResolve} onCancel={onCancel} isLoading={false} />);

    const input = screen.getByPlaceholderText(/Paste YouTube URL/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } });
    expect(input.value).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

    const clearBtn = screen.getByRole('button', { name: /Clear/i });
    fireEvent.click(clearBtn);

    expect(input.value).toBe('');
  });
});
