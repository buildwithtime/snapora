# PRODUCT ROADMAP

## Guiding Principles

1. Research informs implementation — no feature is built before its feasibility is verified
2. Security and privacy requirements are always P0 — they cannot be deferred
3. The queue must be correct before UX polish is added
4. No real provider integration until compliance is verified
5. Open-source quality is a first-class requirement, not an afterthought

---

## Phase 0: Foundation (Current — Research Complete)

**Status**: ✅ Complete

| Deliverable | Status |
|---|---|
| Environment verified | ✅ Done |
| REA identified and capability-assessed | ✅ Done |
| SnapInsta analyzed (with documented limitations) | ✅ Done |
| 4K Stogram analyzed from official sources | ✅ Done |
| Competitive comparison matrix | ✅ Done |
| Product requirements defined | ✅ Done |
| Architecture selected (Option A: Vite + Fastify) | ✅ Done — awaiting approval |
| Seven research documents created | ✅ Done |

---

## Phase 1: Project Scaffold (P0)

**Goal**: Working local development environment with a passing CI pipeline and a running mock application.

**Prerequisites**: Architecture approval received.

| Task | Priority | Notes |
|---|---|---|
| Initialize Git repository with `.gitignore` and initial commit | P0 | |
| Scaffold frontend: `npm create vite@latest` → React + TypeScript | P0 | |
| Scaffold backend: Node.js + Fastify + TypeScript | P0 | |
| Set up Vitest in both packages | P0 | |
| Set up ESLint + Prettier with TypeScript rules | P0 | |
| Configure `tsconfig.json` for strict mode in both packages | P0 | |
| Write GitHub Actions CI workflow (lint + typecheck + test + build) | P0 | |
| Create `README.md`, `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md` | P0 | License requires approval |
| Create `.env.example` | P0 | |
| Confirm CI passes on an empty project | P0 | |

**Exit criterion**: `npm run dev` starts both frontend and backend; GitHub Actions CI passes.

---

## Phase 2: Core Data Model and Queue Engine (P0)

**Goal**: A correct, fully-tested queue state machine with IndexedDB persistence, operating on a MockProvider.

| Task | Priority | Notes |
|---|---|---|
| Define TypeScript types: `QueueJob`, `JobStatus`, `QueueState`, `QueueAction` | P0 | |
| Implement URL validator (client-side): hostname allowlist, protocol, pattern matching | P0 | |
| Implement duplicate detection | P0 | |
| Implement `IMediaProvider` interface | P0 | |
| Implement `MockProvider` with deterministic fixture responses | P0 | |
| Implement queue state machine (`useReducer` + typed actions) | P0 | |
| Implement queue controller: sequential processing, pause/resume, isolation | P0 | Concurrency=1 enforced |
| Implement IndexedDB persistence layer (`idb`) with schema versioning | P0 | |
| Implement queue hydration on app load from IndexedDB | P0 | |
| Write unit tests for: URL validation, duplicate detection, queue state machine, IndexedDB persistence | P0 | Minimum: 90% coverage of core logic |

**Exit criterion**: All unit tests pass; queue runs, pauses, resumes, and persists with MockProvider.

---

## Phase 3: Backend API (P0)

**Goal**: SSRF-safe Fastify backend with typed API contract, security controls, and full unit tests.

| Task | Priority | Notes |
|---|---|---|
| Implement `POST /api/resolve` endpoint | P0 | |
| Implement server-side URL allowlist validator | P0 | Mirrors client-side; is the actual security boundary |
| Implement SSRF prevention: allowlist check, protocol enforcement, redirect chain validation | P0 | |
| Implement request timeout (10s default) | P0 | |
| Implement response size cap (50MB default) | P0 | |
| Implement per-IP rate limiting (Fastify rate-limit plugin) | P0 | |
| Implement error classification and safe error responses | P0 | |
| Configure environment variables for all tunable values | P0 | |
| Write unit + integration tests: valid URLs, malformed URLs, non-allowlisted hostnames, HTTP (no HTTPS), redirect attacks, timeout simulation, rate limit | P0 | |
| Write integration test with `MockProvider` backend fixture | P0 | |

**Exit criterion**: All security tests pass; no stack traces in error responses; `SSRF_TEST_SUITE` passes.

---

## Phase 4: Frontend UI (P0 Core, P1 Polish)

**Goal**: Complete, functional, accessible queue UI connected to the backend.

