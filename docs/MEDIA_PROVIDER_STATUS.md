# MEDIA PROVIDER STATUS & OFFICIAL API ARCHITECTURE — SNAPORA

## 1. Universal Provider Ecosystem Overview

Snapora utilizes a universal, decoupled provider architecture (`UniversalPlatformRegistry`, `IMediaProvider`, `IPlatformDetector`, `ProviderCapabilities`) to support multi-platform media discovery, metadata extraction, and authorized asset management.

### Provider Status Matrix

| Platform | Milestone | Status | Supported Features | Features On Hold / Prohibited |
| :--- | :--- | :--- | :--- | :--- |
| **Instagram** | Baseline / M1 | **`ACTIVE`** (Production) | Posts (`/p/`), Reels (`/reel/`), Carousels, Profile Discovery, Rate-Limit Resilience | ⏸️ Profile-wide bulk ZIP download, infinite pagination |
| **YouTube** | Phase 2 – M2 | **`ACTIVE`** (Backend Merged, UI Implemented) | Video & Shorts metadata, multi-res thumbnails, embed player, JSON export, workspace history, user notes/tags | 🚫 Stream ripping, video download, DRM bypass, playlists/channels |
| **Pinterest** | Phase 2 – M3 | **`ACTIVE`** (Backend Core Implemented, UI Planned for M3c) | Public Pin metadata discovery, verified 236x thumbnail preview, standalone embed frame (`assets.pinterest.com`), SSRF-safe shortlink resolution (`pin.it`), 30-day retention | 🚫 Bulk image downloading, video downloading, stream ripping, private boards, auth bypass |
| **TikTok** | Phase 2 – M4 | **`PLANNED`** | Public video discovery, cover art, author metadata, official embed player | 🚫 Watermark removal, stream scraping |
| **Facebook** | Phase 2 – M5 | **`PLANNED`** | Public posts & Facebook Watch embeds via Graph API v21.0 | 🚫 Session scraping, private group bypass |
| **X (Twitter)** | Phase 2 – M6 | **`PLANNED`** | Tweet embeds, author attribution, public media attachments | 🚫 Firehose scraping, login wall bypass |

---

## 2. Active Provider Implementations: Instagram

Snapora implements a modular Instagram provider supporting two operational modes:

### A. Deterministic `MockProvider` (`backend/src/providers/mock.ts`)
* **Default Mode**: Used when `DEFAULT_PROVIDER=mock` or in client-side standalone Demo Mode (`VITE_DEMO_MODE=true`).
* **Purpose**: Provides offline, reproducible fixtures for development, UI validation, queue stress testing, and public demonstration.
* **Fixture Specifications**:
  * Shortcodes containing `private`: Classified as HTTP 403 `PRIVATE_ACCOUNT` / `CONTENT_PRIVATE`.
  * Shortcodes containing `error`: Classified as HTTP 502 `PROVIDER_ERROR`.
  * Shortcodes containing `video` or `reel`: Generates simulated MP4 video fixture.
  * Shortcodes containing `carousel` or `multi`: Generates multi-image carousel fixture.
  * Standard shortcodes: Generates single photo fixture.
* **Transparency Notice**: All media returned by MockProvider is clearly marked with `disclaimer: 'Simulated fixture generated for offline testing.'`

### B. Official `InstagramOEmbedProvider` (`backend/src/providers/oembed.ts`)
* **Live Mode**: Used when `DEFAULT_PROVIDER=oembed`.
* **Purpose**: Retrieves official public preview metadata, author handle, post title, iframe embed code, and thumbnail image directly from Meta's Graph API.
* **Backend Credentials**: Uses Meta App ID and Client Token (`INSTAGRAM_APP_ID`, `INSTAGRAM_CLIENT_TOKEN`) strictly on the backend. No credentials are ever exposed to the client.

### C. Preserved Instagram Scope (Zero Regressions Contract)
* **Single Posts**: `/p/{shortcode}/` image and video resolution.
* **Reels**: `/reel/{shortcode}/` and `/reels/{shortcode}/` resolution.
* **Carousels**: Multi-slide traversal, per-slide thumbnailing, and individual item downloads.
* **Profile Discovery**: Ingesting creator metadata, avatar preview, and post grid items.
* **Queue & Scheduler**: Concurrency=1 sequential execution, exponential backoff, and 429 Retry-After handling.

