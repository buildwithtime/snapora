# MEDIA PROVIDER STATUS & OFFICIAL API ARCHITECTURE — SNAPORA

## 1. Provider Implementations

Snapora implements a modular provider interface (`IMediaProvider` in `backend/src/providers/types.ts`) supporting two operational modes:

### A. Deterministic `MockProvider` (`backend/src/providers/mock.ts`)
* **Default Mode**: Used when `DEFAULT_PROVIDER=mock` or in client-side standalone Demo Mode (`VITE_DEMO_MODE=true`).
* **Purpose**: Provides offline, reproducible fixtures for development, UI validation, queue stress testing, and public demonstration.
* **Fixture Specifications**:
  * Shortcodes containing `private`: Classified as HTTP 403 `PRIVATE_ACCOUNT` / `CONTENT_PRIVATE`.
  * Shortcodes containing `error`: Classified as HTTP 502 `PROVIDER_ERROR`.
  * Shortcodes containing `video` or `reel`: Generates simulated MP4 video fixture.
  * Shortcodes containing `carousel` or `multi`: Generates multi-image carousel fixture.
  * Standard shortcodes: Generates single photo fixture.
* **Transparency Notice**: All media returned by MockProvider is clearly marked with `disclaimer: 'Simulated fixture generated for offline testing.'`

### B. Official `InstagramOEmbedProvider` (`backend/src/providers/oembed.ts`)
* **Live Mode**: Used when `DEFAULT_PROVIDER=oembed`.
* **Purpose**: Retrieves official public preview metadata, author handle, post title, iframe embed code, and thumbnail image directly from Meta's Graph API.
* **Backend Credentials**: Uses Meta App ID and Client Token (`INSTAGRAM_APP_ID`, `INSTAGRAM_CLIENT_TOKEN`) strictly on the backend. No credentials are ever exposed to the client.

---

## 2. Meta Developer Setup Guide for Live Previews

To enable official live Instagram previews in Snapora:

1. **Create a Meta Developer Account**:
   * Visit [Meta for Developers](https://developers.facebook.com/).
   * Register or log in with your Meta account.
2. **Create a Meta App**:
   * Navigate to **My Apps** > **Create App**.
   * Select **Other** as the use case.
   * Choose app type **Business** or **Consumer**.
3. **Add the oEmbed Product**:
   * In your App Dashboard, search for **oEmbed** and click **Set Up**.
   * Enable the **oEmbed Read** feature.
   * *Note*: In Development Mode, the app can query public posts when called by App Administrators and Developers. For unrestricted public use, Meta requires App Review.
4. **Obtain Credentials**:
   * Navigate to **App Settings** > **Advanced**.
   * Copy the **App ID** and **Client Token**.
5. **Configure Backend Environment**:
   * In your backend `.env` file:
     ```env
     DEFAULT_PROVIDER=oembed
     INSTAGRAM_APP_ID=your_meta_app_id
     INSTAGRAM_CLIENT_TOKEN=your_meta_client_token
     ```
   * Alternatively, configure the direct token:
     ```env
     INSTAGRAM_OEMBED_ACCESS_TOKEN=your_meta_app_id|your_meta_client_token
     ```

---

## 3. Official API Field Mapping & Limitations

### Supported Content Types
* Instagram Posts (`/p/{shortcode}/`)
* Instagram Reels (`/reel/{shortcode}/`, `/reels/{shortcode}/`)
* Instagram TV (`/tv/{shortcode}/`)

### Available Metadata Fields
| Field Name | Type | Description |
| :--- | :--- | :--- |
| `author_name` | `string` | Display name or handle of the Instagram author |
| `author_url` | `string` | Link to the author's Instagram profile |
| `title` | `string` | Caption text or title summary of the post |
| `html` | `string` | Official Instagram embed blockquote snippet |
| `thumbnail_url` | `string` | Direct URL to image thumbnail |
| `thumbnail_width` | `number` | Width of the thumbnail in pixels |
| `thumbnail_height`| `number` | Height of the thumbnail in pixels |
| `provider_name` | `string` | Always `"Instagram"` |

### API Limitations & Classified Statuses
* **No Raw Media Streams**: Meta's oEmbed API explicitly does **not** provide downloadable MP4 video files or high-resolution carousel files.
* **Content Eligibility**: Only public posts with third-party embedding enabled can be retrieved.
* **Classified Errors**:
  * `PROVIDER_NOT_CONFIGURED`: Missing Meta credentials in backend `.env`.
  * `CONTENT_PRIVATE`: Account is private or embedding is disabled by the creator.
  * `CONTENT_UNAVAILABLE`: Post deleted or shortcode not found (HTTP 404).
  * `RATE_LIMITED`: Meta API rate limit exceeded (HTTP 429).
  * `AUTHENTICATION_ERROR`: Invalid or expired Meta access token.

---

## 4. Separation of Preview vs. Media Downloading

Snapora enforces a strict architectural boundary between preview retrieval and file downloading:

```
┌────────────────────────────────────────────────────────┐
│                   Instagram URL                        │
└──────────────────────────┬─────────────────────────────┘
                           │
                 [URL Normalization]
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│              Official Live Preview Mode                │
│             (Meta Graph API oEmbed v21.0)              │
│                                                        │
│  ✓ Post Author & Profile Link                          │
│  ✓ Caption Snippet & Title                             │
│  ✓ Official Embed Blockquote                           │
│  ✓ Preview Thumbnail Image                             │
│                                                        │
│  ✗ Raw Video (MP4) Stream (Not provided by Meta)       │
│  ✗ High-Res Carousel Images (Not provided by Meta)     │
└────────────────────────────────────────────────────────┘
```

When a live preview is retrieved:
* `status` transitions to `preview_ready` (`live_preview_retrieved`).
* `downloadAvailable` is set to `false`.
* The UI renders an **Official Live Preview Card** with the thumbnail, author, and external link.
* **No misleading "Download Video/Photo" button is rendered**.

---

## 5. Authorized Download Pathways

For scenarios where raw media download is required:

1. **Authorized Graph API User Media (`/me/media`)**:
   * For accounts owned or managed by an authenticated user, the Instagram Graph API provides temporary direct `media_url` streams.
   * Requires user OAuth login with `instagram_basic` and Facebook Page management permissions.
2. **User-Supplied Direct Media**:
   * Users can supply direct media URLs that they have legal authority and authorization to access.
3. **Local Media File Selection**:
   * Local file selection in the browser for storage and queue processing.

### Prohibited Pathways (Defense Against Abuse)
* Unauthenticated web scraping or anti-bot bypasses.
* Storing or harvesting Instagram user session cookies.
* Private account bypasses without authorization.
* Undocumented private API reverse-engineering.

To ensure open-source integrity:
1. All demonstration fixtures must remain clearly labelled.
2. The UI footer ([SecurityBanner.tsx](../frontend/src/components/SecurityBanner.tsx)) clearly articulates the zero-credential model and the simulation nature of the demo mode.
3. No simulated response should be represented to users as a live platform crawl.
