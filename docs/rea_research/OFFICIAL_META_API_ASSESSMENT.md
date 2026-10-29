# OFFICIAL META API ASSESSMENT: INTEGRATION CAPABILITIES, CONSTRAINTS & ROADMAP

**Document**: Official Meta Platform Integration Assessment  
**Analyst**: Senior Full-Stack & Application Security Engineer  
**Framework**: REA `rea-agents@6.7.0`  
**Reference Sources**: Meta for Developers Official Documentation (`developers.facebook.com`), Graph API Reference (`v21.0` / `v26.0`)  

---

## 1. Executive Summary

A common misconception among developers building media tools is assuming that if an Instagram post URL is public, an official Meta API must exist to download its original video or photo file.

Our technical investigation into official Meta documentation confirms the following fundamental reality:
1. **Instagram oEmbed** is the **only official public API** that accepts arbitrary third-party Instagram URLs without requiring the user to authenticate as the owner of that account. However, oEmbed **does not provide downloadable raw video or high-res image files**—it provides embed iframes, metadata, and preview thumbnails.
2. **Instagram Graph API** provides direct downloadable `media_url` endpoints (MP4/JPEG), but **strictly and exclusively for accounts owned or managed by the authenticated user**. It cannot query or download media from arbitrary third-party accounts.
3. **Instagram Basic Display API** has been **deprecated and decommissioned** by Meta (December 2024) and cannot be used for any new applications.

---

## 2. Comparative Assessment of Official Meta Integration Pathways

| Feature / Criterion | Instagram oEmbed API | Instagram Graph API (User Media) | Instagram Basic Display API |
| :--- | :--- | :--- | :--- |
| **Official Status** | **Active** (`v21.0`+) | **Active** (`v21.0`+) | **DECOMMISSIONED** (Dec 2024) |
| **Primary Target** | Public content previews & embeds | Business & Creator account media | Personal profile media (Legacy) |
| **Endpoint** | `GET /v21.0/instagram_oembed` | `GET /{ig-user-id}/media` | `GET /me/media` (Defunct) |
| **Authentication Type** | App Access Token (`{app_id}\|{client_token}`) | User OAuth 2.0 Access Token | User OAuth 2.0 Access Token |
| **User Login Required?** | **No**. Server-to-server app token | **Yes**. Account owner must authorize | Yes (Legacy) |
| **Arbitrary 3rd-Party URLs?**| **Yes** (Public posts with embeds on) | **No**. Owned media only | No. Owned media only |
| **Downloadable Original Media?**| **No**. Thumbnail & iframe embed only | **Yes**. Direct temporary `media_url` | Yes (Legacy) |
| **Supported Content Types** | Posts, Reels, TV | Photos, Videos, Reels, Carousels | Photos, Videos, Carousels |
| **App Review Required?** | Yes for general public; No in Dev Mode | Yes for production permissions | N/A |
| **Permission Scopes** | `oEmbed Read` feature | `instagram_basic`, `pages_show_list` | `user_profile`, `user_media` |
| **Credential Storage** | Backend `.env` only | Secure encrypted user session store | N/A |

---

## 3. Deep Dive: Instagram oEmbed API

### A. Operational Mechanism
* **Endpoint**: `https://graph.facebook.com/v21.0/instagram_oembed?url={url}&access_token={app_id}|{client_token}&omitscript=true`
* **App Setup**:
  1. Register a Meta Developer Account at `developers.facebook.com`.
  2. Create an App (type: **Business** or **Consumer**).
  3. Add the **oEmbed** product and enable the **oEmbed Read** feature.
  4. Copy **App ID** and **Client Token** from App Settings > Advanced.
* **Access Rules**:
  * In Development Mode, queries succeed for all public posts when called by App Administrators, Developers, or Testers.
  * For unrestricted public use across any IP, Meta requires standard App Review approval.

### B. Returned Fields & Schema
```json
{
  "version": "1.0",
  "title": "Sunset over the bay (caption text)",
  "author_name": "photographer_handle",
  "author_url": "https://www.instagram.com/photographer_handle",
  "provider_name": "Instagram",
  "provider_url": "https://www.instagram.com",
  "type": "rich",
  "width": 658,
  "html": "<blockquote class=\"instagram-media\" ...></blockquote>",
  "thumbnail_url": "https://scontent.cdninstagram.com/v/t51.2885-15/...",
  "thumbnail_width": 640,
  "thumbnail_height": 640
}
```

### C. Critical Limitations
* **Preview Thumbnail Only**: `thumbnail_url` points to a resized preview asset (typically 640x640), not the original 1080p+ master file.
* **Zero Video Streams**: Does not provide raw `.mp4` URLs for reels or video posts.
* **Embed Availability Check**: If a post is deleted, private, or the author disabled "Allow embedding", Meta returns HTTP 400 with `error.code: 100` / `error_subcode: 33`.

---

## 4. Deep Dive: Instagram Graph API (User Media)

### A. Operational Mechanism
* **Endpoint**:
  ```http
  GET https://graph.facebook.com/v21.0/{ig-user-id}/media?fields=id,caption,media_type,media_url,thumbnail_url,children{media_url,thumbnail_url,media_type}&access_token={user-access-token}
  ```
* **Requirements**:
  1. The user must operate an Instagram Professional (Business or Creator) account.
  2. The Instagram account must be linked to a Facebook Page.
  3. The user authorizes the application via Facebook Login, granting `instagram_basic` and `pages_show_list`.

### B. Returned Fields & Media Payload
```json
{
  "data": [
    {
      "id": "17896450804038745",
      "media_type": "VIDEO",
      "media_url": "https://video.cdninstagram.com/v/t50.2885-16/master.mp4?...",
      "thumbnail_url": "https://scontent.cdninstagram.com/v/t51.2885-15/...",
      "caption": "Official launch video"
    },
    {
      "id": "17880997618081620",
      "media_type": "CAROUSEL_ALBUM",
      "children": {
        "data": [
          {
            "id": "17871527143187462",
            "media_type": "IMAGE",
            "media_url": "https://scontent.cdninstagram.com/v/t51.2885-15/slide_1.jpg"
          }
        ]
      }
    }
  ]
}
```

### C. Strengths & Limitations for Snapora
* **Strengths**: True, authorized, high-resolution original media downloads (MP4 and full-size JPEG). Carousel slides enumerated cleanly via `children`.
* **Limitations**: **Strictly limited to the authenticated user's own content**. A user cannot paste a competitor's or friend's URL and retrieve their media through this API.

---

## 5. Security & Credential Isolation Rules

Snapora enforces absolute credential isolation between backend and frontend:

1. **Backend Environment Isolation**:
   - Meta App ID and Client Token (`INSTAGRAM_APP_ID`, `INSTAGRAM_CLIENT_TOKEN`) must reside exclusively in backend `.env`.
   - Never commit `.env` files to source control.
2. **Frontend Bundle Hygiene**:
   - Never prefix Meta credentials with `VITE_`.
   - The compiled static bundle (`frontend/dist/`) must never contain API keys, client tokens, or administrative secrets.
3. **Stateless Operations**:
   - The backend proxy does not persist user tokens or request logs, preventing data leakage.
