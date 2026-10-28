# REFERENCE ANALYSIS

## 1. SnapInsta — `https://snapinsta.to/en46`

### 1.1 Access Status

- `read_url_content`: HTTP 403 (Cloudflare anti-bot) — **access blocked**
- Browser subagent: Playwright driver unavailable — **access blocked**
- Secondary sources: Web search on review sites and mirror documentation — **DOCUMENTED** quality only

### 1.2 Product Type

| Attribute | Finding | Evidence | Confidence |
|---|---|---|---|
| Product category | Web-based Instagram media downloader | Secondary sources | DOCUMENTED / High |
| Deployment model | Server-side media extraction; web frontend | Secondary sources | DOCUMENTED / High |
| Account requirement | None — no Instagram login required | Secondary sources | DOCUMENTED / High |
| Cost | Free (ad-supported) | Secondary sources | DOCUMENTED / High |

### 1.3 User Workflow — DOCUMENTED

1. User opens SnapInsta in a browser
2. User copies an Instagram post/Reel/Story URL from the Instagram app
3. User pastes URL into a single text input field on the SnapInsta homepage
4. User clicks "Download"
5. Server processes the URL; returns preview thumbnails and download links within seconds
6. User clicks a download link to save the media file

**Steps to first download**: 4–5 (copy URL → paste → click Download → click file link)

### 1.4 Supported Content Types — DOCUMENTED

- Single photo posts
- Multi-photo carousel posts
- Feed videos
- Instagram Reels (watermark-free)
- IGTV videos
- Stories (where publicly accessible)

**Not supported**: Private accounts; content behind authentication walls

### 1.5 Interface Observations — INFERRED (secondary sources; direct inspection blocked)

- Prominent single-URL text input field on homepage
- One "Download" button
- Ad-heavy interface with pop-ups and display ads
- Result page shows preview thumbnails + file download links
- No queue, no multi-URL input, no batch processing
- No persistent download history
- No duplicate detection
- No pause/resume capability
- Error handling: UNKNOWN (could not observe)
- Accessibility: UNKNOWN (could not inspect)
- Mobile responsiveness: DOCUMENTED as functional (works in iOS Safari and Android Chrome)

### 1.6 Privacy — DOCUMENTED

- No Instagram password or login credentials collected
- No documented privacy policy reviewed (direct page access blocked)
- Operates on public URL basis — no authentication to Instagram required
- Known risk: clone/phishing sites exist that DO request credentials; users must verify domain

### 1.7 Security Signals — INFERRED

- Server-side Instagram media extraction; client receives pre-resolved URLs
- Cloudflare protection on the frontend (VERIFIED — HTTP 403 returned)
- Backend implementation unknown; cannot assess SSRF protection, rate limiting, or redirect handling
- Ad networks may embed tracking scripts (DOCUMENTED from secondary sources)

### 1.8 SEO — UNKNOWN

- Direct page access blocked; could not inspect `<title>`, meta description, heading hierarchy, or structured data

### 1.9 Limitations Relative to Snapora

- Single URL only — no batch or queue support
- No job status tracking
- No retry mechanism
- No duplicate detection
- Ad-heavy = poor UX
- No persistence of download history
- Error messages not observable
- No open-source code; not maintainable

---

## 2. 4K Stogram — `https://www.4kdownload.com/products/stogram-8`

### 2.1 Access Status

- `read_url_content`: Full success — HTML, JSON-LD structured data, all feature content extracted — **VERIFIED**

### 2.2 Product Identity — VERIFIED

| Attribute | Value | Source |
|---|---|---|
| Product name | 4K Stogram | JSON-LD `name` |
| Version | 4.9.0.4680 | JSON-LD `softwareVersion` |
| Type | Desktop application (MultimediaApplication) | JSON-LD `@type` |
| OS support | Windows 11, macOS 12+, Ubuntu 22.04 GNOME+ | JSON-LD `operatingSystem` |
| Developer | InterPromo GMBH | JSON-LD seller |
| Aggregate rating | 4.4/5 from 1,087 ratings | JSON-LD `aggregateRating` |
| Last modified | 2024-05-18 | JSON-LD `dateModified` |
| Base price | $0 (Starter tier) | JSON-LD offers |
| Category | Downloader / MultimediaApplication | JSON-LD |
| Download URL | `https://www.4kdownload.com/downloads/34#stogram` | HTML anchor |

### 2.3 Core Feature Set — VERIFIED (JSON-LD + HTML feature cards)

