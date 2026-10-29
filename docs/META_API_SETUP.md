# Meta Platform Developer API Integration Guide

This guide details how to configure official Meta developer credentials to enable live Instagram previews and authorized media downloads in **Snapora**.

---

## 1. Architectural Principles & Security Boundaries

1. **Zero Credential Scraping**: Snapora **never** collects, logs, or stores Instagram usernames or passwords. All live integrations use official, versioned Meta APIs.
2. **Server-Side Secret Isolation**: Meta App Secrets, Client Tokens, and OAuth access tokens reside **strictly on the Fastify backend**. They are never transmitted to the browser or stored in frontend IndexedDB/localStorage.
3. **Graceful Degraded Mode**: If Meta credentials are not configured, Snapora automatically operates in standalone **Demo Mode** or indicates that configuration is required without crashing.

---

## 2. Setting Up Official Instagram oEmbed (Public Post Previews)

Instagram oEmbed allows retrieving official embed HTML, author metadata, and thumbnail previews for public Instagram posts and Reels.

> **Note**: As confirmed by official Meta documentation, Instagram oEmbed supplies **preview thumbnails and HTML embed codes**, but **does not provide raw downloadable MP4 video streams or high-resolution original photos**.

### Step-by-Step Configuration:
1. Navigate to the [Meta for Developers Portal](https://developers.facebook.com/).
2. Create or select a Meta Developer App (choose app type: **Business** or **Other**).
3. Under **Products**, add **oEmbed**.
4. Submit your app for **App Review** for the **`oEmbed Read`** feature (required for production use; Development mode apps can query posts created by App Admins).
5. Obtain your credentials from **App Settings > Basic**:
   - **App ID**: e.g., `123456789012345`
   - **Client Token**: Found under **Advanced > Client Token**
   - Alternatively, generate an App Access Token: `{App-ID}|{App-Secret}`
6. Add the credentials to your backend `.env` file:
   ```env
   DEFAULT_PROVIDER=oembed
   INSTAGRAM_APP_ID=your_meta_app_id
   INSTAGRAM_CLIENT_TOKEN=your_meta_client_token
   # Or alternatively:
   # INSTAGRAM_OEMBED_ACCESS_TOKEN=your_app_access_token
   ```
7. Restart the Fastify backend. Public post URLs will now resolve live oEmbed previews with verified Meta attribution.

---

## 3. Setting Up Instagram Graph API (Creator Account Media Downloads)

To download original high-resolution photos, Reels, and multi-slide carousels, the Instagram Graph API requires authorization from the account owner or manager.

### Capabilities:
- Returns original uncapped MP4 video files and JPEG images (`media_url`).
- Fully enumerates carousel albums via `/{ig-media-id}/children`.
- **Restriction**: Can only access media owned or managed by the authenticated account. Arbitrary third-party posts cannot be downloaded via Graph API.

### Required Permissions:
- `instagram_basic`: Read basic profile and media objects.
- `pages_show_list`: Link Facebook Pages to Instagram Professional accounts.

### Token Flow:
1. Complete OAuth 2.0 Authorization Code flow with Meta Business Login:
   ```
   https://www.facebook.com/v21.0/dialog/oauth?client_id={app_id}&redirect_uri={redirect_uri}&scope=instagram_basic
   ```
2. Exchange the authorization code for a short-lived user access token.
3. Exchange the short-lived token for a long-lived 60-day token via `GET /oauth/access_token?grant_type=fb_exchange_token`.
4. Provide the token to `AuthorizedAccountMediaProvider` via backend options or secure HTTP-only session cookies.

---

## 4. Troubleshooting & Error Responses

| Status Code | Error Code | Root Cause | Remediation |
| :--- | :--- | :--- | :--- |
| `503 Service Unavailable` | `PROVIDER_NOT_CONFIGURED` | Meta App ID / Client Token missing in `.env`. | Add `INSTAGRAM_APP_ID` and `INSTAGRAM_CLIENT_TOKEN` to backend `.env`. |
| `401 Unauthorized` | `AUTHENTICATION_ERROR` | Meta App token or User OAuth token has expired or is invalid. | Refresh tokens in Meta Developer Portal or re-run OAuth login. |
| `403 Forbidden` | `CONTENT_PRIVATE` | Target Instagram post is from a private account or embeds are disabled. | Content cannot be retrieved via public APIs. |
| `429 Too Many Requests` | `RATE_LIMITED` | Meta platform API rate limit exceeded. | Snapora will automatically pause and apply bounded backoff before retrying. |