### D. Instagram Scope on Hold
* **Profile-wide bulk downloading**: Bulk ZIP packaging across full user profile grids is paused.
* **Profile pagination enhancements**: Multi-page cursor traversal is deferred to prioritize multi-platform breadth.

---

## 3. Meta Developer Setup Guide for Live Previews

To enable official live Instagram previews in Snapora:

1. **Create a Meta Developer Account**:
   * Visit [Meta for Developers](https://developers.facebook.com/).
   * Register or log in with your Meta account.
2. **Create a Meta App**:
   * Navigate to **My Apps** > **Create App**.
   * Select **Other** as the use case.
   * Choose app type **Business** or **Consumer**.
3. **Add the oEmbed Product**:
   * In your App Dashboard, search for **oEmbed** and click **Set Up**.
   * Enable the **oEmbed Read** feature.
   * *Note*: In Development Mode, the app can query public posts when called by App Administrators and Developers. For unrestricted public use, Meta requires App Review.
4. **Obtain Credentials**:
   * Navigate to **App Settings** > **Advanced**.
   * Copy the **App ID** and **Client Token**.
5. **Configure Backend Environment**:
   * In your backend `.env` file:
     ```env
     DEFAULT_PROVIDER=oembed
     INSTAGRAM_APP_ID=your_meta_app_id
     INSTAGRAM_CLIENT_TOKEN=your_meta_client_token
     ```
   * Alternatively, configure the direct token:
     ```env
     INSTAGRAM_OEMBED_ACCESS_TOKEN=your_meta_app_id|your_meta_client_token
     ```

---

## 4. Active Provider Implementations: YouTube (Milestone 2)

### A. Provider Decomposition
The active `YouTubeMediaProvider` is implemented as a unified provider facade orchestrating internal specialized services:
* `YouTubeUrlParser`: Handles `watch?v=`, `youtu.be/`, `/shorts/`, `/live/`, `/embed/`. Canonical 11-char ID validation.
* `YouTubeOEmbedClient`: Retrieves zero-auth titles, author names, thumbnail URLs, and official iframe HTML.
* `YouTubeDataApiClient`: Optional API key enrichment for descriptions, upload dates, durations, and high-fidelity metadata.
* `YouTubeThumbnailService`: Probes multi-resolution variants (`maxresdefault`, `sddefault`, `hqdefault`, `mqdefault`, `default`) with HTTP HEAD dimension validation.
* `YouTubeEmbedService`: Generates privacy-enhanced (`www.youtube-nocookie.com`) iframe embeds.

### B. YouTube Frontend Workspace (`frontend/src/features/youtube/`)
* `YouTubeWorkspace`: Main coordinating view with responsive layouts and history integration.
* `YouTubeUrlInput`: Live format detection, paste/clear/cancel actions, and validation error surfacing.
* `YouTubeVideoPreview`: Privacy-enhanced player respecting `allowed`, `disabled`, and `unknown` embedding states.
* `YouTubeMetadataCard`: Title, channel link, duration, 30-day retention countdown, JSON export, and user notes/tags editor.
* `YouTubeThumbnailGallery`: Responsive grid of verified and discovered thumbnails with direct CDN links.
* `YouTubeHistory`: Local workspace history with reopen, refresh, delete, and user tags retention.

### C. YouTube Compliance & Retention Guardrails
* **30-Day API Data Retention**: Non-authorized API data stored in IndexedDB and localStorage automatically expires or refreshes after 30 days. User-created workspace notes, tags, collections, and record identities are strictly preserved.
* **Strict Non-Circumvention**: No extraction of video streams (MP4/WebM) or audio files; direct CDN thumbnail access and JSON metadata export only.
* **Gated Fallback**: oEmbed fallback is restricted to approved error categories (e.g., quota exhaustion, key misconfiguration), never masking private or deleted content.
* **Testing Status**: 576 automated tests passing across workspaces (249 frontend + 327 backend).

---

## 5. Active Provider Implementations: Pinterest (Milestone 3b)

### A. Provider Decomposition
The active `PinterestMediaProvider` (`backend/src/providers/pinterest/`) is implemented using the universal provider architecture:
* `PinterestPlatformDetector`: Matches `pinterest.com`, `pin.it`, regional ccTLDs, and subdomains. Validates 16-22 digit numeric Pin IDs and rejects boards, profiles, feeds, and non-HTTPS protocols.
* `PinterestUrlParser`: Parses canonical Pin URLs and safely traverses `pin.it` shortlinks via 5-hop SSRF-validated HEAD requests.
* `PinterestOEmbedClient`: Interacts with official `https://www.pinterest.com/oembed.json` with 512KB response limit, 10-second timeout, Pin identity verification, and config disablement flag (`PINTEREST_OEMBED_ENABLED`).
* `PinterestEmbedService`: Generates canonical standalone embed frame (`https://assets.pinterest.com/ext/embed.html?id={pinId}&src=oembed`) requiring strict iframe sandbox `allow-scripts allow-same-origin allow-popups`.
* `PinterestThumbnailService`: Inspects 236x preview thumbnail (`i.pinimg.com`) via binary JPEG SOF markers and MIME type headers, falling back gracefully on failures.
* `PinterestMetadataNormalizer`: Unifies metadata with `embedStatus: 'unknown'`, 30-day lifecycle expiration dates, and strict non-circumvention markers (`downloadAvailable: false`, `downloadable: false`).

### B. Pinterest Compliance & Retention Guardrails
* **30-Day API Data Retention**: Third-party API data strictly expires within 30 days pursuant to Pinterest Developer Terms, while user workspace metadata (notes, tags, collections) remains permanently preserved.
* **Strict Non-Circumvention Policy**: Zero stream ripping, original video downloading, or bulk image downloading. Only verified preview thumbnails and metadata export are supported.
* **Network & SSRF Safeguards**: Whitelist strictly limits outbound connections to `www.pinterest.com`, `pinterest.com`, `pin.it`, `api.pinterest.com`, and `i.pinimg.com` / `s-media-cache-ak0.pinimg.com`.
* **Testing Status**: 89 dedicated unit and integration tests passing; 674 total tests across repository.

---

## 6. Separation of Preview vs. Media Downloading

Snapora enforces a strict architectural boundary between preview retrieval and file downloading across all platforms:

```
┌────────────────────────────────────────────────────────┐
│                   Input Media URL                      │
└──────────────────────────┬─────────────────────────────┘
                           │
                 [Platform Detection]
                           │
                 [URL Normalization]
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│               Official Live Preview Mode               │
│          (Official Platform APIs & oEmbed)             │
│                                                        │
│  ✓ Post / Content Author & Canonical URL               │
│  ✓ Caption Snippet & Full Metadata                     │
│  ✓ Official Embed Player / Iframe                      │
│  ✓ High-Resolution Thumbnails & Preview Images         │
│                                                        │
│  ✗ DRM-Protected Video Streams                         │
│  ✗ Third-Party Stream Ripping / Scraping               │
└────────────────────────────────────────────────────────┘
```

When a live preview is retrieved:
* `status` transitions to `preview_ready` (`live_preview_retrieved`).
* `downloadAvailable` reflects whether permitted direct media assets (e.g. thumbnails or authorized user media) exist.
* The UI renders an **Official Live Preview Card** with rich metadata and official embeds.
* **No misleading "Download Video" button is rendered for stream-protected platforms**.

---

## 7. Prohibited Pathways & Security Standards

To preserve open-source integrity, user security, and platform compliance:
1. **SSRF Hardening**: Download and preview proxy requests undergo pre-flight DNS resolution and IP allowlist validation, blocking private (RFC1918), loopback, link-local, and cloud metadata (`169.254.169.254`) addresses.
2. **No Credential Harvesting**: Snapora never collects, stores, or transmits user session cookies, platform passwords, or unauthorized session tokens.
3. **No DRM or Access Control Bypasses**: Snapora will never implement tools or methods designed to circumvent DRM, digital signatures, anti-bot mechanisms, or private account privacy walls.
4. **Transparent Demonstration Mode**: All simulated responses remain clearly marked with user-facing disclaimers and badges.

---

*Last updated: 2026-11-06 (Post-Milestone 1 Merge)*
