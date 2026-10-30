# Privacy Policy (Draft) — Snapora

**Last Updated:** October 2026

Snapora is an open-source, client-first media utility engineered for privacy, transparency, and user safety. This Privacy Policy outlines how Snapora handles data across its frontend application and backend proxy service.

---

## 1. Non-Affiliation Disclaimer

Snapora is an independent open-source project. **Snapora is not affiliated with, endorsed by, sponsored by, or associated with Instagram, Meta Platforms, Inc., or any of their affiliates or subsidiaries.** All product names, logos, and brands are property of their respective owners.

---

## 2. Summary of Key Principles

* **Zero Credential Collection**: Snapora never asks for, accepts, or stores your Instagram username, password, session cookies, or personal account credentials.
* **No User Accounts or Tracking**: There are no user accounts, logins, advertising networks, tracking pixels, or third-party analytics scripts.
* **Local-First Storage**: Your download queue and recent history are saved solely on your device within your browser.
* **Ephemeral Media Streaming**: Downloaded media files are not retained or stored on backend servers.

---

## 3. Data Storage & Local Browser Persistence

### Local Data (Stored on Your Device)
When you use Snapora, the following data is stored locally in your browser:
* **Queue Jobs & States**: Stored in your browser's **IndexedDB** database (`snapora_queue_db`). This allows interrupted download queues to recover if you refresh or reopen the page.
* **Recent Download History**: Stored in your browser's **localStorage** (`snapora_recent_downloads_v1`, capped at 10 items).

> **User Control**: You can clear this data at any time directly through the interface using the **Clear History**, **Clear Completed**, or **Clear Failed** buttons, or by clearing your browser site data. This data is never sent to a persistent database.

---

## 4. Network Transmission & Third-Party Requests

### Data Sent to the Snapora Backend
When you enter a URL and click **Fetch Media**, the following communication occurs:
1. **URL Validation & Transmission**: The entered Instagram URL is transmitted via HTTPS to the Snapora backend service (`/api/resolve` and `/api/download`) solely to process the request on your behalf.
2. **Third-Party Upstream Requests**: The Snapora backend connects to public Meta / Instagram servers (such as `www.instagram.com`, `graph.facebook.com`, or CDN nodes `scontent*.cdninstagram.com`) to retrieve post metadata and media streams.
3. **SSRF Defense**: All outbound requests from the backend are strictly filtered using socket-level DNS verification to prevent Server-Side Request Forgery (SSRF) and block internal or private network access.

---

## 5. Media Processing & Streaming

* Media streams (JPEG, MP4, WebP) are passed transiently through memory streams for binary magic-byte verification (ensuring genuine media signatures and enforcing response size limits).
* **Downloaded photos and videos are not permanently saved, cached, or archived on the Snapora server.**
* Media files are delivered directly to your browser for immediate saving or in-browser ZIP packaging.

---

## 6. Server Operational Logging

The backend server (built with Fastify) produces standard operational HTTP logs:
* **Logged Fields**: Request timestamp, HTTP method, request path, HTTP response status code, response time, and the client IP address.
* **Purpose**: IP addresses are utilized transiently by the rate-limiting engine (`@fastify/rate-limit`) to prevent automated abuse and Denial of Service (DoS).
* **Retention**: Operational logs are transient and are not used to construct personal user profiles or cross-site tracking identities.

---

## 7. Children's Privacy

Snapora does not knowingly collect or solicit personal data from children under the age of 13.

---

## 8. Open Source & Source Code Verification

Because Snapora is open source, all network requests, storage mechanisms, and security controls can be inspected and verified directly in the public source repository:
[https://github.com/buildwithtime/snapora](https://github.com/buildwithtime/snapora)

