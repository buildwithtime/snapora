# ARCHITECTURE DECISIONS

## 1. Options Evaluated

### Option A: Static Frontend (React + TypeScript + Vite) + Separate Backend API

- **Frontend**: React + TypeScript SPA built with Vite; deployable as a static bundle
- **Backend**: Lightweight Node.js (Express or Fastify) REST API handling URL validation, SSRF-safe proxy, and media resolution
- **Frontend hosting**: GitHub Pages (static bundle) or Cloudflare Pages / Vercel (static)
- **Backend hosting**: Render, Fly.io, Railway, or Vercel Serverless Functions
- **Database**: None required for MVP; queue + history in browser IndexedDB

### Option B: Full-Stack Next.js Application

- **Framework**: Next.js with API Routes (App Router)
- **Frontend and API**: Co-located in a single Next.js project
- **Hosting**: Vercel (native Next.js), Render, Fly.io
- **Queue**: Client-side state; server API routes for media resolution
- **Database**: None required for MVP

---

## 2. Requirement Mapping

| Requirement | Option A | Option B | Notes |
|---|---|---|---|
| Static GitHub Pages deploy | Yes (frontend only) | Partial (API Routes require serverless) | Option A more compatible |
| Backend API for SSRF-safe proxy | Yes (separate service) | Yes (API Routes) | Both support |
| No server-side data retention | Yes | Yes | Both comply |
| Queue in IndexedDB | Yes | Yes | Both comply |
| TypeScript throughout | Yes | Yes | Both comply |
| GitHub Actions CI | Yes | Yes | Both comply |
| Simple local development | Yes — `npm run dev` (Vite) + `node server` | Yes — `npm run dev` (Next.js) | Next.js slightly simpler to start |
| Mobile-first responsive | Yes | Yes | Both comply |
| Zero database dependency for MVP | Yes | Yes | Both comply |
| Operational simplicity | Medium (two deployable units) | High (one repo, one deploy) | Option B slightly simpler to deploy |
| Avoid unnecessary complexity | Yes (Vite is lightweight) | Partial (Next.js adds bundle complexity) | Option A leaner for a media utility |

---

## 3. Decision: **Option A — Recommended**

**Recommended architecture**: React + TypeScript frontend (Vite), with a separate lightweight Node.js backend API.

### Rationale

1. **GitHub Pages compatibility**: The Vite-built static frontend can be deployed to GitHub Pages without any server-side infrastructure on the CDN. This is the simplest open-source hosting path with zero ongoing cost.
2. **Separation of concerns**: The frontend manages the queue, state, and UI entirely. The backend is a thin, stateless SSRF-safe proxy. These have clearly different security profiles and can be deployed and scaled independently.
3. **Flexibility**: The backend can be deployed to any Node.js-compatible host (Render free tier, Fly.io, Railway, Vercel Serverless, Cloudflare Workers) without being tied to Next.js's deployment requirements.
4. **Security clarity**: The SSRF allowlist, rate limiting, timeout, and size limits live entirely in the backend. They are not mixed with frontend rendering concerns.
5. **Testability**: The backend API has a clean, typed contract that can be unit-tested with lightweight HTTP testing tools (supertest/vitest). The frontend queue logic is pure state machine logic, independently testable.
6. **Next.js is not needed**: Next.js is appropriate for server-rendered pages, complex routing, and SSR. Snapora is a client-side tool with a simple proxy backend — Next.js adds bundle overhead, hydration complexity, and deployment coupling without benefit.

### Trade-off Accepted

- Two deployable units instead of one. Mitigated by clear CI/CD and documented deployment instructions.

---

## 4. Frontend Architecture

### Stack
- **Framework**: React 18 with TypeScript
- **Build tool**: Vite 5
- **Styling**: Vanilla CSS with CSS custom properties (design tokens); no Tailwind or CSS-in-JS for MVP
- **State**: React context + useReducer for queue state machine
- **Persistence**: IndexedDB via `idb` library (lightweight wrapper)
- **Testing**: Vitest + @testing-library/react

### Design Principles
- Queue state is modeled as an explicit state machine with typed transitions
- No implicit global mutable state
- Provider abstraction: `IMediaProvider` interface with `MockProvider` and real provider implementations
- All UI components receive props; no direct IndexedDB access from components
- Accessibility: ARIA roles, keyboard navigation, WCAG AA contrast

### URL Validation (Client-Side)
```
allowedHostnames = ["instagram.com", "www.instagram.com", "instagr.am"]
allowedProtocol = "https:"
patterns:
  - /p/<shortcode>       → single post
  - /reel/<shortcode>    → Reel
  - /tv/<shortcode>      → IGTV
  - /<username>/p/...    → alternate post format
```

Client-side validation is defensive but not the security boundary. All validation is repeated server-side.

---

## 5. Backend Architecture

### Stack
- **Runtime**: Node.js 22
- **Framework**: Fastify (lightweight, TypeScript-native, fast)
- **Language**: TypeScript
- **Testing**: Vitest + supertest

### Responsibilities
The backend has exactly one job: receive a validated Instagram URL, resolve the public media endpoint(s), and return structured media metadata. It does **not**:
- Store any user data
- Cache media
- Authenticate with Instagram using any credential
- Accept non-allowlisted URLs

