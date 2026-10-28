# RESEARCH METHODOLOGY

## Document Purpose

Describes methods, tools, evidence sources, access constraints, and classification standards applied throughout Snapora research.

---

## 1. Investigation Sequence

1. Environment verification
2. REA tool identification and capability assessment
3. SnapInsta public interface analysis
4. 4K Stogram product documentation analysis
5. Evidence-based comparison
6. Product requirement derivation
7. Architecture evaluation

---

## 2. Tools Used

### 2.1 REA (Reverse Engineering Anything)

- **Package**: `rea-agents@6.7.0` — **VERIFIED** (CLI installed via npm global package)
- **MCP registration**: Configured via local `mcp_config.json` — **VERIFIED**
- **Skill version**: 42 — 207 tools registered — **VERIFIED** (`rea doctor --json`)
- **Live server**: Confirmed responding via `binary_session` MCP call — **VERIFIED**
- **Used for**: Session state enumeration, tool availability check, browser provider availability assessment
- **Browser tools** (`inspect_web_page`, `capture_web_screenshot`, `analyze_web_bundle`): **AVAILABLE** but require a live CDP endpoint. No CDP endpoint was available in the sandbox environment.
- **Limitation**: Playwright driver (1.57.0) install returned HTTP 404 from CDN. No browser inspection was completed via REA.

### 2.2 `read_url_content`

- 4K Stogram product page (`https://www.4kdownload.com/products/stogram-8`): **Success** — full HTML, JSON-LD, and feature descriptions retrieved.
- 4K Stogram help page (`https://www.4kdownload.com/help/14`): **Success**
- SnapInsta (`https://snapinsta.to/en46`): **HTTP 403** — Cloudflare anti-bot protection. No bypass attempted.

### 2.3 Web Search

- Used for SnapInsta secondary workflow descriptions and 4K Stogram community error/queue documentation.
- Search-derived findings classified as **DOCUMENTED** or **INFERRED** only — never **VERIFIED**.

### 2.4 Browser Subagent

- Attempted for SnapInsta visual inspection.
- **Blocked**: Playwright driver unavailable (HTTP 404 from azureedge.net in network-isolated environment).

### 2.5 Direct HTML and Structured Data Analysis

- 4K Stogram Next.js-rendered HTML fully parsed:
  - `JSON-LD SoftwareApplication` schema: version, OS support, feature list, rating, pricing
  - All feature card headings and body copy
  - Navigation structure and CTA labels
  - SEO: title, meta description, canonical, hreflang, OG, Twitter card

---

## 3. Evidence Classification

| Label | Definition |
|---|---|
| `VERIFIED` | Directly observed via source code, structured data, or reproducible tool output |
| `DOCUMENTED` | Stated in official public documentation; not independently confirmed by live interaction |
| `INFERRED` | Reasonable technical hypothesis requiring further verification |
| `UNKNOWN` | Insufficient evidence; no assumption made |

---

## 4. Access Constraints Summary

| Target | Method Attempted | Outcome | Limitation Documented |
|---|---|---|---|
| SnapInsta homepage | `read_url_content` | HTTP 403 (Cloudflare) | Yes |
| SnapInsta homepage | Browser subagent | Playwright driver 404 | Yes |
| SnapInsta (secondary) | Web search | Partial — DOCUMENTED only | Yes |
| 4K Stogram product page | `read_url_content` | Full success | No |
| 4K Stogram help page | `read_url_content` | Full success | No |
| REA browser tools | `binary_session` MCP | CDP endpoint unavailable | Yes |

---

## 5. Ethical Constraints Applied

- No Cloudflare, CAPTCHA, or anti-bot bypass attempted
- No private Instagram account accessed
- No credentials or session cookies collected or simulated
- No aggressive crawling or automated request bursts
- All research limited to publicly accessible pages and officially documented behavior

---

## 6. Completeness Assessment

| Research Area | Completeness | Notes |
|---|---|---|
| 4K Stogram product features | High | Full HTML + JSON-LD extracted |
| 4K Stogram error/queue behavior | Medium | Community-documented; not directly verified |
| SnapInsta user workflow | Medium | Secondary sources only |
| SnapInsta client-side JavaScript | None | HTTP 403 blocked all access |
| REA browser/network inspection | None | CDP endpoint unavailable in sandbox |
| Security behavior (both products) | Low-Medium | INFERRED from community reports and patterns |

---

## 7. Reproducibility

To reproduce this research with full tool access:

1. Install REA: `npm install -g rea-agents`
2. Verify: `rea doctor --json`
3. For REA browser inspection: launch Chrome with `--remote-debugging-port=9222`, then call `list_browser_targets` for CDP target IDs
4. Use `read_url_content` for non-Cloudflare-protected pages
5. For Cloudflare-protected sites: use a real browser and manually document observations

---

*Last updated: 2026-10-28*
