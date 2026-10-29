# REA Research: Snapora Architectural Recommendations & Implementation Plan

Based on empirical evidence gathered from the analysis of **4K Stogram**, **Snapinsta**, and **official Meta platform APIs**, this document presents a concrete, defensible architectural blueprint for evolving **Snapora** from a mock-driven prototype into a robust, legitimate, and secure media utility.

---

## 1. Cross-System Architectural Comparison Matrix

| Capability | 4K Stogram Evidence (`[VERIFIED]` / `[DOCUMENTED]`) | Snapinsta Evidence (`[VERIFIED]` / `[INFERRED]`) | Official Meta Support (`[DOCUMENTED]`) | Snapora Recommendation |
| :--- | :--- | :--- | :--- | :--- |
| **Input URL Ingestion** | Desktop GUI text box; supports usernames, `#hashtags`, location URLs, `/p/`, `/reel/`, `/tv/`. | Web form input; accepts `/p/`, `/reel/`, `/tv/`, `/stories/` shortlinks. | Graph API accepts media IDs; oEmbed accepts full public permalinks (`instagram.com/p/...`). | **Adopt robust URL parser**: Support canonical normalization for post, reel, and direct CDN URLs; validate against strict regex patterns. |
| **Anonymous Metadata Resolution** | Emulates unauthenticated Android mobile app or requires local account login; triggers mobile API endpoints. | Ingests via web backend through rotating proxy pool querying internal GraphQL endpoints. | Supported via **Instagram oEmbed** (`GET /v21.0/instagram_oembed`) with Facebook App token. | **Implement `InstagramOEmbedProvider`**: Provide authorized, legitimate post embed previews and metadata for arbitrary public links without scraping. |
| **Original High-Res Media Download** | Downloads directly from Meta CDN (`scontent.cdninstagram.com`) using session cookies from user login. | Delivers direct CDN links parsed by backend; user downloads directly from Meta edge. | Supported via **Instagram Graph API** (`/{ig-user-id}/media`) strictly for authenticated owner/creator accounts. | **Two-Tier Model**: <br>1. Allow direct download if user provides verified direct CDN media URL (`DirectMediaUrlProvider`).<br>2. Support full account downloads for owner accounts via `AuthorizedAccountMediaProvider`. |
| **Carousel / Album Traversal** | Iterates through `carousel_media` children array from mobile API responses. | Backend iterates child nodes and presents multiple download buttons in UI. | Graph API supports child enumeration via `/{ig-media-id}/children`. oEmbed returns thumbnail of first item only. | **Model `CarouselItem` array**: Support multi-slide inspection; if using oEmbed, explicitly inform user that only preview thumbnail is available. |
| **User Authentication Model** | Asks user for their real Instagram username & password; stores session cookies locally. | Zero user authentication required; shifts burden to backend scraping proxy pool. | OAuth 2.0 Authorization Code flow with Meta Business Login (`instagram_basic`). | **Zero Credential Scraping**: **NEVER** ask for or store Instagram usernames/passwords. Support official OAuth 2.0 for creator accounts only. |
| **Rate Limiting & Queueing** | Enforces sequential queue (`HttpDownloaderQueue: max active count 1 -> 1`) with exponential backoff. | Handled upstream by backend proxy farm; frontend is protected by Cloudflare WAF. | Enforces strict API rate limits (e.g., 200 calls/hour per user on Graph API). | **Maintain Snapora Sequential Queue**: Keep the existing 1-at-a-time download queue with jittered delays and SSRF-hardened egress. |
| **Anti-Bot / Checkpoint Resilience** | Vulnerable; frequently causes Instagram account checkpoints and temporary bans. | Hidden behind Cloudflare; heavily exposed to breakages whenever Meta changes internal HTML/JSON. | Fully resilient; contractually supported by Meta via official versioned APIs. | **Resilient by Design**: By relying on official oEmbed/Graph APIs and direct CDN ingestion, avoid fragile scraper breakage and account risk. |

---

## 2. Component Architecture Assessment

The following components are proposed for the Snapora production architecture:

