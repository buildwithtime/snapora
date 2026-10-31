# Snapora ⚡

> **Discover and download accessible public Instagram media, with additional account-owned media discovery through authorized Meta integration.**
>
> 🌐 **Initial Public Deployment**: [https://snapora-1r3i.onrender.com/](https://snapora-1r3i.onrender.com/) (Hosted on Render)

[![CI](https://github.com/buildwithtime/snapora/actions/workflows/ci.yml/badge.svg)](https://github.com/buildwithtime/snapora/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)
[![Fastify](https://img.shields.io/badge/Fastify-4-black.svg)](https://fastify.dev/)

---

> [!IMPORTANT]
> **LEGAL DISCLAIMER & NON-AFFILIATION NOTICE**:
> Snapora is an independent open-source tool and is not affiliated with, authorized, maintained, sponsored, or endorsed by Instagram, Meta Platforms, Inc., or any of their affiliates or subsidiaries. All product and company names are trademarks™ or registered® trademarks of their respective holders. Use of them does not imply any affiliation with or endorsement by them.
>
> Snapora operates strictly under a **Zero-Credential** model. It does **not** bypass platform authentication, does not access private accounts without explicit authorization, and does not harvest session cookies. Users are responsible for complying with Instagram's Terms of Service and respecting the copyright and intellectual property rights of original media creators.

---

Snapora is an open-source, client-first media utility engineered for reliability, safety, and transparency. It provides an intuitive queue state machine capable of processing multiple public Instagram URLs sequentially, with IndexedDB persistence, SSRF-safe upstream resolution, and zero credential storage.

---

## ✨ Core Capabilities

- **Profile-Wide Media Discovery & Selective Downloading (v0.3.0)**:
  - Input any public Instagram profile URL (e.g. `instagram.com/creator/`) or `@username` handle.
  - Interactive grid gallery displaying posts, Reels, and carousel albums with post counts, follower badges, and bio.
  - Responsive multi-column layout with instant type filtering (`Photos`, `Videos`, `Carousels`).
  - Batch selection toolbar (`Select All`, `Select None`, `Invert`) that persists across multi-page cursor pagination.
  - Carousel inspection modal to preview and selectively download individual slides or queue complete albums.
  - Seamless integration with the core sequential download queue and bulk ZIP export engine.
  - Standardized memory limits: up to 500 posts discoverable per gallery session (`MAX_PROFILE_ITEMS = 500`) and up to 50 media files per browser ZIP archive (`MAX_ZIP_ITEMS = 50`, `MAX_ZIP_TOTAL_BYTES = 500 MB`) to prevent client tab heap exhaustion.
- **Sequential Multi-URL Queue**: Add multiple URLs at once (newline-separated or comma-delimited) and process them sequentially with pause, resume, retry, and cancellation controls.
- **Enhanced Instagram URL Support**: Robust normalization for `/p/`, `/reel/`, `/reels/`, `/tv/`, `m.instagram.com`, `instagr.am`, and direct Meta CDN URLs (`scontent*.cdninstagram.com`), stripping tracking parameters (`?igsh=...`, `?utm_source=...`) and hash fragments.
- **Formalized Provider Architecture (`IMediaProvider`)**:
  - `PublicWebMediaProvider` (`public` — Default): Resolves and streams supported public Instagram posts, Reels, and carousel slides directly without requiring API tokens.
  - `MockProvider` (`mock`): Offline deterministic simulated fixtures for unit testing, continuous integration, and standalone static demo deployments.
  - `InstagramOEmbedProvider` (`oembed`): Permitted official post embed frames, author metadata, and thumbnail previews via Meta Graph API v21.0.
  - `AuthorizedAccountMediaProvider` (`authorized`): Official Meta Business Login OAuth 2.0 integration for creator/business accounts to download their own original media and carousels.
  - `DirectMediaUrlProvider` (`direct`): Ingests verified Meta CDN URLs with SSRF DNS pre-flight checks and cryptographic token validation.
- **Genuine Binary Validation**: Validates file magic bytes (JPEG SOI `FF D8 FF`, MP4 `ftyp` box) and rejects disguised HTML/JSON error pages before marking downloads complete.
- **Carousel Album Traversal**: Structured `CarouselItem` model supporting multi-item previews and independent downloads.
- **Client-Side Persistence**: Queue state and job history persist in your browser's IndexedDB, keeping your data entirely local.
- **Standalone Demo Mode**: Can be deployed as a 100% static client on GitHub Pages without requiring a deployed backend server.
- **Privacy & Security First**:
  - **Zero Credential Collection**: No Instagram logins, sessions, or passwords needed or stored.
  - **SSRF Defenses**: Socket-level DNS pre-flight filtering blocking all private RFC1918 subnets, loopback, link-local, multicast, and cloud metadata (`169.254.169.254`) across IPv4 and IPv6.
  - **No User Tracking**: Stateless backend proxy; zero user database or persistent server telemetry.

---

## 🏗️ Architecture

Snapora uses a decoupled architecture designed for static deployment and stateless safety:

```
┌────────────────────────────────────────────────────────┐
│                   Snapora Frontend                     │
│  (React 19 + TypeScript + Vite + IndexedDB)            │
│  • Queue State Machine (Concurrency = 1)               │
│  • Client-side URL normalization & duplicate detection │
│  • Standalone Demo Resolver (Mock Provider)            │
│  • Clear Distinction: Live Preview vs. Media Download  │
└───────────────────────────┬────────────────────────────┘
                            │
                            │ Optional: HTTP POST /api/resolve
                            ▼
┌────────────────────────────────────────────────────────┐
│                   Snapora Backend                      │
│  (Node.js + Fastify + TypeScript)                      │
│  • Strict Hostname Allowlist Check (SSRF Shield)       │
│  • Embedded Credential & Non-Standard Port Rejection   │
│  • Rate Limiting & Timeout Controls                    │
│  • Modular Providers:                                  │
│    - InstagramOEmbedProvider (Official Meta API)       │
│    - MockProvider (Offline Simulated Fixtures)         │
└────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) >= 20.x
- npm >= 10.x

### Installation

```bash
git clone https://github.com/buildwithtime/snapora.git
cd snapora
npm install
```

### Running Locally

```bash
# Starts both frontend (:5173) and backend (:3001) concurrently
npm run dev
```

Visit [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🧪 Testing & Validation

```bash
# Run unit & integration tests across all workspaces
npm test

# Run TypeScript typechecks
npm run typecheck

# Build for production
npm run build
```

---

## 🚀 Production Deployment & Architecture

Snapora supports two production deployment architectures:

### Option A: Unified Single-Service Deployment (Recommended)
In this topology, a single Node.js instance serves both the Fastify backend API (`/api/*`, `/health`) and the compiled static frontend SPA from a single domain and port:

* **Zero CORS issues**: Frontend and API share the exact same origin.
* **Cost & resource efficiency**: Single server process, container, or web service.
* **Automatic Port Binding**: Automatically detects `PORT` provided by cloud platforms (Render, Railway, Fly.io, Heroku) and binds to `0.0.0.0`.

```bash
# Build both frontend and backend
npm run build

# Start the unified production server
npm start
```

### Option B: Decoupled Multi-Service Deployment
* **Frontend**: Deploy `frontend/dist` to a static CDN (Vercel, Cloudflare Pages, Netlify, AWS S3/CloudFront) with `VITE_API_BASE_URL=https://api.yourdomain.com`.
* **Backend**: Deploy `backend` to a Node.js web service (Render, Railway, Fly.io) with `CORS_ORIGIN=https://yourdomain.com`.

---

## ⚙️ Environment Variables

Copy `.env.example` to `.env` or configure these environment variables in your hosting provider's dashboard:

| Variable | Required | Default | Description |
| :--- | :---: | :---: | :--- |
| `PORT` | No | `3001` | TCP port assigned by the hosting environment (Render, Railway, etc. assign this automatically). |
| `HOST` | No | `0.0.0.0` | Host IP interface to bind to (`0.0.0.0` enables external container access). |
| `NODE_ENV` | No | `development` | Set to `production` in production to sanitize 500 error messages and optimize Fastify logging. |
| `DEFAULT_PROVIDER` | No | `public` | Media provider engine: `public` (anonymous web resolver), `mock` (offline fixtures), `oembed`, `authorized`, `direct`. |
| `CORS_ORIGIN` | No | `true` | Comma-separated allowed origins (e.g. `https://snapora-1r3i.onrender.com`). Leave unset in unified single-service deployments. |
| `RATE_LIMIT_MAX` | No | `30` | Maximum requests allowed per IP within the time window. |
| `RATE_LIMIT_WINDOW_MS` | No | `60000` | Rate limiting sliding window in milliseconds (default: 60s). |
| `RESOLVER_TIMEOUT_MS` | No | `10000` | Network request timeout for upstream post resolution. |
| `MAX_RESPONSE_SIZE_BYTES`| No | `157286400` | Maximum allowable media stream byte size (default: 150 MB). |
| `VITE_API_BASE_URL` | No | `""` | Frontend API base URL. Leave empty when frontend is served from the same server. |

---

## 🚢 Deploying to Compatible Hosting Platforms

### Deploying to Render (Web Service)

> **Live Deployment**: Snapora is actively deployed on Render at [https://snapora-1r3i.onrender.com/](https://snapora-1r3i.onrender.com/).

1. Fork or push the repository to GitHub.
2. In the [Render Dashboard](https://dashboard.render.com/), create a new **Web Service**.
3. Connect your repository.
4. Set the following settings:
   * **Runtime**: `Node`
   * **Build Command**: `npm run build`
   * **Start Command**: `npm start`
   * **Health Check Path**: `/health`
   > *Note: The repository's root `.npmrc` (`include=dev`) automatically ensures workspace `devDependencies` needed for TypeScript compilation and Vite bundling are installed during Render's build process, even when `NODE_ENV=production` is active.*
5. Under **Environment Variables**, add:
   * `NODE_ENV`: `production`
   * `DEFAULT_PROVIDER`: `public`
6. Click **Deploy Web Service**.

### Deploying to Railway
1. In the [Railway Dashboard](https://railway.app/), create a **New Project** and select **Deploy from GitHub repo**.
2. Railway will automatically detect the root `package.json`.
3. Set the variables:
   * `NODE_ENV=production`
   * `DEFAULT_PROVIDER=public`
4. The server will build via `npm run build` and launch via `npm start`.

### Deploying to a Linux VPS (Ubuntu/Debian via Systemd or PM2)
```bash
# Clone and build
git clone https://github.com/buildwithtime/snapora.git /var/www/snapora
cd /var/www/snapora
npm ci
npm run build

# Start with PM2
pm2 start "npm start" --name "snapora"
pm2 save
pm2 startup
```

---

## ⚠️ Known Limitations & Access Boundaries

* **No Claim of Universal Post Downloading**: Snapora does not claim or guarantee that every Instagram post can be downloaded anonymously. Instagram dynamically serves unauthenticated client shells or login walls for many posts, Reels, and profiles when queried without active session cookies.
* **Strict Respect for Private Profiles**: Snapora cannot and will not download posts, Reels, or stories from private Instagram accounts.
* **No Login Wall or Anti-Bot Circumvention**: Snapora strictly complies with platform boundaries. It does not rotate residential proxies, harvest session cookies, or bypass Instagram authentication challenges.
* **Authorized Meta Graph API Boundaries**: Connecting an authorized Meta access token strictly unlocks media belonging to the authenticated user's own managed creator or business account (`/me/media`). It does not grant access to arbitrary third-party Instagram accounts or private posts.
* **Ephemeral Instagram Stories**: Stories require active account sessions and are not supported by the public anonymous web resolver.
* **Upstream Rate Limiting**: Instagram may throttle unauthenticated requests from shared hosting or cloud IP addresses (HTTP 429). Snapora incorporates retry mechanisms and socket-level timeouts, but heavy bulk queues should be processed with reasonable pauses.
* **Meta oEmbed Preview Scope**: Meta's public oEmbed API supplies embed frames and thumbnail metadata, but does not provide direct raw downloadable media files.

---

## 🛠️ Operational Troubleshooting

* **HTTP 429 Too Many Requests**:
  * *Cause*: High frequency of requests from a shared server IP.
  * *Fix*: Wait 30–60 seconds before retrying, or configure an external proxy/egress IP pool.
* **HTTP 403 Forbidden / Login Wall**:
  * *Cause*: The requested post is from a private account, requires age-verification, or Instagram temporarily restricted anonymous web access for that URL.
  * *Fix*: Snapora does not harvest user cookies or bypass platform logins. Verify the link is publicly accessible in an Incognito browser window.
* **CORS Errors in Decoupled Deployments**:
  * *Cause*: Frontend domain is not listed in `CORS_ORIGIN`.
  * *Fix*: Set `CORS_ORIGIN=https://your-frontend-domain.com` (or comma-separated `CORS_PREVIEW_ORIGINS`) in backend environment settings. In production, CORS strictly defaults to `https://snapora-1r3i.onrender.com`. Alternatively, use Unified Single-Service Deployment to serve frontend and backend from the same origin.
* **Health Check Probes**:
  * Both `/health` and `/api/health` respond with HTTP 200 `{ "ok": true, "status": "healthy" }` and can be used directly for cloud load balancer and container liveness probes.

---

## 📁 Repository Structure

```
snapora/
├── backend/            # Fastify REST API proxy
│   ├── src/
│   │   ├── config/     # Environment & allowlist configuration
│   │   ├── providers/  # IMediaProvider implementations (Mock, Types)
│   │   ├── routes/     # Fastify API routes (/api/resolve, /api/health)
│   │   └── utils/      # SSRF filters, URL sanitizers, error codes
│   └── tsconfig.json
├── frontend/           # React + Vite application
│   ├── src/
│   │   ├── components/ # QueueBoard, UrlInput, JobCard, Controls
│   │   ├── context/    # QueueContext state machine & reducer
│   │   ├── types/      # QueueJob, Provider, and UI types
│   │   └── utils/      # URL validator, IndexedDB storage, mock resolver
│   └── vite.config.ts
├── docs/               # Architecture, Security, Roadmap & Audit Docs
│   ├── ARCHITECTURE_DECISIONS.md
│   ├── DEPLOYMENT_PLAN.md
│   ├── END_TO_END_TEST_PLAN.md
│   ├── MEDIA_PROVIDER_STATUS.md
│   ├── PRODUCTION_READINESS_AUDIT.md
│   ├── RELEASE_READINESS_REPORT.md
│   └── SECURITY_REVIEW.md
├── LICENSE             # MIT License
├── CONTRIBUTING.md     # Contributor Guidelines
├── SECURITY.md         # Vulnerability Disclosure Policy
└── README.md
```

---

## 🔒 Security & Disclosure

Please review [SECURITY.md](SECURITY.md) for vulnerability reporting guidelines and defense-in-depth specifications.

## 🤝 Contributing

Contributions are welcome! Please review [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## 📄 License

This project is licensed under the [MIT License](LICENSE).
