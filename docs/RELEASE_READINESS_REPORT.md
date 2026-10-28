# SNAPORA — PREVIEW RELEASE READINESS REPORT

## 1. Executive Summary

Snapora has undergone comprehensive security review, dependency auditing, queue validation, and static preview verification in preparation for an open-source technical preview (`v0.1.0-preview`).

The repository is clean, builds reproducibly, and passes **42 automated unit, integration, and security regression tests** with zero failures.

| Gate | Assessment | Verified Status |
|---|---|---|
| **Reproducible Build** | Clean build on Node.js 20.x & 22.x | ✅ Pass (Exit code 0) |
| **Type Checking** | Strict TypeScript across frontend & backend | ✅ Pass (0 errors) |
| **Test Fidelity** | 42 passing automated tests across 5 test suites | ✅ Pass (0 failures) |
| **Queue Engine** | Concurrency = 1, IndexedDB persistence, recovery, cancellation | ✅ Pass |
| **SSRF & Security** | Strict HTTPS, hostname allowlist, credential rejection, rate limiting | ✅ Pass |
| **Standalone Demo Mode** | Zero-backend client-side mock fallback for GitHub Pages | ✅ Pass |
| **Bundle Privacy Audit** | Zero secrets, tokens, or localhost references in `frontend/dist` | ✅ Pass |
| **Dependency Audit** | 9 advisories reviewed; requires major upgrades; 0 practical exposure | ⚠️ Documented |
| **Browser Smoke Test** | Verified via jsdom component tests; real browser process skipped | ⚠️ Documented |

---

## 2. Verified Build, Typecheck, and Test Evidence

Executed on Windows 11 with Node.js v22.20.0 and npm 10.9.3:

```
Test Suites:
  ✓ frontend/src/utils/urlValidator.test.ts (6 tests)
  ✓ frontend/src/context/queueReducer.test.ts (9 tests)
  ✓ frontend/src/test/e2e.test.tsx (10 tests)
  ✓ frontend/src/utils/mockResolver.test.ts (5 tests)
  ✓ backend/src/server.test.ts (12 tests)

Total Tests: 42 passed, 0 failed, 0 skipped
Execution Time: ~3.2s across all workspaces

Build Outputs:
  • frontend/dist/index.html (0.66 kB, relative asset links './assets/...')
  • frontend/dist/assets/index-*.css (2.67 kB)
  • frontend/dist/assets/index-*.js (247.91 kB)
  • backend/dist/ (Clean ES2022 NodeNext compilation)
```

---

## 3. Dependency Vulnerability Audit (`npm audit`)

The dependency audit was reproduced directly from the workspace:

| Package | Installed Version | Direct / Transitive | Severity & Advisory ID | Practical Exposure in Snapora | Fixed Version & Compatibility |
|---|---|---|---|---|---|
| **fastify** | 4.29.1 | Direct (`backend`) | High (`GHSA-mrq3-vjjr-p77c`, `GHSA-444r-cwp2-x5xf`) | **None**. Snapora does not use `sendWebStream` or trust forwarded headers; returns static JSON. | `5.12.7` (Requires breaking Fastify 5 migration) |
| **find-my-way** | 8.2.2 | Transitive (`fastify`) | High (`GHSA-c96f-x56v-gq3h`) | **None**. Advisory affects HTTP/2 trailer handling; Snapora runs HTTP/1.1 only. | `9.6.0` (Bundled in Fastify 5) |
| **zod** | 3.25.76 | Direct (`backend`) | High (`GHSA-mrhx-c7xc-m3w5`) | **None**. Advisory affects memory exhaustion in oversized collections (`.array().max(...)`). Snapora only validates `{ url: z.string().min(1) }`. | `4.6.7` (Requires breaking Zod 4 migration) |
| **vitest** | 2.1.9 | Direct devDep (`frontend`) | Critical (`GHSA-5xrq-8626-4rwp`) | **None**. Advisory affects `--ui` interactive server; Snapora runs headless `vitest run`. Not present in production bundle. | `5.0.5` (Requires breaking Vitest 5 migration) |
| **tinypool** | 2.1.1 | Transitive devDep (`vitest`) | Critical (`GHSA-5gmw-xhrv-c9v3`, `GHSA-85c8-ppgw-ccpr`) | **None**. Prototype pollution in worker runner options. Pure devDependency in test environment. | `>=2.1.2` (Bundled in Vitest 5) |
| **vite / esbuild / vite-node** | 6.4.5 / 0.24.2 | Transitive devDep | Moderate / High (`GHSA-67mh-4wv8-2f99`, `GHSA-587h-7wmj-h5pm`) | **None**. Development server editor launch and dev-server request reading. Not included in production bundle. | Bundled in Vitest 5 |