### Security Controls
```
Allowlist:
  domains: ["instagram.com", "www.instagram.com", "cdninstagram.com", "instagr.am"]
  protocol: "https"

Request limits:
  timeout: 10,000 ms
  maxResponseSize: 50 MB
  maxRedirects: 2 (each redirect target re-checked against allowlist)

Rate limiting:
  per-IP: 10 requests per minute (configurable via env var)

Error responses:
  never expose stack traces
  never expose internal URLs or implementation details
  classify errors: PRIVATE_ACCOUNT | UNSUPPORTED_URL | RATE_LIMITED | PROVIDER_ERROR | TIMEOUT | NETWORK_ERROR
```

### API Contract (MVP)

```
POST /api/resolve
Content-Type: application/json
Body: { "url": "https://www.instagram.com/p/<shortcode>/" }

Response 200:
{
  "ok": true,
  "media": [
    {
      "type": "image" | "video",
      "url": "https://cdn.instagram.com/...",
      "width": 1080,
      "height": 1080,
      "filename": "post_<shortcode>.jpg"
    }
  ]
}

Response 4xx/5xx:
{
  "ok": false,
  "error": {
    "code": "PRIVATE_ACCOUNT" | "UNSUPPORTED_URL" | "RATE_LIMITED" | "PROVIDER_ERROR" | "TIMEOUT" | "NETWORK_ERROR",
    "message": "Human-readable description"
  }
}
```

---

## 6. Provider Abstraction

```typescript
interface MediaItem {
  type: 'image' | 'video';
  url: string;
  width?: number;
  height?: number;
  filename: string;
}

interface ResolveResult {
  ok: boolean;
  media?: MediaItem[];
  error?: { code: ErrorCode; message: string };
}

interface IMediaProvider {
  resolve(url: string): Promise<ResolveResult>;
  canResolve(url: string): boolean;
}
```

**MockProvider**: Returns deterministic fixtures based on URL shortcode. Used in all automated tests.

**PublicInstagramProvider**: Attempts to resolve public post media. Actual feasibility and permitted implementation method must be verified before production use. If resolution is not feasible via a permitted method, this provider returns `PROVIDER_ERROR` and the limitation is clearly documented.

> ⚠️ **Important**: A real provider must not be implemented until its technical approach and compliance with applicable platform rules have been verified. Do not implement any provider that circumvents access controls, authentication, or rate-limit protections.

---

## 7. Queue State Machine

```
States:
  QUEUED → VALIDATING → FETCHING → DOWNLOADING → DONE
                    ↓         ↓           ↓
                  FAILED    FAILED      FAILED

Queue Controller States:
  IDLE | RUNNING | PAUSED | EMPTY

Transitions:
  IDLE + (jobs added) → RUNNING
  RUNNING + (pause) → PAUSED
  PAUSED + (resume) → RUNNING
  RUNNING + (job DONE or FAILED) → process next eligible job
  RUNNING + (no more jobs) → IDLE
  Any job FAILED → isolate; advance to next job
  
Concurrency: maximum 1 active job at all times (enforced by controller mutex)
```

---

## 8. Persistence Strategy

- **Queue state**: `idb` → `snapora_queue` store
- **History**: `idb` → `snapora_history` store
- **Schema versioning**: `idb` migration pattern
- **No server-side persistence**: Backend is stateless per-request
- **Storage limit**: Browser IndexedDB limit; handle quota errors gracefully

---

## 9. Deployment Architecture

```
User browser
  │
  ├─── Frontend (React SPA)
  │     GitHub Pages / Cloudflare Pages (static)
  │     Cost: $0
  │
  └─── API call to /api/resolve
        │
        Backend (Fastify, Node.js)
          Render free tier / Fly.io / Vercel Serverless
          Cost: $0 (free tier) for expected traffic
```

**CI/CD**: GitHub Actions
- On push to `main`: lint → type check → unit tests → build
- On pull request: same pipeline
- Deployment: triggered on `main` merge (GitHub Pages for frontend; separate workflow for backend)

---

## 10. Technology Versions (Pinned)

| Tool | Version | Reason |
|---|---|---|
| Node.js | 22.x LTS | Current LTS; matches dev environment |
| React | 18.x | Stable concurrent features; wide ecosystem |
| TypeScript | 5.x | Modern type system features |
| Vite | 5.x | Fast builds; native ESM; minimal config |
| Fastify | 4.x | Lightweight; TypeScript-native; fast |
| Vitest | 2.x | Vite-native test runner; fast |
| idb | 8.x | Lightweight IndexedDB wrapper |

---

## 11. Unresolved Questions Requiring Approval

1. **License**: Recommend MIT License. Awaiting approval before committing.
2. **Real Provider Method**: A compliant, technically feasible method for resolving public Instagram post media URLs must be verified before the `PublicInstagramProvider` is implemented. Current status: **UNVERIFIED**. MockProvider is sufficient for MVP build and testing.
3. **Backend Hosting**: Recommend Render free tier for MVP. Confirm before configuring deployment.
4. **Rate Limiting Values**: Default 10 req/min per IP. Adjust based on expected traffic before production.

---

*Last updated: 2026-10-28*