| Feature | Evidence Label | Source |
|---|---|---|
| Download by username | VERIFIED | JSON-LD featureList + HTML card |
| Download by hashtag | VERIFIED | JSON-LD featureList + HTML card |
| Download by location | VERIFIED | HTML feature card |
| Download private posts (accounts you follow) | VERIFIED | JSON-LD featureList + HTML card |
| Watermark-free Reels | VERIFIED | JSON-LD featureList + HTML card |
| Stories and Highlights | VERIFIED | JSON-LD featureList + HTML card |
| Auto-download new posts from subscriptions | VERIFIED | HTML feature card |
| Download saved and tagged posts | VERIFIED | HTML feature card |
| Save by date range | VERIFIED | HTML feature card |
| Anonymous Story viewing | VERIFIED | HTML feature card |
| Export/import subscriptions | VERIFIED | HTML feature card |
| Back up entire Instagram account | VERIFIED | HTML feature card |
| Subscribe to another user's feed view | VERIFIED | HTML feature card |
| Single-post download (photo, video, carousel, IGTV, Reels) | VERIFIED | HTML feature card |
| Caption and comment metadata in photo metadata | DOCUMENTED | HTML feature card |

### 2.4 Workflow — DOCUMENTED

1. User opens 4K Stogram desktop application
2. User types username, hashtag, or URL into the application's search/input field
3. Application fetches content list from Instagram (requires Instagram account for private content)
4. Content list displayed; user selects items or batch downloads all
5. Download queue processes items sequentially
6. Files saved to local filesystem in organized folders

**Subscription model**: Users can subscribe to accounts/hashtags; application auto-downloads new content on schedule.

### 2.5 Queue and Processing Behavior — DOCUMENTED + INFERRED

| Behavior | Label | Source |
|---|---|---|
| Internal download queue | DOCUMENTED | Product feature description |
| Batch processing via "Update All" | DOCUMENTED | Product help pages / community |
| Rate-limit induced failures (HTTP 429) | DOCUMENTED | Community forums (Reddit, Zendesk) |
| Session invalidation / forced logout on heavy queue | DOCUMENTED | Community forums |
| CAPTCHA/checkpoint triggers on aggressive queuing | DOCUMENTED | Community forums |
| Queue state loss on forced logout | DOCUMENTED | Community Reddit reports |
| Throttling / inter-request delays required | INFERRED | Pattern from community mitigation reports |
| Default depth caps on batch downloads | DOCUMENTED | 4kdownload.com help content |
| Exponential backoff recommended | INFERRED | General mitigation pattern |

### 2.6 Storage and Persistence — DOCUMENTED

- All media saved to local filesystem (confirmed: desktop app, local storage)
- Download history maintained locally in application database
- Export/import of subscription database
- Folder organization per account/hashtag/location
- Caption metadata embedded into photo files
- No server-side storage of user media

### 2.7 Account Requirements — VERIFIED (from product feature list)

- Instagram account required for: private account downloads, Stories, Highlights, saved/tagged posts
- No account needed for: public posts by username, hashtag, location (basic tier)
- Account credentials entered into desktop application directly — **significant privacy risk**

### 2.8 Privacy and Security — DOCUMENTED + INFERRED

| Concern | Label | Finding |
|---|---|---|
| Credential collection | DOCUMENTED | Instagram credentials entered into app for private content |
| Local-only processing | DOCUMENTED | Desktop app; all media stays local |
| No server-side storage | DOCUMENTED | All data local |
| Unofficial Instagram API use | INFERRED | Not a Meta Graph API partner |
| Risk of account suspension | DOCUMENTED | Community-reported checkpoint/challenge triggers |
| VirusTotal clean | DOCUMENTED | Product page links to VirusTotal scan |

### 2.9 SEO — VERIFIED

| Element | Value |
|---|---|
| Title tag | `4K Stogram | Download Instagram Stories, Photos, Reels, and Hashtags | 4K Download` |
| Meta description | `Free Instagram Downloader. Search, download or back up Instagram photos, videos, Stories and Reels. Follow your favorite accounts and hashtags...` |
| Canonical | `https://www.4kdownload.com/products/stogram-8` |
| hreflang | 13 language variants (en, de, fr, it, es, pt-br, nl, pl, zh-cn, zh-tw, ko, ja, ru) |
| OG image | 1200×630 product image |
| Twitter card | `summary` type |
| JSON-LD | Full `SoftwareApplication` schema with rating, pricing, OS support |
| Structured data | Sentry tracing visible in HTML (production monitoring active) |

### 2.10 Desktop vs. Web Applicability

| 4K Stogram Feature | Can be replicated in a web app? | Notes |
|---|---|---|
| URL/username input | Yes | Standard web form |
| Public post downloading | Yes (via server proxy) | Requires SSRF-safe backend |
| Private post downloading | No | Requires user credentials; not acceptable for Snapora |
| Stories/Highlights (own account) | No | Requires authenticated session |
| Subscription auto-download | Partially | Would require a persistent backend worker; out of MVP scope |
| Local filesystem save | No | Browser can only trigger file downloads |
| Folder organization on disk | No | Browser has no filesystem access |
| Date-range filtering | Later (P2) | Requires server-side pagination |
| Caption metadata embedding | No (web) | Would require server-side processing |
| Export/import subscriptions | Yes (JSON export) | Client-side, feasible |

---

*Last updated: 2026-10-28*