| Task | Priority | Notes |
|---|---|---|
| Design system: CSS custom properties (color, spacing, typography tokens) | P0 | |
| URL input area: multiline textarea + single-line input | P0 | |
| Add-to-queue action with validation feedback | P0 | |
| Queue board: list all jobs with per-job status indicator | P0 | |
| Job counters (total / waiting / active / done / failed) | P0 | |
| Active job progress/spinner | P0 | |
| Per-job error messages (specific, actionable) | P0 | |
| Pause / Resume queue controls | P0 | |
| Retry failed job | P0 | |
| Remove waiting job | P0 | |
| Clear completed jobs | P0 | |
| Cancel active job (where provider supports) | P0 | |
| Download trigger (browser download for resolved media) | P0 | |
| Privacy disclosure text | P0 | |
| Responsive layout (mobile ≥ 360px) | P1 | |
| Dark mode (CSS `prefers-color-scheme`) | P1 | |
| Micro-animations (status transitions, queue item entry/exit) | P1 | |
| WCAG AA color contrast validation | P1 | |
| Keyboard navigation audit | P1 | |
| ARIA roles and labels audit | P1 | |
| History view (IndexedDB history) | P1 | |

**Exit criterion**: All P0 acceptance criteria from `PRODUCT_REQUIREMENTS.md` pass. Manual accessibility check passes.

---

## Phase 5: Real Provider Investigation (P1 — Gated)

**Goal**: Determine whether and how a compliant `PublicInstagramProvider` can be implemented.

> ⚠️ **This phase cannot begin until a technically feasible and policy-compliant method is identified and approved.**

| Task | Priority | Notes |
|---|---|---|
| Research public Instagram media resolution approaches that do not require credentials | P1 | Document findings |
| Evaluate compliance with applicable platform rules | P1 | Legal/policy review required |
| Evaluate technical feasibility and reliability | P1 | |
| Document findings; request approval before implementation | P1 | Do not implement without approval |
| If approved: implement `PublicInstagramProvider` with full test coverage | P1 | |
| If not feasible: document clearly in README and UI | P1 | MockProvider remains for demo |

**Exit criterion**: Either a compliant provider is implemented and tested, or the limitation is formally documented and clearly communicated in the UI.

---

## Phase 6: Open-Source Preparation (P0 — Parallel with Phase 4)

| Task | Priority | Notes |
|---|---|---|
| `README.md`: setup, development, deployment instructions | P0 | |
| `LICENSE`: MIT (pending approval) | P0 | |
| `CONTRIBUTING.md`: contribution process | P0 | |
| `CODE_OF_CONDUCT.md`: Contributor Covenant | P0 | |
| `SECURITY.md`: vulnerability reporting process | P0 | |
| GitHub issue templates: Bug Report, Feature Request | P0 | |
| Pull request template | P0 | |
| GitHub Actions: CI workflow | P0 | |
| GitHub Actions: Frontend deploy to GitHub Pages | P0 | Requires approval before enabling |
| GitHub Actions: Backend deploy (Render or equivalent) | P0 | Requires approval before enabling |
| No secrets in repository (audit) | P0 | |

---

## Phase 7: Testing and Quality Assurance (P0)

| Task | Priority | Notes |
|---|---|---|
| Unit tests: URL validation, queue state machine, duplicate detection, IndexedDB | P0 | Target: 90%+ coverage |
| Integration tests: queue with MockProvider end-to-end | P0 | |
| Security tests: SSRF suite, redirect chain, HTTP rejection, rate limit | P0 | |
| Accessibility manual audit | P1 | |
| Mobile layout manual audit | P1 | |
| Production build verification (`npm run build`) | P0 | |

---

## Phase 8: MVP Review (Gate)

The application enters review when all Phase 0–4 + Phase 6 exit criteria are met and all 20 MVP acceptance criteria from `PRODUCT_REQUIREMENTS.md` pass.

**Review outputs** (requiring approval before action):
- Repository creation on GitHub
- Code push and first release
- Frontend deployment to GitHub Pages
- Backend deployment to hosting provider
- Public announcement

---

## Feature Classification Summary

| Feature | Phase | Priority |
|---|---|---|
| Multiline URL input + queue | 2+4 | P0 |
| Per-URL validation + duplicate detection | 2 | P0 |
| Sequential queue with isolation | 2 | P0 |
| Pause / Resume / Retry / Remove | 4 | P0 |
| IndexedDB persistence | 2 | P0 |
| Per-job status + error messages | 4 | P0 |
| MockProvider | 2 | P0 |
| SSRF-safe backend | 3 | P0 |
| Rate limiting | 3 | P0 |
| GitHub Actions CI | 1 | P0 |
| Open-source files | 6 | P0 |
| Mobile responsive design | 4 | P1 |
| Dark mode | 4 | P1 |
| History view | 4 | P1 |
| WCAG AA accessibility | 4 | P1 |
| Real provider (compliant) | 5 | P1 — Gated |
| Export history | — | P2 |
| Named collections | — | P2 |
| i18n | — | P2 |
| Concurrent processing > 1 | — | P2 |

---

*Last updated: 2026-10-28*
