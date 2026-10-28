# COMPETITIVE COMPARISON

## Evidence Classification Key

- `VERIFIED`: Directly observed via source code, structured data, or reproducible tool output
- `DOCUMENTED`: Stated in official public sources, not independently confirmed by live interaction
- `INFERRED`: Reasonable technical hypothesis
- `UNKNOWN`: Insufficient evidence

---

## Comparison Matrix

### Product Type and Deployment

| Category | SnapInsta | 4K Stogram | Snapora Opportunity |
|---|---|---|---|
| Type | Web app, ad-supported | Desktop app, freemium | Web app, open-source, ad-free |
| Evidence | DOCUMENTED | VERIFIED (JSON-LD) | Decision |
| Deployment | Server-side media extraction | Local installation | Static frontend + SSRF-safe backend |
| Account requirement | None | Optional for public; required for private | None required |
| Cost to user | Free (ad-supported) | Free Starter; paid tiers | Free, open-source |
| Open source | No | No | Yes (GitHub) |
| Confidence | High | High | Design decision |

### Primary Workflow

| Category | SnapInsta | 4K Stogram | Snapora Target |
|---|---|---|---|
| Input method | Single URL text field | Username / hashtag / URL search | Multiline URL textarea (batch) |
| Evidence | DOCUMENTED | DOCUMENTED | Improvement |
| Steps to first result | ~4 | ~3 (desktop) | ~3 (paste → add to queue → start) |
| Batch input | No | Yes (bulk subscribe) | Yes — multiline paste |
| Confidence | Medium | High | Design requirement |
| Snapora priority | P0 — multiline batch input is mandatory |

### URL Handling and Validation

| Category | SnapInsta | 4K Stogram | Snapora Target |
|---|---|---|---|
| Supported URL formats | instagram.com post, Reel, Story URLs | Username, hashtag, location, post URL | instagram.com HTTPS URLs with allowlist |
| Evidence | DOCUMENTED | VERIFIED | Design decision |
| Client-side validation | UNKNOWN | INFERRED (app-side) | Yes — per-URL, with clear error messages |
| Duplicate detection | UNKNOWN | UNKNOWN | Yes — prevent duplicate queue entries |
| Private URL handling | Silently fails (INFERRED) | Documented as supported (with account) | Report clear error; no bypass |
| SSRF prevention | UNKNOWN (backend) | N/A (desktop) | Yes — explicit hostname allowlist |
| Confidence | Low-Medium | Medium | Design requirement |

### Multiple-Item Processing

| Category | SnapInsta | 4K Stogram | Snapora Target |
|---|---|---|---|
| Multi-URL support | No | Yes (subscriptions + batch) | Yes — multiline paste + add individually |
| Evidence | DOCUMENTED | DOCUMENTED | Requirement |
| Queue visibility | None | INFERRED (progress shown) | Full queue board with per-job status |
| Processing order | N/A | DOCUMENTED sequential | Sequential, one job at a time by default |
| Concurrent processing | N/A | INFERRED (possibly concurrent) | Concurrency = 1 (default, mandatory) |
| Confidence | Medium | Medium | Design requirement |

### Queue Management

| Category | SnapInsta | 4K Stogram | Snapora Target |
|---|---|---|---|
| Queue existence | None | Yes — internal queue | Yes — explicit, user-visible |
| Pause/resume | None | UNKNOWN | Yes — mandatory |
| Cancel active job | None | UNKNOWN | Yes — where supported |
| Remove waiting job | None | UNKNOWN | Yes |
| Retry failed job | None | INFERRED (manual re-trigger) | Yes — per-job retry |
| Clear completed | None | UNKNOWN | Yes |
| Persist across refresh | None | Yes (desktop persistent) | Yes — IndexedDB |
| Race condition prevention | N/A | UNKNOWN | Yes — mutex/lock mechanism |
| Evidence | DOCUMENTED (absence) | INFERRED | Design requirements |
| Confidence | High (absence) | Low | — |

### Status Visibility

| Category | SnapInsta | 4K Stogram | Snapora Target |
|---|---|---|---|
| Per-job status | None | INFERRED (progress bar) | Explicit per-job states: Queued, Validating, Fetching, Downloading, Done, Failed |
| Error messages | UNKNOWN | DOCUMENTED (rate-limit errors reported) | Specific, actionable error messages per job |
| Loading feedback | UNKNOWN | INFERRED | Spinner + progress indication |
| Job counters | None | INFERRED | Total / Active / Done / Failed counters |
| Evidence | UNKNOWN / DOCUMENTED | INFERRED | Design requirement |
| Confidence | Low | Medium | — |

### Error Recovery

| Category | SnapInsta | 4K Stogram | Snapora Target |
|---|---|---|---|
| Failed job isolation | N/A | DOCUMENTED: queue state lost on auth failure | Mandatory — one failure must not stop the queue |
| Retry mechanism | None | INFERRED (manual) | Automatic retry with backoff; manual retry button |
| State recovery | None | DOCUMENTED: state lost on Instagram auth | IndexedDB persistence; recover on refresh |
| Rate limit handling | UNKNOWN | DOCUMENTED (HTTP 429 breaks queue) | Classify errors; apply backoff; report to user |
| Evidence | UNKNOWN | DOCUMENTED | Design requirement |
| Confidence | Low | High (community-confirmed) | — |

### Media Organization

| Category | SnapInsta | 4K Stogram | Snapora Target |
|---|---|---|---|
| Local file organization | None (browser downloads) | Yes — folder per account | Not in MVP (browser-triggered download) |
| Download history | None | Yes (local DB) | Yes — IndexedDB history with status |
| Collections | None | Yes (subscriptions) | P2 — saved collections |
| Export | None | Yes (subscription export) | P2 — history export (JSON) |
| Evidence | DOCUMENTED | VERIFIED | Roadmap |

