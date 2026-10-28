# MEDIA PROVIDER STATUS & OFFICIAL API FEASIBILITY REPORT — SNAPORA

## 1. Current Operational State

### Operational Provider
The active provider is `MockProvider` located at `backend/src/providers/mock.ts`.
- **Purpose**: Provides deterministic, reproducible fixtures for development, UI validation, queue testing, and offline demonstration.
- **Fixture Logic**:
  - Shortcodes containing `private` yield HTTP 403 `PRIVATE_ACCOUNT`.
  - Shortcodes containing `error` yield HTTP 502 `PROVIDER_ERROR`.
  - Shortcodes containing `video` or `reel` yield MP4 video fixtures with dimension metadata.
  - Shortcodes containing `carousel` or `multi` yield multi-image arrays.
  - Standard shortcodes yield 1080x1080 photo fixtures.
- **Transparency Statement**: Snapora explicitly identifies that media retrieved under this provider is simulated. No real Instagram media is scraped or harvested.

---

## 2. Investigation of Official Meta Interfaces

A rigorous technical investigation was conducted against official Meta documentation for Instagram media access interfaces:

### A. Instagram Basic Display API
* **Status**: **DEPRECATED & DECOMMISSIONED**.
* **Timeline**: Deprecated October 24, 2024; fully discontinued in December 2024.
* **Findings**: Cannot be used for any new applications. Previously allowed personal profile media access with user consent.

### B. Instagram Graph API
* **Target Audience**: Business and Creator accounts only.
* **Requirements**:
  1. Meta for Developers account with a registered App.
  2. Instagram Professional (Business/Creator) account linked to a verified Facebook Page.
  3. OAuth 2.0 User Access Token (`instagram_basic`, `pages_show_list`).
  4. Meta App Review approval for production permissions.
* **Scope & Limitation**:
  - The Graph API endpoint `GET /{ig-user-id}/media` **only returns the media owned by the authenticated account**.
  - It does **not** allow querying or retrieving third-party public posts by URL or shortcode.
* **Verdict for Snapora**: Incompatible with Snapora's multi-URL downloader queue for arbitrary public posts. Asking users to link Facebook Business accounts and grant account management permissions directly contradicts Snapora's **Zero-Credential** privacy design.

### C. Instagram oEmbed API
* **Endpoint**: `GET https://graph.facebook.com/v21.0/instagram_oembed?url={url}&access_token={app_id}|{client_token}`
* **Requirements**:
  1. Meta Developer App.
  2. App Access Token (`{app_id}|{client_token}`). No user login required.
  3. Meta Feature `oEmbed Read` (requires App Review for public access; works in Dev Mode for app admins).
* **Returned Data**:
  - `author_name`, `author_url`, `title`, `thumbnail_url`, `thumbnail_width`, `thumbnail_height`, `html` (iframe embed code).
* **Limitations on Downloadable Media**:
  - Returns low/medium resolution `thumbnail_url`.
  - **Does NOT return raw full-resolution video MP4 streams or multi-item carousel image URLs**.
* **Verdict for Snapora**: Suitable for an authorized metadata and preview provider (`InstagramOEmbedProvider`), but technically incapable of serving as a full-resolution media downloader.

### D. Unauthenticated Public Web Scraping (HTML/GraphQL)
* **Technical Constraints**: Meta deploys aggressive anti-bot defenses, IP reputation filters, ephemeral GraphQL signatures, and mandatory login redirects (`/accounts/login/?next=...`). Unauthenticated cloud IPs are blocked almost instantly.
* **Legal & Policy Constraints**: Section 3.2.3 of Meta's Terms of Use explicitly prohibits automated scraping without prior written permission.
* **Verdict for Snapora**: Circumventing anti-bot protections or harvesting session cookies is explicitly rejected as it violates project principles, platform terms, and user security.

---

## 3. Provider Architecture Decision

| Route | Feasibility | Decision |
|---|---|---|
| **Deterministic MockProvider** | 100% Verified | **Retain as Default**: Ensures reliable local development, UI testing, and preview demonstration without external dependencies. |
| **Instagram oEmbed Provider** | Verified (Requires Meta App ID) | **Optional Extension**: Can be added as an opt-in provider for users who supply their own Meta App ID + Client Token for thumbnail and caption extraction. |
| **Unauthenticated Scraper** | Volatile / TOS Violation | **Rejected**: Circumvents access controls; will not be implemented. |

---

## 4. UI Transparency Guidelines

To ensure open-source integrity:
1. All demonstration fixtures must remain clearly labelled.
2. The UI footer ([SecurityBanner.tsx](../frontend/src/components/SecurityBanner.tsx)) clearly articulates the zero-credential model and the simulation nature of the demo mode.
3. No simulated response should be represented to users as a live platform crawl.
