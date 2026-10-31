# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.3.0] - 2026-10-31

### Added
- **Instagram Profile Discovery & Selective Downloading**:
  - Profile media discovery endpoint (`POST /api/profile/discover`) accepting public profile URLs or `@username` handles.
  - Interactive grid gallery rendering posts, Reels, and carousel albums with post counts, follower badges, and account biographies.
  - Media type filters for instant narrowing across Photos, Videos, and Carousels.
  - Batch selection toolbar supporting "Select All", "Select None", and "Invert" across multi-page cursor pagination.
  - Carousel Inspection Modal enabling slide-level previews and individual slide downloading or whole-album enqueuing.
- **Streaming Media Delivery Engine**:
  - Direct media stream proxying (`GET /api/download`) piping buffered validation chunks and remaining upstream byte stream exactly once without truncation.
  - Raised single-media stream payload ceiling to 150 MB (`MAX_RESPONSE_SIZE_BYTES = 157286400`) to support high-definition video Reels.
  - Client-side Blob URL lifecycle tracking (`blobLifecycle.ts`) ensuring Blob URLs remain valid during download and are cleanly revoked after trigger to prevent browser memory leaks.
- **Diagnostics & Error Resilience**:
  - Dedicated classification for Instagram unauthenticated SPA shells and login-wall challenges (`LOGIN_WALL_ENCOUNTERED` / HTTP 403) with actionable user guidance.
  - Automatic retry orchestration with signed URL refresh when encountering expired Meta CDN signatures (`EXPIRED_MEDIA_URL` / HTTP 410).
  - Defensive cursor pagination guarding against cyclic cursors and infinite loop conditions.
- **Security Hardening**:
  - Production CORS origin resolution strictly defaulting to canonical production domain (`https://snapora-1r3i.onrender.com`), rejecting wildcards (`*`) in production mode.
  - Canonical origin normalization using WHATWG URL parser, stripping paths, queries, fragments, credentials, and trailing slashes to prevent CORS mismatch.
  - Meta CDN hostname whitelist validation across `fbcdn.net`, `cdninstagram.com`, and related media distribution edge hostnames.
  - Genuine binary MIME magic-byte validation for MP4 (`ftyp` box) and WebM (`1A 45 DF A3` EBML header).
  - Full OPTIONS preflight verification with credentials and restricted `allowedHeaders`.

### Changed
- Standardized `MAX_PROFILE_ITEMS` to 500 discoverable posts per gallery session.
- Standardized `MAX_ZIP_ITEMS` to 50 media files per browser ZIP archive (and `MAX_ZIP_TOTAL_BYTES` to 500 MB) to protect client browser heap memory from out-of-memory crashes.
- Decoupled Profile Gallery ZIP exports from unrelated sequential queue jobs.
- Updated root, frontend, and backend packages to version `0.3.0`.

---

## [0.2.0] - 2026-10-30

### Added
- **Sequential Multi-URL Queue**:
  - Multi-line / comma-separated Instagram URL parser.
  - Concurrency-controlled queue state machine (concurrency = 1) with pause, resume, retry, and cancellation controls.
  - Browser-local IndexedDB persistence for queue jobs and download history.
- **Bulk ZIP Export Engine**:
  - In-browser archive packaging via JSZip with progress telemetry.
  - Collision-free filename generation (`username_shortcode_slide.ext`).
- **Defense-in-Depth Security**:
  - Socket-level DNS pre-flight SSRF protection blocking all private RFC1918 subnets, loopback, link-local, multicast, and cloud metadata (`169.254.169.254`) across IPv4 and IPv6.
  - Binary magic-byte validation for JPEG images (`FF D8 FF`).
  - Rate limiting sliding window on Fastify API proxy.

---

## [0.1.0-preview] - 2026-10-28

### Added
- Initial public preview release of Snapora.
- Single-post Instagram photo and reel resolution and downloading.
- Modular provider architecture (`IMediaProvider`) with `MockProvider` and official Meta `InstagramOEmbedProvider`.
- Decoupled architecture supporting unified Node.js deployment or static frontend CDN hosting.
- Fastify backend API proxy with URL allowlisting and security headers.
- React 19 + TypeScript + Vite frontend client.
