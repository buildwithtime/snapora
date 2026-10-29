# Snapora Feature Gap Analysis & Implementation Baseline

**Document Version:** 1.0.0  
**Date:** 2026-10-28  
**Evaluator:** Senior Full-Stack & Application Security Engineer  
**Reference:** REA Research Report (`docs/rea_research/`)

---

## 1. Executive Summary

This feature gap analysis audits the **Snapora** repository against the findings of the **Reverse Engineering Anything (REA)** research report. Snapora possesses a well-structured monorepo foundation with an IndexedDB-backed sequential queue, React 19 frontend, Fastify backend, and 60 automated unit/integration tests. 

However, prior to this phase, Snapora operated primarily as a mock-driven prototype. While an initial `InstagramOEmbedProvider` prototype was drafted, real media streaming, SSRF-hardened direct CDN ingestion, genuine media magic-byte validation, explicit capability registries, and authorized Meta Graph API scaffolding were missing.

---

## 2. Baseline Status Taxonomy

- **`IMPLEMENTED`**: Verified in the current source code with automated test coverage.
- **`PARTIAL`**: Basic scaffolding or incomplete functionality exists.
- **`MISSING`**: Functionality is absent from the codebase.
- **`BLOCKED`**: Implementation requires external credentials, developer app verification, or infrastructure.
- **`UNSAFE`**: Implementation has an architectural or security weakness requiring remediation.

---

## 3. Comprehensive Feature Baseline Matrix

