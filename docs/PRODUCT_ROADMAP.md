# SNAPORA PRODUCT & DEVELOPMENT ROADMAP

**Product Vision**: **Snapora – Your Universal Media Workspace**
**Repository**: [buildwithtime/snapora](https://github.com/buildwithtime/snapora)
**Current Baseline**: `d7e78431292aa1f8df21c9ca2cbbcb0b9d65abd8` (Phase 2 – Milestone 2a Merged, M2b Branch Active)
**Production Service**: `https://snapora-1r3i.onrender.com/`

---

## 1. Guiding Principles & Product Philosophy

1. **Universal Workspace Philosophy**: Simple anonymous URL-based entry point for everyday users, layered over a powerful browser-based media discovery, organization, and download-management workspace.
2. **Multi-Platform Breadth First**: Prioritize broad multi-platform capability across Tier-1 web platforms before deepening niche single-platform automations.
3. **Compliance by Design**: Strictly integrate via official APIs, oEmbed protocols, and permitted embeds. Zero tolerance for stream ripping, DRM circumvention, session-cookie scraping, or anti-bot bypasses.
4. **Security & Privacy as Non-Negotiable P0**: Rigorous SSRF protection with DNS rebinding defenses, request isolation, strictly validated MIME types, and zero server-side retention of user media or browsing activity.
5. **Universal Provider Architecture**: Decoupled, modular platform detectors and provider implementations adhering to strict uniform contracts (`UniversalPlatformRegistry`, `IMediaProvider`, `IPlatformDetector`).
6. **Zero-Regression Mandate**: Existing, verified platform features (especially core Instagram post, reel, carousel resolution, and queue operations) must pass 100% of automated regression tests on every milestone.
7. **Transparent Governance**: Explicit state badges, clear error classification, separated feature branches and PRs, deterministic CI checks, and zero manual production modifications without approval.

---

## 2. Strategic Pivot & Phase 2 Direction

Following the successful stabilization of Phase 1 (resilient request scheduling, Web Locks cross-tab mutual exclusion with fail-closed safety, and rate-limit handling) and the completion of Phase 2 Milestone 1 (Provider & Type Abstraction), the engineering roadmap is formally updated:

> **Strategic Decision**: Expand Snapora into a multi-platform media workspace across YouTube, Pinterest, TikTok, Facebook, and X/Twitter before investing further engineering capacity into advanced Instagram profile downloading.

### A. Instagram Features on Hold (Temporarily Paused)
To allocate full development velocity to multi-platform expansion, the following Instagram-specific enhancements are temporarily deferred:
* ⏸️ **Profile-Wide Bulk Downloading**: Automatic bulk zip packaging across full user profile grids.
* ⏸️ **Profile Pagination Enhancements**: Multi-page cursor pagination and infinite feed crawling.
* ⏸️ **Advanced Profile Download Management**: Granular bulk-selection tools, selective filter queues, and batch status toggles.
* ⏸️ **Additional Profile-Specific Features**: Profile highlight extraction and story discovery.

### B. Instagram Core Functionality Preserved (Zero-Regression Contract)
The existing, hardened Instagram engine remains fully active, supported, and protected by automated regression suites:
* ✅ **Single Post Resolution**: Image and video resolution for `/p/{shortcode}/`.
* ✅ **Reel Resolution**: Full support for `/reel/{shortcode}/` and `/reels/{shortcode}/`.
* ✅ **Carousel Album Support**: Multi-item traversal, slide indexing, and independent asset downloads.
* ✅ **Profile Discovery**: Basic profile metadata, avatar preview, and post grid ingestion.
* ✅ **Sequential Queue Engine**: Concurrency=1 execution with request isolation, pause/resume, and retry controls.
* ✅ **Operational Resilience**: Adaptive exponential backoff, jitter, Retry-After header parsing, and 429 mitigation.
* ✅ **Cross-Tab & Storage Stability**: Web Locks API coordination with safe single-tab fallback, and schema-versioned IndexedDB persistence.

---

## 3. Updated Platform Priority Sequence

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                           PHASE 2 PLATFORM SEQUENCE                            │
├─────────────────┬─────────────────────────────────────────────────┬────────────┤
│ Priority        │ Milestone & Platform Focus                      │ Status     │
├─────────────────┼─────────────────────────────────────────────────┼────────────┤
│ Milestone 1     │ Universal Provider & Type Abstraction           │ ✅ Merged  │
│ Milestone 2 (1) │ YouTube – Metadata & Thumbnail Workspace        │ ✅ Merged  │
│ Milestone 3 (2) │ Pinterest – Public Pin Discovery & Workspace    │ 🟢 Implemented (M3a Feasibility, M3b Backend Core) │
│ Milestone 4 (3) │ TikTok – Public Discovery & Permitted Embeds    │ ⚪ Planned │
│ Milestone 5 (4) │ Facebook – Official API & Public Media Preview  │ ⚪ Planned │
│ Milestone 6 (5) │ X/Twitter – Official API & Embed Integrations   │ ⚪ Planned │
│ Milestone 7 (6) │ Instagram Profile-Wide Downloading              │ ⏸️ Deferred│
└─────────────────┴─────────────────────────────────────────────────┴────────────┘
```

---

## 4. Detailed Milestone Roadmap

### Phase 1: Foundation, Engine & Operational Resilience (Completed)

* **Milestone 0: Core Scaffolding & Fastify Proxy (v0.1.0-preview)**
  * Scaffolding: React + TypeScript + Vite frontend; Fastify + TypeScript backend; npm workspaces.
  * Initial sequential queue state machine (`QUEUED` → `VALIDATING` → `FETCHING` → `DOWNLOADING` → `DONE` / `FAILED`).
  * Basic SSRF validation, IndexedDB storage (`idb`), and deterministic `MockProvider`.
* **Milestone 1: Operational Resilience & Concurrency Hardening (v0.3.0, PR #17)**
  * Resilient backend request scheduler with token-bucket per-domain rate limiting and circuit breakers.
  * Strict Web Locks API cross-tab coordination with deterministic fail-closed fallback for shared operations.
  * Comprehensive test suite expanded to 417+ unit and integration tests.
  * Production deployment to Render verified on commit `57269373590b053f1908aa96adc3554377c01fe4`.

---

### Phase 2: Universal Media Workspace (Active)

#### Milestone 1: Universal Provider & Type Abstraction
* **Status**: ✅ **Completed & Merged** (PR #18 at commit `02fe82d334cf30f590e859e19315547c2d9f5783`)
* **Deliverables**:
  * Universal `PlatformId` union type (`instagram`, `youtube`, `pinterest`, `tiktok`, `facebook`, `twitter`, `generic`).
  * `UniversalPlatformRegistry` singleton managing decoupled platform detectors and provider factories.
  * Modular `IPlatformDetector` and unified `IMediaProvider` contracts.
  * Generalized `UnifiedMediaType` and extensible `ProviderCapabilities` flags.
  * Instagram provider adapted to new architecture without breaking existing client-server contracts.
  * Provider-aware download-host validation preserving complete SSRF security boundaries.
  * 419 automated tests passing (191 frontend, 228 backend) with clean CI runs on Node 22 and 24.

---

#### Milestone 2: YouTube – Metadata & Thumbnail Workspace
* **Status**: 🟢 **Implemented** (M2a Backend Core Merged in PR #19; M2b Frontend Workspace Complete on `feature/youtube-workspace-ui`)
* **Target Objective**: Introduce compliant YouTube video discovery, metadata extraction, multi-resolution thumbnail access, privacy-enhanced playback, and workspace organization.
* **Key Components**:
  1. `YouTubePlatformDetector`: Deterministic parsing of `youtube.com/watch?v=`, `youtu.be/`, `youtube.com/shorts/`, `youtube.com/live/`, and `youtube.com/embed/`. Rejects playlists and channel URLs.
  2. `YouTubeMediaProvider`: Unified backend facade orchestrating modular sub-services:
     * `YouTubeUrlParser`: Canonical 11-character video ID validation.
     * `YouTubeOEmbedClient`: Zero-auth metadata ingestion (title, author, thumbnail, iframe embed code).
     * `YouTubeDataApiClient`: Optional authenticated enrichment (description, tags, durations, views).
     * `YouTubeThumbnailService`: Multi-resolution thumbnail resolution (`maxresdefault`, `sddefault`, `hqdefault`, `mqdefault`, `default`) with HTTP HEAD dimension verification.
     * `YouTubeEmbedService`: Privacy-enhanced (`www.youtube-nocookie.com`) iframe generation.
  3. `YouTubeWorkspace` Frontend Suite (`frontend/src/features/youtube/`):
     * `YouTubeUrlInput`: Live format detection, auto-paste, clear, validation alerts, and cancellation.
     * `YouTubeVideoPreview`: Privacy-enhanced player respecting `allowed`, `disabled`, and `unknown` embedding states.
     * `YouTubeMetadataCard`: Title, channel link, duration, 30-day retention countdown, JSON export, and user notes/tags editor.
     * `YouTubeThumbnailGallery`: Responsive grid of verified and discovered thumbnails with direct CDN links.
     * `YouTubeHistory`: Local workspace history with reopen, refresh, delete, and retention status.
  4. **Data Retention & Expiration**: 30-day strict purge/refresh lifecycle for YouTube API-derived data in browser IndexedDB, honoring YouTube Developer Policies while preserving user notes and tags.
  5. **API Error Classification**: Granular taxonomy distinguishing `QUOTA_EXCEEDED`, `INVALID_API_KEY`, `VIDEO_NOT_FOUND`, `EMBEDDING_DISABLED`, and `TRANSIENT_FAILURE`.
  6. **SSRF Provider Configuration**: Whitelist `i.ytimg.com`, `img.youtube.com`, `www.youtube.com`, `youtube.com`.
  7. **Legal & Compliance Guardrail**: Direct thumbnail CDN links and metadata JSON export only; zero third-party video downloading or stream ripping.
  8. **Testing Status**: 576 automated tests passing (249 frontend + 327 backend) with clean CI runs on Node 22 and 24.

---

#### Milestone 3: Pinterest – Public Pin Discovery & Workspace
* **Status**: 🟢 **Implemented** (M3a Feasibility & Architecture Verified, M3b Backend Provider Core Implemented; M3c Frontend Workspace Planned)
* **Target Objective**: Add support for discovering public Pinterest pins, extracting verified preview thumbnails, providing secure standalone embed frames, and enforcing strict 30-day data retention and non-circumvention policies.
* **Key Components**:
  1. `PinterestPlatformDetector`: Match `pinterest.com/pin/*`, `pin.it/*`, `pinterest.<tld>/*`, and `*.pinterest.com/*`. Rejects boards, profiles, feeds, and invalid Pin IDs.
  2. `PinterestMediaProvider`: Modular backend facade implementing `IMediaProvider`:
     * `PinterestUrlParser`: Canonical 16-22 digit numeric Pin ID validation and SSRF-safe 5-hop shortlink traversal.
     * `PinterestOEmbedClient`: Official zero-auth `https://www.pinterest.com/oembed.json` endpoint with 512KB size limit, 10s timeout, config disablement, and Pin identity validation.
     * `PinterestEmbedService`: Privacy-enhanced standalone sandboxed embed frame (`https://assets.pinterest.com/ext/embed.html?id={pinId}&src=oembed`) with `allow-scripts allow-same-origin allow-popups`.
     * `PinterestThumbnailService`: 236x thumbnail verification via JPEG binary SOF markers and MIME type check with fail-soft fallback.
     * `PinterestMetadataNormalizer`: Standardized normalization with 30-day lifecycle retention timestamps and strict non-circumvention (`downloadAvailable: false`, `downloadable: false`).
  3. **Non-Circumvention Compliance**: Strict prohibition against bulk image downloading, video downloading, and stream ripping. Preview thumbnails and metadata export only.
  4. **SSRF Allowlist**: Whitelist `i.pinimg.com`, `assets.pinterest.com`, `pinterest.com`, `pin.it`. (Legacy `s-media-cache-ak0.pinimg.com` omitted to maintain tightest boundary).
  5. **Testing Status**: 674 automated tests passing (258 frontend + 416 backend) with 89 dedicated Pinterest provider tests.

---

#### Milestone 4: TikTok – Public Content Discovery & Permitted Integrations
* **Status**: ⚪ **Planned**
* **Target Objective**: Provide public TikTok video discovery, author metadata, cover art access, and official web player previews.
* **Key Components**:
  1. `TikTokPlatformDetector`: Match `tiktok.com/@*/video/*`, `vm.tiktok.com/*`, `vt.tiktok.com/*`.
  2. `TikTokMediaProvider`:
     * Official TikTok oEmbed API (`https://www.tiktok.com/oembed`) integration.
     * Author handle, post caption, cover thumbnail, and embed blockquote ingestion.
     * Official TikTok player embed rendering.
  3. **Compliance Guardrails**: Zero watermark stripping, no anti-bot reverse engineering, strict use of official embed endpoints.
  4. **SSRF Allowlist**: Whitelist `p16-sign*.tiktokcdn.com`, `*.byteoversea.com`, `www.tiktok.com`.

---

#### Milestone 5: Facebook – Official API & Public Media Integration
* **Status**: ⚪ **Planned**
* **Target Objective**: Ingest public Facebook posts and Facebook Watch videos via official Meta APIs.
* **Key Components**:
  1. `FacebookPlatformDetector`: Match `facebook.com/watch/*`, `fb.watch/*`, `facebook.com/*/posts/*`.
  2. `FacebookMediaProvider`:
     * Meta Graph API v21.0 oEmbed integration (`graph.facebook.com/v21.0/oembed_post`, `oembed_video`).
     * Official author, preview thumbnail, and embed iframe resolution.
  3. **Security & Credentials**: Reuses isolated backend Meta App credentials (`META_APP_ID`, `META_CLIENT_TOKEN`).
  4. **SSRF Allowlist**: Whitelist `*.fbcdn.net`, `facebook.com`.

---

#### Milestone 6: X (Twitter) – Official API & Embed Integrations
* **Status**: ⚪ **Planned**
* **Target Objective**: Ingest public posts from X/Twitter with official tweet embeds, author attribution, and attached media previews.
* **Key Components**:
  1. `TwitterPlatformDetector`: Match `twitter.com/*/status/*`, `x.com/*/status/*`.
  2. `TwitterMediaProvider`:
     * Official Twitter Publish oEmbed API (`publish.twitter.com/oembed`) integration.
     * Tweet text, author name, handle, profile link, and responsive embed HTML generation.
  3. **SSRF Allowlist**: Whitelist `pbs.twimg.com`, `ton.twitter.com`, `x.com`, `twitter.com`.

---

#### Milestone 7: Instagram Profile-Wide Downloading (Deferred / On Hold)
* **Status**: ⏸️ **Deferred**
* **Evaluation Criteria for Resumption**:
  * Milestones 2–6 successfully stabilized and merged to `main`.
  * Comprehensive review of Meta platform policies regarding large-volume pagination.
  * Evaluation of client-side zip performance and browser memory limits on datasets > 500 items.

---

## 5. Engineering Architecture & Governance Requirements

1. **Provider Isolation**:
   * Each platform implementation resides in its own isolated module under `backend/src/providers/<platform>/` and `frontend/src/providers/<platform>/`.
   * Platforms communicate solely through the unified interfaces defined in `backend/src/providers/types.ts` and `frontend/src/types/platform.ts`.
2. **SSRF Security Boundary**:
   * The backend remains the exclusive, hardened security perimeter.
   * `getAllowedDownloadHosts()` and `isAllowedDownloadHost()` dynamically query registered providers, while preserving strict anchored regex matching, socket-level IP validation (blocking RFC1918, loopback, link-local, cloud metadata), and redirect connection pinning.
3. **Branching & PR Discipline**:
   * All new milestone work branches directly from the latest verified `main`.
   * Pull Requests must maintain separate, atomic commits with thorough engineering review before merge.
   * Standard merge commits only — no rebasing or squashing of approved milestone history.
4. **CI & Quality Verification**:
   * Every milestone requires passing GitHub Actions CI on Node.js 22 and 24.
   * Zero lint errors, zero TypeScript errors (`tsc -b`), and zero regression failures across existing Instagram test suites.
5. **Production Operations**:
   * No manual modification of Render environment variables or build configurations without architectural sign-off.
   * Production deployments require an explicit baseline commit SHA and passing pre-flight checks.

---

*Document revised and approved: 2026-11-06 (Post-Milestone 1 Merge)*
