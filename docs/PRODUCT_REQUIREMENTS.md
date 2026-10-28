# PRODUCT REQUIREMENTS

## 1. Product Vision

**Snapora** is an open-source, privacy-first web application for downloading publicly accessible Instagram media via a managed, sequential download queue. It is designed for individual users who need to save multiple media items reliably, without advertisements, without requiring Instagram credentials, and without surrendering personal data.

**Tagline**: Save the moments that matter.

---

## 2. Core Constraints (Non-Negotiable)

These constraints override any feature request and may not be relaxed without explicit documented justification:

1. **No Instagram credentials**: The application must never ask for, store, or transmit Instagram passwords or session tokens.
2. **Public content only**: Only publicly accessible Instagram media may be attempted. Private accounts, authentication-gated content, and Stories requiring authentication are out of scope.
3. **No unauthorized circumvention**: The application must not bypass Cloudflare, anti-bot measures, private account restrictions, or any Instagram access control.
4. **Concurrency = 1 by default**: Only one download job may execute at a time by default.
5. **Failed job isolation**: A failed job must not prevent subsequent eligible jobs from running.
6. **No server-side user data retention**: The backend must not persistently store user URLs, job history, or downloaded media.
7. **SSRF prevention mandatory**: All outbound requests from the backend must be restricted to an explicit hostname allowlist (`instagram.com`, `cdninstagram.com`, `instagr.am`), HTTPS only, with timeout and size limits.
8. **Open source**: All source code must be published under an approved open-source license on GitHub.

---

## 3. User Stories

### Queue Management (P0)

| ID | Story |
|---|---|
| Q-01 | As a user, I can paste multiple Instagram URLs (one per line) into a text area and add them all to the queue with one action. |
| Q-02 | As a user, I can add individual URLs to the queue via a single-line input. |
| Q-03 | As a user, each URL I add is validated independently, and I see a clear error if it is malformed or unsupported. |
| Q-04 | As a user, duplicate URLs are detected before they enter the queue, and I am notified. |
| Q-05 | As a user, I can see all queued, active, completed, and failed jobs in a queue board. |
| Q-06 | As a user, jobs process sequentially (one at a time). The next eligible job starts automatically. |
| Q-07 | As a user, I can pause the queue and resume it without losing any jobs. |
| Q-08 | As a user, I can retry a failed job without duplicating any completed portion. |
| Q-09 | As a user, I can remove a waiting job from the queue before it starts. |
| Q-10 | As a user, I can clear all completed jobs from the queue view. |
| Q-11 | As a user, I can cancel the active job (where the provider supports cancellation). |
| Q-12 | As a user, the queue state is preserved across page refreshes via local storage (IndexedDB). |
| Q-13 | As a user, I can see job counters: total, waiting, active, completed, failed. |

### Media Retrieval (P0)

| ID | Story |
|---|---|
| R-01 | As a user, I can submit a public Instagram post URL and receive a download for its media. |
| R-02 | As a user, I receive a clear, specific error message if a URL points to a private account. |
| R-03 | As a user, I receive a clear error if a URL format is not supported. |
| R-04 | As a user, I am never prompted for my Instagram password. |
| R-05 | As a developer, a MockProvider supplies deterministic fixture responses so the queue can be tested without live Instagram access. |

### Status and Feedback (P0)

| ID | Story |
|---|---|
| S-01 | Each job displays one of: Queued, Validating, Fetching, Downloading, Done, Failed. |
| S-02 | Failed jobs display a specific, actionable error message (e.g., "Private account", "URL not recognized", "Request timed out"). |
| S-03 | The active job displays a loading/progress indicator. |
| S-04 | The interface updates state without requiring a page reload. |

### Security (P0)

| ID | Story |
|---|---|
| SEC-01 | The backend validates all input URLs against an explicit allowlist before making any outbound request. |
| SEC-02 | All outbound backend requests use HTTPS only. |
| SEC-03 | Redirect chains are validated: each redirect target must pass the allowlist check. |
| SEC-04 | Backend requests enforce a timeout (default: 10 seconds) and a response size cap. |
| SEC-05 | No secrets, credentials, or API keys are committed to the repository. |
| SEC-06 | The backend applies per-IP rate limiting. |
| SEC-07 | Error responses to the client never expose internal implementation details or stack traces. |