### 2.1 `InstagramUrlParser` & `InstagramContentTypeDetector`
- **Responsibility**: Parse incoming raw user input, strip tracking parameters (`utm_*`, `igsh`, `igshid`), validate domains (`instagram.com`, `instagr.am`, `*.cdninstagram.com`), and determine the content type:
  - `POST` (`/p/{shortcode}/`)
  - `REEL` (`/reel/{shortcode}/` or `/tv/{shortcode}/`)
  - `STORY` (`/stories/{username}/{story_id}/`)
  - `DIRECT_CDN` (`scontent*.cdninstagram.com/...`)
  - `UNSUPPORTED`
- **Feasibility**: **Immediate (Phase 1)**. Can be implemented purely client-side or in the Fastify backend without any external dependencies.

### 2.2 `ProviderCapabilityRegistry` & `IMediaProvider`
- **Responsibility**: Define a unified interface for resolving metadata and media files:
  ```typescript
  export interface IMediaProvider {
    readonly id: string;
    readonly name: string;
    canResolve(url: ParsedInstagramUrl): boolean;
    resolve(url: ParsedInstagramUrl, options?: ResolveOptions): Promise<ResolutionResult>;
    getCapabilities(): ProviderCapabilities;
  }

  export interface ProviderCapabilities {
    canFetchPreview: boolean;
    canDownloadOriginal: boolean;
    supportsCarousels: boolean;
    requiresAuthentication: boolean;
  }
  ```
- **Feasibility**: **Immediate (Phase 1)**. Extends Snapora's existing `MockProvider` pattern into a multi-provider strategy pattern.

### 2.3 `InstagramOEmbedProvider`
- **Responsibility**: Resolve official preview metadata for arbitrary public Instagram URLs using Meta's official oEmbed endpoint:
  ```
  GET https://graph.facebook.com/v21.0/instagram_oembed?url={canonical_url}&access_token={app_id}|{app_secret}
  ```
- **Capabilities**:
  - `canFetchPreview`: `true`
  - `canDownloadOriginal`: `false` (Embed thumbnail only)
  - `requiresAuthentication`: `true` (Server-side Meta App token, invisible to user)
- **Feasibility**: **Credential-Gated (Phase 2)**. Requires a verified Meta Developer App.

### 2.4 `AuthorizedAccountMediaProvider`
- **Responsibility**: Enable content creators, businesses, and personal brand managers to backup and download their own high-resolution media, Reels, and carousels using official Instagram Graph API OAuth 2.0 tokens.
- **Capabilities**:
  - `canFetchPreview`: `true`
  - `canDownloadOriginal`: `true` (Uncapped original MP4/JPEG)
  - `supportsCarousels`: `true` (Full multi-item enumeration via `/{ig-media-id}/children`)
  - `requiresAuthentication`: `true` (User OAuth 2.0 token)
- **Feasibility**: **Credential-Gated (Phase 2)**.

### 2.5 `DirectMediaUrlProvider`
- **Responsibility**: Ingest verified, user-supplied direct CDN links (`scontent*.cdninstagram.com` with valid `oh` and `oe` cryptographic query tokens).
- **Security Safeguards**: Must be strictly validated against SSRF rules (resolve DNS to ensure target does not hit RFC 1918 private IP space, verify hostname matches Meta CDN domains, confirm HTTP `Content-Type: image/jpeg` or `video/mp4`).
- **Capabilities**:
  - `canFetchPreview`: `true`
  - `canDownloadOriginal`: `true`
  - `requiresAuthentication`: `false`
- **Feasibility**: **Immediate (Phase 1)**.

### 2.6 `MediaMetadata` & `CarouselItem` Data Models
- **Responsibility**: Standardized data structures that decouple UI rendering from underlying provider specifics:
  ```typescript
  export interface CarouselItem {
    id: string;
    index: number;
    mediaType: 'image' | 'video';
    previewUrl: string;
    downloadUrl?: string; // Present only if original download is supported
    width?: number;
    height?: number;
  }

  export interface MediaMetadata {
    id: string;
    shortcode: string;
    title?: string;
    authorName?: string;
    authorUrl?: string;
    sourceUrl: string;
    providerId: string;
    status: MediaResolutionStatus;
    items: CarouselItem[];
    resolvedAt: string;
  }
  ```