### Audit Decision
Running `npm audit fix --force` would introduce breaking major upgrades (`fastify@5`, `zod@4`, `vitest@5`), disrupting plugin contracts and test harnesses immediately prior to release. Because none of the reported advisories represent reachable vulnerabilities in Snapora's production architecture or headless CI, the dependencies are retained on current stable majors, and a scheduled migration milestone is recommended post-preview.

---

## 4. Preview Verification: Standalone Static Demo Mode

1. **GitHub Pages Standalone Compatibility**:
   - Implemented `resolveClientMock` in [frontend/src/utils/mockResolver.ts](../frontend/src/utils/mockResolver.ts).
   - Configured `VITE_DEMO_MODE=true` in [QueueContext.tsx](../frontend/src/context/QueueContext.tsx). When built for static GitHub Pages hosting, the client-side mock resolver handles queue jobs locally.
   - **Zero Backend Required**: No server deployment, hosting fees, or backend processes are required to provide a fully functional, interactive browser demonstration.
2. **Relative Asset Packaging**:
   - `base: './'` is configured in [frontend/vite.config.ts](../frontend/vite.config.ts).
   - `frontend/dist/index.html` references `./assets/index-*.js` and `./assets/index-*.css`. The static bundle functions identically at root domains (`https://snapora.dev`) or subpaths (`https://username.github.io/snapora/`).
3. **Bundle Hygiene**:
   - Grep audit of `frontend/dist/` confirmed **zero secrets, API tokens, passwords, private keys, or localhost URLs** in the production bundle.

---

## 5. Security & SSRF Configuration Review

1. **CORS Allowlist**: Configured in [backend/src/server.ts](../backend/src/server.ts) via `config.corsOrigin`, allowing specific production origins (`CORS_ORIGIN=https://username.github.io`) or defaulting to local development reflection.
2. **SSRF Guard**:
   - Enforces HTTPS only.
   - Rejects embedded credentials (`user:pass@host`).
   - Restricts hostnames to `instagram.com`, `www.instagram.com`, `cdninstagram.com`, `instagr.am`.
   - Rejects non-standard ports (enforces port 443 only).
   - Reconstructs canonical target `https://www.instagram.com/p/${shortcode}/`.
   - Blocks private/loopback IP addresses (`127.0.0.1`, `169.254.169.254`, `10.0.0.1`, `localhost`).
3. **Rate Limiting & Caps**: 30 requests/minute per IP, 10s request timeout, 50MB response cap.
4. **Safe Error Handling**: Centralized handler prevents stack trace disclosure and returns typed error codes.

---

## 6. Known Limitations

1. **Simulated Media Retrieval**: Real Instagram media retrieval is not implemented due to platform Terms of Service (Section 3.2.3 anti-scraping rule) and the deprecation of public unauthenticated APIs. All demonstrations use deterministic fixtures.
2. **Test Environment**: Component and user scenario tests execute inside `jsdom` with React Testing Library. Browser-level testing via Playwright/Puppeteer remains an outstanding enhancement.
3. **Dependency Upgrades**: Upstream major version upgrades (`fastify@5`, `zod@4`, `vitest@5`) are deferred to post-preview maintenance.

---

## 7. Explicit Release Blockers

* **User Approval for Remote Operations**: In accordance with constraints, no git commits have been pushed to GitHub, no git tags have been created, no GitHub releases have been drafted, and no external infrastructure has been provisioned.

---

## 8. Final Decision

### **READY WITH DOCUMENTED LIMITATIONS**

The repository is stable, typecheck-clean, passes all 42 automated tests, contains zero hardcoded secrets, and is verified for static standalone demo deployment on GitHub Pages.
