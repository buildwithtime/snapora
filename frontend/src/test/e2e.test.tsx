import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../App.js';
import * as storage from '../utils/storage.js';

// Mock IndexedDB operations to avoid jsdom IndexedDB quirks in tests
vi.mock('../utils/storage.js', () => ({
  saveJobsToStorage: vi.fn(),
  loadJobsFromStorage: vi.fn().mockResolvedValue([]),
  clearAllJobsFromStorage: vi.fn().mockResolvedValue(undefined)
}));

describe('Snapora End-to-End & Scenario Validation Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (storage.loadJobsFromStorage as any).mockResolvedValue([]);
  });

  it('Scenario 1: Homepage loads with core layout and controls', () => {
    render(<App />);

    expect(screen.getByText('Snapora')).toBeDefined();
    expect(screen.getByText('Queue Jobs')).toBeDefined();
    expect(screen.getByText('Fetch Media')).toBeDefined();
    expect(screen.getByText('Queue is Empty')).toBeDefined();
    expect(screen.getByText(/Concurrency: 1/)).toBeDefined();
  });

  it('Scenario 2, 3, 4, 5: User pastes batch URLs with valid, invalid, and duplicate links', async () => {
    render(<App />);

    const textarea = screen.getByPlaceholderText(/Paste your Instagram link/i);
    const addButton = screen.getByText('Fetch Media');

    const batchInput = [
      'https://www.instagram.com/p/VALID111/',
      'https://www.instagram.com/reel/VALID222/',
      'https://www.instagram.com/p/VALID111/', // duplicate
      'https://not-instagram.com/p/INVALID/' // invalid host
    ].join('\n');

    fireEvent.change(textarea, { target: { value: batchInput } });
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(screen.getByText(/Added 2 URLs to queue/)).toBeDefined();
    });

    expect(screen.getByText('VALID111')).toBeDefined();
    expect(screen.getByText('VALID222')).toBeDefined();
  });

  it('Scenario 6, 7, 8: Queue executes sequentially and completes jobs', async () => {
    const fetchMock = vi.fn().mockImplementation((_url, opts) => {
      const body = JSON.parse(opts.body);
      const shortcode = body.url.match(/\/p\/([a-zA-Z0-9_-]+)/)?.[1] || 'default';
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            shortcode,
            media: [
              {
                type: 'image',
                url: `https://picsum.photos/seed/${shortcode}/1080/1080`,
                filename: `snapora_${shortcode}.jpg`
              }
            ]
          })
      });
    });
    global.fetch = fetchMock;

    render(<App />);

    const textarea = screen.getByPlaceholderText(/Paste your Instagram link/i);
    const addButton = screen.getByText('Fetch Media');

    fireEvent.change(textarea, {
      target: {
        value: 'https://www.instagram.com/p/TEST_EXEC_1/'
      }
    });
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(screen.getByText(/Ready/)).toBeDefined();
    });

    expect(screen.getByText('Download')).toBeDefined();
  });

  it('Scenario 9: Next job proceeds even if a prior job fails', async () => {
    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: false,
          json: () =>
            Promise.resolve({
              ok: false,
              error: { code: 'PRIVATE_ACCOUNT', message: 'Account is private' }
            })
        });
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            shortcode: 'JOB2',
            media: [{ type: 'image', url: 'https://picsum.photos/200', filename: 'job2.jpg' }]
          })
      });
    });
    global.fetch = fetchMock;

    render(<App />);

    const textarea = screen.getByPlaceholderText(/Paste your Instagram link/i);
    const addButton = screen.getByText('Fetch Media');

    fireEvent.change(textarea, {
      target: {
        value: 'https://www.instagram.com/p/FAIL_JOB/\nhttps://www.instagram.com/p/SUCCESS_JOB/'
      }
    });
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(screen.getByText(/Account is private/)).toBeDefined();
      expect(screen.getByText('✓ Ready')).toBeDefined();
    });
  });

  it('Scenario 10, 11: Pause prevents processing and Resume continues', async () => {
    global.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            shortcode: 'PAUSED_JOB',
            media: [{ type: 'image', url: 'https://picsum.photos/200', filename: 'paused.jpg' }]
          })
      })
    );

    render(<App />);

    const pauseBtn = screen.getByText('⏸ Pause Queue');
    fireEvent.click(pauseBtn);

    expect(screen.getByText('▶ Resume Queue')).toBeDefined();

    const textarea = screen.getByPlaceholderText(/Paste your Instagram link/i);
    const addButton = screen.getByText('Fetch Media');

    fireEvent.change(textarea, {
      target: { value: 'https://www.instagram.com/p/PAUSED_JOB/' }
    });
    fireEvent.click(addButton);

    expect(screen.getByText('Queued')).toBeDefined();

    // Resuming queue
    fireEvent.click(screen.getByText('▶ Resume Queue'));
    await waitFor(() => {
      expect(screen.getByText(/Ready/)).toBeDefined();
    });
  });

  it('Scenario 12: Retry button transitions failed job back to queue', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () =>
        Promise.resolve({
          ok: false,
          error: { code: 'PROVIDER_ERROR', message: 'Temporary failure message' }
        })
    });

    render(<App />);

    const textarea = screen.getByPlaceholderText(/Paste your Instagram link/i);
    const addButton = screen.getByText('Fetch Media');

    fireEvent.change(textarea, {
      target: { value: 'https://www.instagram.com/p/RETRY_TARGET/' }
    });
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(screen.getByText(/Temporary failure message/)).toBeDefined();
    });

    const retryBtn = screen.getByText('🔄 Retry');
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  it('Scenario 13, 14: Recovers interrupted jobs from storage and resets fetching state to queued', async () => {
    // Simulate stored jobs with an interrupted 'fetching' job
    (storage.loadJobsFromStorage as any).mockResolvedValue([
      {
        id: 'job_interrupted',
        url: 'https://www.instagram.com/p/INTERRUPTED/',
        normalizedUrl: 'https://www.instagram.com/p/INTERRUPTED/',
        shortcode: 'INTERRUPTED',
        status: 'fetching', // Was in-flight when user closed browser
        createdAt: 100,
        retryCount: 0
      }
    ]);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          ok: true,
          shortcode: 'INTERRUPTED',
          media: [{ type: 'image', url: 'https://picsum.photos/200', filename: 'recovered.jpg' }]
        })
    });

    render(<App />);

    // Hydration should normalize 'fetching' to 'queued' and then automatically resolve it
    await waitFor(() => {
      expect(screen.getByText(/Ready/)).toBeDefined();
    });
    expect(screen.getByText('INTERRUPTED')).toBeDefined();
  });

  it('Scenario: User cancels / removes a waiting job from queue', async () => {
    render(<App />);

    const pauseBtn = screen.getByText('⏸ Pause Queue');
    fireEvent.click(pauseBtn);

    const textarea = screen.getByPlaceholderText(/Paste your Instagram link/i);
    const addButton = screen.getByText('Fetch Media');

    fireEvent.change(textarea, {
      target: { value: 'https://www.instagram.com/p/TO_BE_REMOVED/' }
    });
    fireEvent.click(addButton);

    expect(screen.getByText('TO_BE_REMOVED')).toBeDefined();

    // Click remove button (✕)
    const removeBtn = screen.getByTitle('Remove from queue');
    fireEvent.click(removeBtn);

    expect(screen.queryByText('TO_BE_REMOVED')).toBeNull();
  });

  it('Scenario 15, 16: Backend failure produces graceful NETWORK_ERROR without crashing', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

    render(<App />);

    const textarea = screen.getByPlaceholderText(/Paste your Instagram link/i);
    const addButton = screen.getByText('Fetch Media');

    fireEvent.change(textarea, {
      target: { value: 'https://www.instagram.com/p/OFFLINE_TEST/' }
    });
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(screen.getByText(/Connection refused/)).toBeDefined();
    });
  });

  it('Scenario 17, 18: Core controls provide accessible semantic HTML elements', () => {
    render(<App />);

    const textarea = screen.getByRole('textbox');
    expect(textarea).toBeDefined();

    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(3);

    buttons.forEach((btn) => {
      expect(btn.textContent).toBeTruthy();
    });
  });

  it('Scenario 19: User clicks "+ Add another link" to insert newline in single textarea and submits valid links', async () => {
    render(<App />);

    // Verify exactly ONE textarea element exists in the document
    const textareas = screen.getAllByRole('textbox');
    expect(textareas.length).toBe(1);
    const textarea = textareas[0] as HTMLTextAreaElement;

    // Verify "+ Add another link" button exists
    const addAnotherLinkBtn = screen.getByText(/Add another link/i);
    expect(addAnotherLinkBtn).toBeDefined();

    // Type first URL
    fireEvent.change(textarea, { target: { value: 'https://www.instagram.com/p/FIRST_URL/' } });
    expect(textarea.value).toBe('https://www.instagram.com/p/FIRST_URL/');

    // Click "+ Add another link"
    fireEvent.click(addAnotherLinkBtn);
    expect(textarea.value).toBe('https://www.instagram.com/p/FIRST_URL/\n');

    // Type second URL with trailing empty lines
    fireEvent.change(textarea, {
      target: { value: 'https://www.instagram.com/p/FIRST_URL/\nhttps://www.instagram.com/reel/SECOND_URL/\n\n' }
    });

    // Still exactly ONE textarea element
    expect(screen.getAllByRole('textbox').length).toBe(1);

    // Fetch media (ignoring the trailing empty lines)
    const fetchBtn = screen.getByText('Fetch Media');
    fireEvent.click(fetchBtn);

    await waitFor(() => {
      expect(screen.getByText(/Added 2 URLs to queue/)).toBeDefined();
    });

    expect(screen.getByText('FIRST_URL')).toBeDefined();
    expect(screen.getByText('SECOND_URL')).toBeDefined();
  });

  it('Scenario: Rate limit error with retry delay propagates formatted message to UI', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: {
        get: (h: string) => (h.toLowerCase() === 'content-type' ? 'application/json' : null)
      },
      text: () =>
        Promise.resolve(
          JSON.stringify({
            ok: false,
            error: {
              code: 'RATE_LIMITED',
              message: 'Instagram is temporarily limiting requests. Please try again in 45 seconds.',
              retryAfterSeconds: 45
            }
          })
        ),
      json: () =>
        Promise.resolve({
          ok: false,
          error: {
            code: 'RATE_LIMITED',
            message: 'Instagram is temporarily limiting requests. Please try again in 45 seconds.',
            retryAfterSeconds: 45
          }
        })
    });

    render(<App />);

    const textarea = screen.getByPlaceholderText(/Paste your Instagram link/i);
    const addButton = screen.getByText('Fetch Media');

    fireEvent.change(textarea, {
      target: { value: 'https://www.instagram.com/p/RATE_LIMITED_POST/' }
    });
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(screen.getByText(/Temporarily Rate Limited/)).toBeDefined();
      expect(
        screen.getByText(/Instagram is temporarily limiting requests\. Please try again in 45 seconds\./)
      ).toBeDefined();
    });
  });
});