### 2.7 `DownloadManager` & `DownloadQueue`
- **Responsibility**: Orchestrate media fetching, enforce sequential execution (matching 4K Stogram's empirical 1-at-a-time rate safety), handle abort signals, display real-time download progress, and persist queue state in IndexedDB.
- **Feasibility**: **Already Implemented & Verified** in Snapora `apps/frontend/src/features/queue/` and backend download stream.

---

## 3. Clear UI State Taxonomy

To prevent user deception and uphold rigorous trust boundaries, the Snapora UI must never display a generic or ambiguous state. The user interface must distinctly represent these 7 states:

```
[DEMO / SIMULATED CONTENT]
  ├── Clearly badged: "Demo Mode (Mock Fixture)"
  └── No network calls made to Instagram or external hosts

[LIVE METADATA RETRIEVED]
  ├── Displays author name, caption, post date, thumbnail
  └── Badge: "Metadata Verified via Meta oEmbed"

[PREVIEW AVAILABLE ONLY]
  ├── Thumbnail / embed iframe displayed
  ├── Download button indicates: "Preview Only (Original download requires creator authorization)"
  └── Clear visual distinction preventing confusing thumbnail with original high-res media

[ORIGINAL MEDIA DOWNLOADABLE]
  ├── Verified direct stream available from CDN or Graph API
  ├── Primary Action: "Download Original Media (1080p JPEG / MP4)"
  └── Verified byte validation performed upon stream completion

[AUTHENTICATION REQUIRED]
  ├── Prompts user: "Connect Instagram Account via Meta OAuth to access your media"
  └── Strictly uses official OAuth popup; zero password entry fields

[UNSUPPORTED OR INACCESSIBLE]
  ├── Explains reason: Private Account / Expired Link / Invalid URL
  └── Suggests actionable alternatives (e.g. "Ensure post is public")

[PROVIDER TEMPORARILY UNAVAILABLE]
  ├── Displays network error or upstream Meta API rate limit / 429
  └── Offers automated backoff countdown with retry button
```

> **Mandatory Rule**: Never report a successful download in the UI unless the actual media bytes have been completely streamed, length-checked, and validated against MIME magic bytes.

---

## 4. Phased Implementation Roadmap

### Phase 1: URL Normalization, Direct CDN Support, and Multi-Provider Core (Immediate)
- **Scope**:
  - Implement `InstagramUrlParser` with robust unit tests across edge-case URLs (tracking tags, mobile URLs, Reels, carousels).
  - Implement `DirectMediaUrlProvider` with SSRF safeguards to download legitimate direct CDN files.
  - Implement `ProviderCapabilityRegistry` to allow clean switching between `MockProvider`, `DirectMediaUrlProvider`, and future API providers.
  - Update UI state machine to reflect `DEMO`, `PREVIEW_ONLY`, `DOWNLOADABLE`, and `UNSUPPORTED`.
- **Dependencies**: Zero external Meta credentials required.
- **Risk Profile**: Low. Fully self-contained.

### Phase 2: Official Meta Integrations (Credential-Gated)
- **Scope**:
  - Implement `InstagramOEmbedProvider` in `apps/backend/` using server-side App ID and App Secret.
  - Implement `AuthorizedAccountMediaProvider` supporting Meta Business Login OAuth 2.0 flow for content creators to download their own media and carousels.
  - Add credential management documentation in `docs/META_API_SETUP.md`.
- **Dependencies**: Requires registered Meta Developer App and App Review approval.
- **Risk Profile**: Low legal/operational risk; contractually compliant with Meta terms.

### Phase 3: Advanced Media Capabilities & Storage Optimization (Future Research)
- **Scope**:
  - Add audio track extraction using local WebAssembly FFmpeg (`@ffmpeg/ffmpeg`) for user-owned Reels.
  - Add batch ZIP archiving for multi-item carousel downloads.
  - Implement local media deduplication using perceptual hashing (pHash) against IndexedDB cache.
- **Dependencies**: Client-side WASM libraries.

### Explicitly Excluded Implementations (DO NOT BUILD)
1. **Password/Session-Cookie Scraper (The 4K Stogram Approach)**:
   - *Reason*: Requires users to input Instagram passwords into Snapora. Violates security best practices, exposes users to credential theft, and triggers automated Meta account checkpoint bans.
2. **Distributed Cloud Proxy Scraper (The Snapinsta Approach)**:
   - *Reason*: Highly fragile, economically unsustainable for an open-source project (requires expensive residential proxy infrastructure and CAPTCHA solvers), and violates Meta terms of service.
3. **Private Account Access Bypass**:
   - *Reason*: Bypassing privacy settings is a violation of user privacy and computer fraud laws.