| # | Evaluation Dimension | Baseline Status | Source File & Relevant Symbol | Audit Notes & Gap Description |
| :- | :--- | :--- | :--- | :--- |
| **1** | **Instagram URL Parsing & Normalization** | `PARTIAL` | `frontend/src/utils/urlValidator.ts` (`parseInstagramUrl`) & `backend/src/utils/ssrf.ts` | Validates standard `/p/`, `/reel/`, `/tv/` paths and strips tracking query parameters. **Gap**: Does not parse direct CDN URLs (`scontent*.cdninstagram.com`), does not return a unified `ParsedInstagramUrl` object with content-type categorization across front and back. |
| **2** | **Post, Reel, Carousel, & Direct Detection** | `PARTIAL` | `frontend/src/utils/urlValidator.ts` (`InstagramMediaType`) | Recognizes `post`, `reel`, and `tv`. **Gap**: Carousel posts cannot be detected from URL alone (requires provider resolution); direct CDN media links are rejected as invalid hosts. |
| **3** | **Duplicate Detection** | `IMPLEMENTED` | `frontend/src/context/QueueContext.tsx` (`ADD_JOBS` reducer) | Deduplicates incoming URLs against `job.normalizedUrl` before enqueueing. |
| **4** | **Provider Interface & Capability Registry** | `PARTIAL` | `backend/src/providers/types.ts` (`IMediaProvider`) | Defines `canResolve` and `resolve`. **Gap**: Lacks a formalized `ProviderCapabilityRegistry` describing `supportsPreview`, `supportsOriginalDownload`, `supportsCarousel`, `requiresAuthentication`, and `requiresConfiguration`. |
| **5** | **Demo Provider Isolation** | `IMPLEMENTED` | `backend/src/providers/mock.ts` (`MockProvider`) & `frontend/src/utils/mockResolver.ts` | Simulated fixtures are isolated and do not execute external HTTP requests. |
| **6** | **Public oEmbed Integration** | `PARTIAL` | `backend/src/providers/oembed.ts` (`InstagramOEmbedProvider`) | Backend queries Meta oEmbed `v21.0` with Zod schema validation and timeouts. **Gap**: Frontend lacks rich embed rendering; unconfigured state needs clearer UI propagation. |
| **7** | **Authorized Account Media Integration** | `BLOCKED` | N/A (None) | Requires Meta Developer App review and user OAuth 2.0 tokens (`instagram_basic`). **Gap**: Needs complete architectural scaffolding, OAuth flow definitions, and type modeling. |
| **8** | **Direct-Media URL Ingestion** | `MISSING` | N/A (None) | Users cannot provide verified direct CDN links (`scontent*.cdninstagram.com`) for downloading media. |
| **9** | **SSRF & DNS/IP Protections** | `UNSAFE` / `PARTIAL` | `backend/src/utils/ssrf.ts` (`validateAndSanitizeUrl`) | Hostname allowlist exists for Instagram web URLs. **Gap**: No socket-level or DNS-level IP validation. If direct URLs are allowed, attackers could trigger SSRF against cloud metadata (`169.254.169.254`) or private RFC1918 subnets via DNS rebinding. |
| **10** | **Download Queue Concurrency** | `IMPLEMENTED` | `frontend/src/context/QueueContext.tsx` | Enforces sequential execution (`concurrency = 1`) matching 4K Stogram's empirical rate-safety pattern. |
| **11** | **Download Progress, Cancellation, Retry** | `PARTIAL` | `frontend/src/context/QueueContext.tsx` (`PAUSE_QUEUE`, `RETRY_JOB`) | State machine handles actions, but progress reporting is simulated. Real streaming progress with `AbortController` cancellation is missing. |
| **12** | **Real Media-Byte Retrieval** | `MISSING` | `backend/src/routes/resolve.ts` | Only metadata and mock JSON payloads are returned. No backend route streams real media bytes to the client. |
| **13** | **JPEG & MP4 Magic Byte Validation** | `MISSING` | N/A (None) | No binary validation utility checks for `FF D8 FF` (JPEG) or `ftyp` (MP4) signatures before declaring a download complete. |
| **14** | **Carousel Handling** | `PARTIAL` | `frontend/src/types/queue.ts` (`MediaItem[]`) | Multiple items can be held in an array. **Gap**: No explicit `CarouselItem` model with per-item status, individual failure handling, or partial completion states. |
| **15** | **Download Completion & Failure States** | `PARTIAL` | `frontend/src/types/queue.ts` (`JobStatus`) | States exist, but the UI marks mock items as "completed" without real byte retrieval. |
| **16** | **IndexedDB Persistence** | `IMPLEMENTED` | `frontend/src/utils/storage.ts` | Queue jobs are persisted locally across browser refreshes using `idb`. |
| **17** | **Configuration & Secret Handling** | `PARTIAL` | `backend/src/config/index.ts` | Loads environment variables. **Gap**: Documentation on Meta API setup is incomplete; no runtime warnings on missing credentials. |
| **18** | **UI Capability Badges & Error Messages** | `PARTIAL` | `frontend/src/components/JobItem.tsx` | Badges exist for mock and oEmbed. **Gap**: Missing distinct badges for 'Preview Available', 'Original Downloadable', 'Authentication Required', 'Direct Media'. |
| **19** | **Frontend/Backend Test Coverage** | `PARTIAL` | `frontend/src/**/*.test.ts` & `backend/src/**/*.test.ts` | 60 unit tests pass. **Gap**: Missing tests for direct CDN parsing, SSRF DNS/IP blocking, magic byte validation, and capability registry. |
| **20** | **Documentation & Deployment Readiness** | `PARTIAL` | `docs/` | Comprehensive REA research created. **Gap**: Needs dedicated `META_API_SETUP.md`, `SECURITY_MODEL.md`, and updated `README.md`. |

---

## 4. Remediation Action Plan

1. **Phase B (URL Parsing)**: Unify parsing into a robust `InstagramUrlParser` supporting web URLs and direct CDN URLs with tracking tag stripping.
2. **Phase C (Provider Architecture)**: Establish `ProviderCapabilityRegistry` and formalize provider capabilities and result outcomes.
3. **Phase D (oEmbed Refinement)**: Finalize `InstagramOEmbedProvider` with full fallback handling when unconfigured.
4. **Phase E (Authorized Account Media)**: Scaffold `AuthorizedAccountMediaProvider` with Meta OAuth 2.0 specifications.
5. **Phase F (Direct Media Provider & SSRF)**: Implement `DirectMediaUrlProvider` with strict pre-flight DNS resolution, IPv4/IPv6 private/loopback/cloud-metadata blocklists, and redirect revalidation.
6. **Phase G (Genuine Byte Validation)**: Implement `validateMediaBytes` checking JPEG `FF D8 FF` and MP4 `ftyp` box signatures.
7. **Phase H & I (Queue & UI)**: Upgrade queue and JobItem with rich status badges and real progress streaming.
8. **Phase J (Carousel Enhancements)**: Introduce `CarouselItem` model with independent item status tracking.
9. **Phase K & L (Testing & Docs)**: Add unit tests for all new components and document the security model.