### Persistence

| Category | SnapInsta | 4K Stogram | Snapora Target |
|---|---|---|---|
| Queue persistence | None | Yes (desktop DB) | Yes — IndexedDB; survives page refresh |
| History persistence | None | Yes (local DB) | Yes — IndexedDB; local only |
| Server-side retention | UNKNOWN | None (local only) | None — no server-side user data |
| Evidence | DOCUMENTED | DOCUMENTED | Design requirement |

### Mobile Usability

| Category | SnapInsta | 4K Stogram | Snapora Target |
|---|---|---|---|
| Mobile support | DOCUMENTED (iOS Safari, Android Chrome) | Desktop only | Fully responsive — mobile-first design |
| Touch-friendly controls | DOCUMENTED | N/A | Yes — large tap targets |
| Evidence | DOCUMENTED | VERIFIED (desktop-only OS list) | Design requirement |

### Privacy

| Category | SnapInsta | 4K Stogram | Snapora Target |
|---|---|---|---|
| Credential collection | No (DOCUMENTED) | Yes (for private/auth features) | Never — no Instagram credentials |
| Server-side data retention | UNKNOWN | None (local only) | Minimal — queue metadata not persisted server-side |
| Ad tracking | DOCUMENTED (ad-heavy) | None (desktop) | None — no ads, no tracking |
| Privacy policy | UNKNOWN (access blocked) | Not inspected | Required — clear privacy disclosure |
| Evidence | DOCUMENTED / UNKNOWN | DOCUMENTED | Design requirement |

### Security

| Category | SnapInsta | 4K Stogram | Snapora Target |
|---|---|---|---|
| SSRF prevention | UNKNOWN | N/A (desktop) | Yes — explicit hostname allowlist + HTTPS |
| URL validation | UNKNOWN | INFERRED (app-side) | Strict — regex + protocol + allowlist |
| Redirect following | UNKNOWN | N/A | Controlled — max 2 redirects; allowlist enforced |
| Request timeouts | UNKNOWN | N/A | Yes — 10s per request |
| Response size limits | UNKNOWN | N/A | Yes — configurable cap |
| Rate limiting | UNKNOWN | DOCUMENTED (hits Instagram limits) | Yes — per-IP server-side rate limiting |
| Secrets management | UNKNOWN | N/A | Yes — env vars only; no secrets in code |
| Evidence | UNKNOWN | DOCUMENTED | Design requirement |

### Accessibility

| Category | SnapInsta | 4K Stogram | Snapora Target |
|---|---|---|---|
| Keyboard navigation | UNKNOWN | Desktop-dependent | Yes — all controls keyboard-accessible |
| Screen reader support | UNKNOWN | UNKNOWN | Yes — ARIA roles, labels |
| Color contrast | UNKNOWN | UNKNOWN | WCAG AA minimum |
| Focus indicators | UNKNOWN | UNKNOWN | Visible |
| Evidence | UNKNOWN (access blocked) | N/A (desktop app) | Design requirement |

### SEO

| Category | SnapInsta | 4K Stogram | Snapora Target |
|---|---|---|---|
| Title tag | UNKNOWN | VERIFIED (well-formed) | Descriptive, unique per page |
| Meta description | UNKNOWN | VERIFIED | Accurate, compelling |
| Structured data | UNKNOWN | VERIFIED (JSON-LD SoftwareApplication) | JSON-LD for SoftwareApplication |
| Canonical | UNKNOWN | VERIFIED | Yes |
| hreflang | UNKNOWN | VERIFIED (13 languages) | English first; i18n later |
| Performance | UNKNOWN | INFERRED (Next.js with CDN) | Fast — Vite + static hosting |
| Evidence | UNKNOWN / VERIFIED | VERIFIED | Design requirement |

---

## Features Not to Reproduce

| Feature | Reason |
|---|---|
| Private account content access via stored credentials | Unacceptable privacy risk; violates policy; out of scope |
| Anonymous Story viewing (bypasses view tracking) | Circumvents platform controls |
| Ad-supported UI with pop-ups | Unacceptable UX |
| Subscription auto-download workers | Requires persistent backend process; out of MVP scope |
| Caption metadata embedding into EXIF | Requires server-side processing; out of MVP scope |
| Hashtag / location batch download | Requires pagination + large request volumes; legal/ToS risk |

---

## Summary of Most Valuable Snapora Opportunities

| Rank | Opportunity | vs. References | Priority |
|---|---|---|---|
| 1 | Multiline URL batch input with per-URL validation | Neither reference offers web-based batch | P0 |
| 2 | Visible queue board with per-job status | SnapInsta: none; 4K Stogram: inferred only | P0 |
| 3 | Isolated failure handling — queue continues on single job failure | 4K Stogram loses queue state; SnapInsta N/A | P0 |
| 4 | Pause / resume / retry / remove per job | Neither reference offers all controls | P0 |
| 5 | IndexedDB queue + history persistence across refresh | SnapInsta: none; 4K Stogram: local DB | P0 |
| 6 | Zero credential collection, zero ads, zero tracking | Both references have issues here | P0 |
| 7 | SSRF-safe, hostname-allowlisted backend proxy | Unknown for SnapInsta; N/A for 4K Stogram | P0 |
| 8 | Mobile-first responsive design | 4K Stogram desktop-only | P1 |
| 9 | Accessibility (WCAG AA) | Both references: UNKNOWN | P1 |
| 10 | Open-source with GitHub Actions CI | Both: proprietary | P0 |

---

*Last updated: 2026-10-28*
