import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../App.js';

describe('Duplicate Profile Submission Prevention Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv('VITE_DEMO_MODE', 'false');
    localStorage.clear();
    sessionStorage.clear();
  });

  // 1. Rapid double-click results in one frontend submission
  it('1. Rapid double-click results in exactly one frontend submission', async () => {
    let discoverCalls = 0;
    let resolveMock: (val: any) => void;
    const pendingPromise = new Promise((resolve) => {
      resolveMock = resolve;
    });

    global.fetch = vi.fn().mockImplementation((input: any) => {
      const urlStr = String(input);
      if (urlStr.includes('/api/profile/discover')) {
        discoverCalls++;
        return pendingPromise;
      }
      return Promise.resolve({
        ok: false,
        status: 404,
        headers: { get: () => null },
        text: () => Promise.resolve('{}'),
        json: () => Promise.resolve({})
      });
    });

    render(<App />);

    const textarea = screen.getByPlaceholderText(/Paste your Instagram link/i);
    const fetchBtn = screen.getByText('Fetch Media');

    fireEvent.change(textarea, { target: { value: 'https://www.instagram.com/rapid_click_user/' } });

    // Double-click synchronously
    fireEvent.click(fetchBtn);
    fireEvent.click(fetchBtn);

    // Verify only 1 discover call was dispatched
    expect(discoverCalls).toBe(1);

    // Resolve the in-flight request
    resolveMock!({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      text: () =>
        Promise.resolve(
          JSON.stringify({
            ok: true,
            provider: 'public',
            profile: { username: 'rapid_click_user', fullName: 'Rapid User' },
            items: [],
            pagination: { hasMore: false }
          })
        ),
      json: () =>
        Promise.resolve({
          ok: true,
          provider: 'public',
          profile: { username: 'rapid_click_user', fullName: 'Rapid User' },
          items: [],
          pagination: { hasMore: false }
        })
    });

    await waitFor(() => {
      expect(screen.getByText('@rapid_click_user')).toBeDefined();
    });

    expect(discoverCalls).toBe(1);
  });

  // 2. Repeated Enter/Ctrl+Enter submissions are protected
  it('2. Repeated Enter/Ctrl+Enter submissions are protected by the synchronous lock', async () => {
    let discoverCalls = 0;
    let resolveMock: (val: any) => void;
    const pendingPromise = new Promise((resolve) => {
      resolveMock = resolve;
    });

    global.fetch = vi.fn().mockImplementation((input: any) => {
      const urlStr = String(input);
      if (urlStr.includes('/api/profile/discover')) {
        discoverCalls++;
        return pendingPromise;
      }
      return Promise.resolve({
        ok: false,
        status: 404,
        headers: { get: () => null },
        text: () => Promise.resolve('{}'),
        json: () => Promise.resolve({})
      });
    });

    render(<App />);

    const textarea = screen.getByPlaceholderText(/Paste your Instagram link/i);

    fireEvent.change(textarea, { target: { value: 'https://www.instagram.com/keyboard_user/' } });

    // Plain Enter: inserts newline, does not submit
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' });
    expect(discoverCalls).toBe(0);

    // Repeated Ctrl+Enter
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter', ctrlKey: true });
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter', ctrlKey: true });
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter', ctrlKey: true });

    // Only 1 submission should proceed
    expect(discoverCalls).toBe(1);

    resolveMock!({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      text: () =>
        Promise.resolve(
          JSON.stringify({
            ok: true,
            provider: 'public',
            profile: { username: 'keyboard_user' },
            items: [],
            pagination: { hasMore: false }
          })
        ),
      json: () =>
        Promise.resolve({
          ok: true,
          provider: 'public',
          profile: { username: 'keyboard_user' },
          items: [],
          pagination: { hasMore: false }
        })
    });

    await waitFor(() => {
      expect(screen.getByText('@keyboard_user')).toBeDefined();
    });
  });

  // 3. Button remains disabled while processing
  it('3. Button remains disabled while processing profile discovery', async () => {
    let resolveMock: (val: any) => void;
    const pendingPromise = new Promise((resolve) => {
      resolveMock = resolve;
    });

    global.fetch = vi.fn().mockImplementation((input: any) => {
      const urlStr = String(input);
      if (urlStr.includes('/api/profile/discover')) {
        return pendingPromise;
      }
      return Promise.resolve({
        ok: false,
        status: 404,
        headers: { get: () => null },
        text: () => Promise.resolve('{}'),
        json: () => Promise.resolve({})
      });
    });

    render(<App />);

    const textarea = screen.getByPlaceholderText(/Paste your Instagram link/i);
    const fetchBtn = screen.getByText('Fetch Media');

    fireEvent.change(textarea, { target: { value: 'https://www.instagram.com/in_flight_user/' } });
    expect((fetchBtn.closest('button') as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(fetchBtn);

    // While in-flight, the button must be disabled
    expect((fetchBtn.closest('button') as HTMLButtonElement).disabled).toBe(true);

    // Complete the request
    resolveMock!({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      text: () =>
        Promise.resolve(
          JSON.stringify({
            ok: true,
            provider: 'public',
            profile: { username: 'in_flight_user' },
            items: [],
            pagination: { hasMore: false }
          })
        ),
      json: () =>
        Promise.resolve({
          ok: true,
          provider: 'public',
          profile: { username: 'in_flight_user' },
          items: [],
          pagination: { hasMore: false }
        })
    });

    await waitFor(() => {
      expect(screen.getByText('@in_flight_user')).toBeDefined();
    });
  });

  // 4. Lock resets after success
  it('4. Lock resets after success, allowing subsequent submissions', async () => {
    let discoverCalls = 0;

    global.fetch = vi.fn().mockImplementation((input: any) => {
      const urlStr = String(input);
      if (urlStr.includes('/api/profile/discover')) {
        discoverCalls++;
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          text: () =>
            Promise.resolve(
              JSON.stringify({
                ok: true,
                provider: 'public',
                profile: { username: `user_${discoverCalls}` },
                items: [],
                pagination: { hasMore: false }
              })
            ),
          json: () =>
            Promise.resolve({
              ok: true,
              provider: 'public',
              profile: { username: `user_${discoverCalls}` },
              items: [],
              pagination: { hasMore: false }
            })
        });
      }
      return Promise.resolve({
        ok: false,
        status: 404,
        headers: { get: () => null },
        text: () => Promise.resolve('{}'),
        json: () => Promise.resolve({})
      });
    });

    render(<App />);

    const textarea = screen.getByPlaceholderText(/Paste your Instagram link/i);
    const fetchBtn = screen.getByText('Fetch Media');

    // First submission
    fireEvent.change(textarea, { target: { value: 'https://www.instagram.com/user_1/' } });
    fireEvent.click(fetchBtn);

    await waitFor(() => {
      expect(screen.getByText('@user_1')).toBeDefined();
    });
    expect(discoverCalls).toBe(1);

    // Second submission after success
    fireEvent.change(textarea, { target: { value: 'https://www.instagram.com/user_2/' } });
    expect((fetchBtn.closest('button') as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(fetchBtn);

    await waitFor(() => {
      expect(screen.getByText('@user_2')).toBeDefined();
    });
    expect(discoverCalls).toBe(2);
  });

  // 5. Lock resets after failure
  it('5. Lock resets after failure, allowing subsequent submissions', async () => {
    let discoverCalls = 0;

    global.fetch = vi.fn().mockImplementation((input: any) => {
      const urlStr = String(input);
      if (urlStr.includes('/api/profile/discover')) {
        discoverCalls++;
        if (discoverCalls === 1) {
          // First attempt fails with 502
          return Promise.resolve({
            ok: false,
            status: 502,
            headers: { get: () => 'application/json' },
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  ok: false,
                  provider: 'public',
                  error: { code: 'SERVER_UNAVAILABLE', message: 'Upstream server unavailable' }
                })
              ),
            json: () =>
              Promise.resolve({
                ok: false,
                provider: 'public',
                error: { code: 'SERVER_UNAVAILABLE', message: 'Upstream server unavailable' }
              })
          });
        }
        // Second attempt succeeds
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          text: () =>
            Promise.resolve(
              JSON.stringify({
                ok: true,
                provider: 'public',
                profile: { username: 'retry_user' },
                items: [],
                pagination: { hasMore: false }
              })
            ),
          json: () =>
            Promise.resolve({
              ok: true,
              provider: 'public',
              profile: { username: 'retry_user' },
              items: [],
              pagination: { hasMore: false }
            })
        });
      }
      return Promise.resolve({
        ok: false,
        status: 404,
        headers: { get: () => null },
        text: () => Promise.resolve('{}'),
        json: () => Promise.resolve({})
      });
    });

    render(<App />);

    const textarea = screen.getByPlaceholderText(/Paste your Instagram link/i);
    const fetchBtn = screen.getByText('Fetch Media');

    // First attempt -> fails
    fireEvent.change(textarea, { target: { value: 'https://www.instagram.com/fail_user/' } });
    fireEvent.click(fetchBtn);

    await waitFor(() => {
      expect(screen.getByText(/Profile Discovery Error/i)).toBeDefined();
    });
    expect(discoverCalls).toBe(1);

    // Lock must be released so user can retry or enter another profile
    fireEvent.change(textarea, { target: { value: 'https://www.instagram.com/retry_user/' } });
    expect((fetchBtn.closest('button') as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(fetchBtn);

    await waitFor(() => {
      expect(screen.getByText('@retry_user')).toBeDefined();
    });
    expect(discoverCalls).toBe(2);
  });
});