### Privacy (P0)

| ID | Story |
|---|---|
| P-01 | The application collects no personal data beyond what is technically necessary per session. |
| P-02 | No analytics, ad tracking, or third-party tracking scripts are embedded. |
| P-03 | Queue and history data is stored in the user's browser (IndexedDB) only, not on the server. |
| P-04 | A plain-language privacy disclosure is displayed in the application. |
| P-05 | Downloaded media is streamed or linked directly; it is not stored on the server after delivery. |

### Open-Source Quality (P0)

| ID | Story |
|---|---|
| OS-01 | The project has a README with setup, development, and deployment instructions. |
| OS-02 | A GitHub Actions workflow runs lint, type check, and unit tests on every push and pull request. |
| OS-03 | A `.env.example` documents all required environment variables with no actual secrets. |
| OS-04 | A `CONTRIBUTING.md` describes how to contribute. |
| OS-05 | A `SECURITY.md` describes how to report vulnerabilities. |
| OS-06 | A `CODE_OF_CONDUCT.md` is included. |
| OS-07 | An approved open-source `LICENSE` is included (pending approval). |

### UX and Accessibility (P1)

| ID | Story |
|---|---|
| UX-01 | The application is fully responsive and usable on mobile devices (≥ 360px wide). |
| UX-02 | All interactive controls are keyboard-accessible. |
| UX-03 | All images and icons have alt text or aria-label attributes. |
| UX-04 | Color contrast meets WCAG AA minimum (4.5:1 for body text). |
| UX-05 | Focus indicators are clearly visible. |
| UX-06 | The interface communicates queue state changes without requiring user polling. |

### History and Organization (P1)

| ID | Story |
|---|---|
| H-01 | Completed downloads are listed in a history view with URL, status, and timestamp. |
| H-02 | History persists across page refreshes via IndexedDB. |
| H-03 | The user can clear their local history. |

### Future (P2)

| ID | Story |
|---|---|
| F-01 | Export download history as JSON. |
| F-02 | Named collections of saved items. |
| F-03 | Configurable concurrent job count (>1). |
| F-04 | Multi-language support (i18n). |

---

## 4. Acceptance Criteria for MVP

The MVP is ready for review when ALL of the following pass:

| # | Criterion | Test Type |
|---|---|---|
| 1 | Application starts locally with `npm run dev` | Manual |
| 2 | User can paste multiple URLs and add all to queue | Manual + Integration test |
| 3 | Each URL is validated independently; errors reported individually | Unit test + Integration test |
| 4 | Duplicate URLs are rejected before entering queue | Unit test |
| 5 | Queue processes jobs sequentially (only one active at a time) | Unit test + Integration test |
| 6 | A failed job does not block subsequent eligible jobs | Unit test |
| 7 | Pause stops the queue; resume continues from next eligible job | Integration test |
| 8 | Retry re-runs only the failed job | Integration test |
| 9 | Queue state survives page refresh (IndexedDB) | Integration test |
| 10 | Malformed URLs are rejected with a specific error message | Unit test |
| 11 | Private account URLs produce a specific error message | Integration test with MockProvider |
| 12 | Unsupported URL formats produce a specific error message | Unit test |
| 13 | Backend rejects non-allowlisted hostnames (SSRF test) | Security unit test |
| 14 | Backend rejects HTTP (non-HTTPS) URLs | Security unit test |
| 15 | Backend enforces request timeout | Unit test |
| 16 | No Instagram credentials are accepted or transmitted | Code review + unit test |
| 17 | GitHub Actions CI runs lint, type check, and unit tests | CI pipeline |
| 18 | Frontend builds successfully for static deployment | `npm run build` |
| 19 | All interactive controls are keyboard-accessible | Manual accessibility check |
| 20 | Application is usable on a 390px-wide mobile viewport | Manual |

---

## 5. Out of Scope for MVP

- Private account access
- Stories and Highlights download
- Hashtag or location-based batch download
- Auto-download subscriptions
- Server-side media storage
- User accounts or login
- Payment or subscription tiers
- EXIF/caption metadata embedding
- Concurrent processing (concurrency > 1)
- i18n / multi-language

---

*Last updated: 2026-10-28*
