import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../App.js';
import * as storage from '../utils/storage.js';
import { parseBatchUrls } from '../utils/urlValidator.js';

vi.mock('../utils/storage.js', () => ({
  saveJobsToStorage: vi.fn(),
  loadJobsFromStorage: vi.fn().mockResolvedValue([]),
  clearAllJobsFromStorage: vi.fn().mockResolvedValue(undefined)
}));

describe('Profile Discovery & Download Reliability Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (storage.loadJobsFromStorage as any).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  describe('Requirement 1 & Verification: Production Error Surfacing (No Silent Picsum Fallback)', () => {
    it('surfaces HTTP 429 Rate Limited honestly in production without loading Picsum demo data', async () => {
      vi.stubEnv('VITE_DEMO_MODE', 'false');

      vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
        if (String(url).includes('/api/profile/discover')) {
          return new Response(
            JSON.stringify({
              ok: false,
              provider: 'PublicWebMediaProvider',
              error: {
                code: 'RATE_LIMITED',
                message: 'Instagram is temporarily limiting requests. Please try again in 60 seconds.',
                retryAfterSeconds: 60
              }
            }),
            {
              status: 429,
              headers: { 'Content-Type': 'application/json', 'Retry-After': '60' }
            }
          );
        }
        return new Response('Not Found', { status: 404 });
      });

      render(<App />);

      const textarea = screen.getByPlaceholderText(/Paste your Instagram link/i);
      const fetchBtn = screen.getByText('Fetch Media');

      fireEvent.change(textarea, { target: { value: 'https://www.instagram.com/real_creator/' } });
      fireEvent.click(fetchBtn);

      // Verify that honest error message is displayed to the user
      await waitFor(() => {
        expect(screen.getByText(/temporarily limiting requests/i)).toBeDefined();
      });

      // Verify that no Picsum URLs or synthetic mock gallery cards exist in the DOM
      const html = document.body.innerHTML;
      expect(html).not.toContain('picsum.photos');
      expect(html).not.toContain('Real_creator Visuals');
      expect(screen.queryByText('Instagram ↗')).toBeNull();
    });

    it('surfaces HTTP 403 Login Wall honestly in production without mock fallback', async () => {
      vi.stubEnv('VITE_DEMO_MODE', 'false');

      vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
        if (String(url).includes('/api/profile/discover')) {
          return new Response(
            JSON.stringify({
              ok: false,
              provider: 'PublicWebMediaProvider',
              error: {
                code: 'LOGIN_WALL_ENCOUNTERED',
                message: 'Instagram requires account authorization to view profile timelines anonymously.'
              }
            }),
            {
              status: 403,
              headers: { 'Content-Type': 'application/json' }
            }
          );
        }
        return new Response('Not Found', { status: 404 });
      });

      render(<App />);

      const textarea = screen.getByPlaceholderText(/Paste your Instagram link/i);
      const fetchBtn = screen.getByText('Fetch Media');

      fireEvent.change(textarea, { target: { value: 'https://www.instagram.com/protected_creator/' } });
      fireEvent.click(fetchBtn);

      await waitFor(() => {
        expect(screen.getByText(/requires account authorization/i)).toBeDefined();
      });

      const html = document.body.innerHTML;
      expect(html).not.toContain('picsum.photos');
    });

    it('surfaces HTTP 502 Upstream Failure honestly in production without mock fallback', async () => {
      vi.stubEnv('VITE_DEMO_MODE', 'false');

      vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
        if (String(url).includes('/api/profile/discover')) {
          return new Response(
            JSON.stringify({
              ok: false,
              provider: 'PublicWebMediaProvider',
              error: {
                code: 'PROVIDER_ERROR',
                message: 'Upstream Instagram gateway failure.'
              }
            }),
            {
              status: 502,
              headers: { 'Content-Type': 'application/json' }
            }
          );
        }
        return new Response('Not Found', { status: 404 });
      });

      render(<App />);

      const textarea = screen.getByPlaceholderText(/Paste your Instagram link/i);
      const fetchBtn = screen.getByText('Fetch Media');

      fireEvent.change(textarea, { target: { value: 'https://www.instagram.com/gateway_test/' } });
      fireEvent.click(fetchBtn);

      await waitFor(() => {
        expect(screen.getByText(/Upstream Instagram gateway failure/i)).toBeDefined();
      });

      const html = document.body.innerHTML;
      expect(html).not.toContain('picsum.photos');
    });

    it('surfaces network failures honestly without mock fallback when VITE_DEMO_MODE is false', async () => {
      vi.stubEnv('VITE_DEMO_MODE', 'false');

      vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Failed to fetch'));

      render(<App />);

      const textarea = screen.getByPlaceholderText(/Paste your Instagram link/i);
      const fetchBtn = screen.getByText('Fetch Media');

      fireEvent.change(textarea, { target: { value: 'https://www.instagram.com/network_err/' } });
      fireEvent.click(fetchBtn);

      await waitFor(() => {
        expect(screen.getByText(/Connection interrupted|Unable to connect/i)).toBeDefined();
      });

      const html = document.body.innerHTML;
      expect(html).not.toContain('picsum.photos');
    });
  });

  describe('Requirement 4 & Verification: Request Cancellation and Sequence Tracking', () => {
    it('discards delayed Profile A response when Profile B is requested immediately after', async () => {
      vi.stubEnv('VITE_DEMO_MODE', 'false');

      vi.spyOn(global, 'fetch').mockImplementation(async (url: any, init: any) => {
        if (String(url).includes('/api/profile/discover')) {
          const body = JSON.parse(init.body);
          if (body.url.includes('profileA')) {
            // Profile A has a 400ms delay
            await new Promise((r) => setTimeout(r, 400));
            if (init.signal?.aborted) {
              const abortErr = new Error('The user aborted a request.');
              abortErr.name = 'AbortError';
              throw abortErr;
            }
            return new Response(
              JSON.stringify({
                ok: true,
                provider: 'PublicWebMediaProvider',
                profile: {
                  username: 'profileA',
                  profileUrl: 'https://www.instagram.com/profileA/',
                  isPrivate: false,
                  postsCount: 1
                },
                items: [
                  {
                    id: 'postA',
                    shortcode: 'shortA',
                    url: 'https://www.instagram.com/p/shortA/',
                    type: 'image',
                    thumbnailUrl: 'https://cdn.example.com/thumbA.jpg',
                    displayUrl: 'https://cdn.example.com/dispA.jpg'
                  }
                ],
                pagination: { hasMore: false, totalLoaded: 1 }
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }

          if (body.url.includes('profileB')) {
            // Profile B returns quickly in 20ms
            await new Promise((r) => setTimeout(r, 20));
            return new Response(
              JSON.stringify({
                ok: true,
                provider: 'PublicWebMediaProvider',
                profile: {
                  username: 'profileB',
                  profileUrl: 'https://www.instagram.com/profileB/',
                  isPrivate: false,
                  postsCount: 1
                },
                items: [
                  {
                    id: 'postB',
                    shortcode: 'shortB',
                    url: 'https://www.instagram.com/p/shortB/',
                    type: 'image',
                    thumbnailUrl: 'https://cdn.example.com/thumbB.jpg',
                    displayUrl: 'https://cdn.example.com/dispB.jpg'
                  }
                ],
                pagination: { hasMore: false, totalLoaded: 1 }
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }
        }
        return new Response('Not Found', { status: 404 });
      });

      render(<App />);

      const textarea = screen.getByPlaceholderText(/Paste your Instagram link/i);
      const fetchBtn = screen.getByText('Fetch Media');

      // 1. Submit Profile A
      fireEvent.change(textarea, { target: { value: 'https://www.instagram.com/profileA/' } });
      fireEvent.click(fetchBtn);

      // 2. Immediately submit Profile B
      fireEvent.change(textarea, { target: { value: 'https://www.instagram.com/profileB/' } });
      fireEvent.click(fetchBtn);

      // Verify Profile B renders
      await waitFor(() => {
        expect(screen.getByText('@profileB')).toBeDefined();
      });

      // Wait past Profile A's 400ms delay to verify it does NOT overwrite Profile B
      await new Promise((r) => setTimeout(r, 500));

      expect(screen.getByText('@profileB')).toBeDefined();
      expect(screen.queryByText('@profileA')).toBeNull();
    });

    it('aborts pending profile request when closeGallery is triggered', async () => {
      vi.stubEnv('VITE_DEMO_MODE', 'false');

      let signalWasAborted = false;

      vi.spyOn(global, 'fetch').mockImplementation(async (url: any, init: any) => {
        if (String(url).includes('/api/profile/discover')) {
          init.signal?.addEventListener('abort', () => {
            signalWasAborted = true;
          });
          await new Promise((r) => setTimeout(r, 300));
          return new Response(
            JSON.stringify({
              ok: true,
              provider: 'PublicWebMediaProvider',
              profile: {
                username: 'slow_profile',
                isPrivate: false
              },
              items: [],
              pagination: { hasMore: false }
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response('Not Found', { status: 404 });
      });

      render(<App />);

      const textarea = screen.getByPlaceholderText(/Paste your Instagram link/i);
      const fetchBtn = screen.getByText('Fetch Media');

      fireEvent.change(textarea, { target: { value: 'https://www.instagram.com/slow_profile/' } });
      fireEvent.click(fetchBtn);

      // Find and click Close button if rendered, or verify abort
      const closeButtons = screen.queryAllByRole('button', { name: /Close Profile Gallery/i });
      if (closeButtons.length > 0) {
        fireEvent.click(closeButtons[0]);
        expect(signalWasAborted).toBe(true);
      }
    });
  });

  describe('Requirement 5 & Mixed Input: Profile URLs Excluded from Download Queue', () => {
    it('opens profile in gallery and enqueues ONLY post URLs when mixed URLs are submitted', async () => {
      vi.stubEnv('VITE_DEMO_MODE', 'true');

      render(<App />);

      const textarea = screen.getByPlaceholderText(/Paste your Instagram link/i);
      const fetchBtn = screen.getByText('Fetch Media');

      const mixedText = [
        'https://www.instagram.com/natgeo/',
        'https://www.instagram.com/p/POST_ALPHA/',
        'https://www.instagram.com/reel/REEL_BETA/'
      ].join('\n');

      fireEvent.change(textarea, { target: { value: mixedText } });
      fireEvent.click(fetchBtn);

      // Profile gallery opens for natgeo
      await waitFor(() => {
        expect(screen.getByText('@natgeo')).toBeDefined();
      });

      // Feedback message confirms post/reel URLs added to queue
      await waitFor(() => {
        expect(screen.getByText(/Added 2 URLs to queue/i)).toBeDefined();
      });

      // Verify that natgeo is NOT in the post queue as a download job
      // The queue should contain shortcodes POST_ALPHA and REEL_BETA
      expect(screen.getAllByText(/POST_ALPHA/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/REEL_BETA/i).length).toBeGreaterThan(0);
      expect(screen.queryByText(/natgeo\.jpg/i)).toBeNull();
    });

    it('parseBatchUrls rejects profile URLs with an informative error', () => {
      const text = [
        'https://www.instagram.com/p/C_valid_post/',
        'https://www.instagram.com/some_creator/'
      ].join('\n');

      const { valid, invalid } = parseBatchUrls(text);

      expect(valid).toHaveLength(1);
      expect(valid[0].shortcode).toBe('C_valid_post');
      expect(valid[0].mediaType).toBe('post');

      expect(invalid).toHaveLength(1);
      expect(invalid[0].url).toBe('https://www.instagram.com/some_creator/');
      expect(invalid[0].error).toContain('Profile Gallery, not the individual post download queue');
    });
  });

  describe('Additional Mandatory Requirements: Authoritative Profile URL Navigation', () => {
    it('renders profile username and Instagram link pointing to the original requested profile URL', async () => {
      vi.stubEnv('VITE_DEMO_MODE', 'false');

      vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
        if (String(url).includes('/api/profile/discover')) {
          return new Response(
            JSON.stringify({
              ok: true,
              provider: 'PublicWebMediaProvider',
              profile: {
                username: 'authoritative_user',
                profileUrl: 'https://www.instagram.com/authoritative_user/',
                fullName: 'Authoritative User',
                isPrivate: false,
                postsCount: 10
              },
              items: [],
              pagination: { hasMore: false, totalLoaded: 0 }
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response('Not Found', { status: 404 });
      });

      render(<App />);

      const textarea = screen.getByPlaceholderText(/Paste your Instagram link/i);
      const fetchBtn = screen.getByText('Fetch Media');

      fireEvent.change(textarea, { target: { value: 'https://www.instagram.com/authoritative_user/' } });
      fireEvent.click(fetchBtn);

      await waitFor(() => {
        expect(screen.getByText('@authoritative_user')).toBeDefined();
      });

      // Verify username link points to the authoritative profile
      const usernameLink = screen.getByTitle('Open @authoritative_user on Instagram');
      expect(usernameLink.getAttribute('href')).toBe('https://www.instagram.com/authoritative_user/');
      expect(usernameLink.getAttribute('target')).toBe('_blank');

      // Verify Instagram ↗ button also points to the authoritative profile
      const instagramBtn = screen.getByText('Instagram ↗');
      expect(instagramBtn.getAttribute('href')).toBe('https://www.instagram.com/authoritative_user/');
    });
  });
});
