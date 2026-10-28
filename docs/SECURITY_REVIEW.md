# SECURITY REVIEW & SSRF AUDIT — SNAPORA

## 1. Security Architecture Principles

Snapora is designed under the principle of **Zero-Trust Input Processing**:

1. **Zero Credential Collection**: Snapora never accepts, requests, or stores Instagram usernames, passwords, cookies, or OAuth access tokens.
2. **Deterministic Canonical URL Reconstruction**: Rather than passing raw user strings to network clients, Snapora decomposes input URLs, extracts the sanitized alphanumeric shortcode, and reconstructs a fixed canonical destination (`https://www.instagram.com/p/${shortcode}/`).
3. **Stateless Backend**: The backend is a stateless proxy that retains no user session logs, IP history, or media files.

---

## 2. Server-Side Request Forgery (SSRF) Protection

### Attack Surface Analysis

Media download utilities often suffer from SSRF when attackers supply URLs pointing to internal infrastructure:
- Cloud metadata services (e.g. `http://169.254.169.254/latest/meta-data/`)
- Loopback addresses (`http://127.0.0.1`, `http://localhost`)
- Private RFC 1918 subnets (`http://10.0.0.0/8`, `http://172.16.0.0/12`, `http://192.168.0.0/16`)
- DNS rebinding attacks and lookalike domain spoofing

### Implemented Defense Layers

```
User URL Input
      │
      ▼
[1. WHATWG URL Parsing] ──► Fails if malformed
      │
      ▼
[2. Protocol Enforcement] ──► Rejects non-HTTPS (blocks http://, file://, gopher://)
      │
      ▼
[3. Credential Rejection] ──► Rejects embedded credentials (user:pass@host)
      │
      ▼
[4. Port Enforcement] ──► Strictly enforces port 443 (blocks internal port scanning)
      │
      ▼
[5. Strict Hostname Allowlist] ──► Exact match or valid subdomain of:
      │                           instagram.com, cdninstagram.com, instagr.am
      ▼
[6. Path & Shortcode Filter] ──► Matches only /p/, /reel/, /tv/ with [a-zA-Z0-9_-]+
      │
      ▼
[7. Canonical URL Synthesis] ──► Reconstructed as https://www.instagram.com/p/<shortcode>/
```

---

## 3. Lookalike Domain & Homograph Protection

- **Suffix lookalike rejection**: An attacker URL such as `https://instagram.com.attacker.com/p/123/` is parsed with hostname `instagram.com.attacker.com`. The allowlist check verifies:
  `hostname === allowed || hostname.endsWith(`.${allowed}`)`.
  Since `instagram.com.attacker.com` does not end with `.instagram.com`, it is blocked.
- **Prefix lookalike rejection**: `https://evil-instagram.com/p/123/` does not match and is blocked.
- **Internationalized Domain Name (IDN) Cyrillic Spoofs**: WHATWG URL parsing normalizes non-ASCII characters to punycode (`xn--...`), which fails the allowlist check and is rejected.
- **Trailing Dot Normalization**: Hostnames with trailing dots (`instagram.com.`) are normalized via `.replace(/\.+$/, '')` before validation.

---

## 4. Rate Limiting & Resource Caps

| Parameter | Configuration | Purpose |
|---|---|---|
| **Rate Limit Window** | 60,000 ms (1 minute) | Prevents volumetric denial-of-service |
| **Max Requests per IP** | 30 requests / window | Enforces polite client behavior |
| **Resolver Timeout** | 10,000 ms | Prevents hanging upstream connections |
| **Max Response Size** | 52,428,800 bytes (50 MB) | Prevents memory exhaustion attacks |

---

## 5. Safe Error Handling & Information Disclosure

All Fastify routes are wrapped with a centralized error handler:
- Never emits stack traces to client replies in production.
- Translates internal errors into standardized classified codes:
  - `PRIVATE_ACCOUNT`: Target post requires authentication.
  - `UNSUPPORTED_URL`: Malformed or non-allowlisted target.
  - `RATE_LIMITED`: Volumetric throttle triggered.
  - `PROVIDER_ERROR`: Upstream network or extraction error.
  - `TIMEOUT`: Request exceeded threshold.
  - `NETWORK_ERROR`: Connection dropped or refused.

---

## 6. Security Regression Test Suite

All security protections are validated in automated tests in `backend/src/server.test.ts`:

- `POST /api/resolve` rejects disallowed external domains (`attacker.example.com`).
- `POST /api/resolve` rejects lookalike suffix domains (`instagram.com.attacker.com`).
- `POST /api/resolve` rejects prefix lookalike domains (`evil-instagram.com`).
- `POST /api/resolve` rejects embedded authentication credentials (`admin:secret@...`).
- `POST /api/resolve` rejects non-standard ports (`:8443`).
- `POST /api/resolve` blocks unencrypted HTTP requests (`http://...`).
- `POST /api/resolve` blocks loopback and private IP addresses (`127.0.0.1`, `169.254.169.254`, `10.0.0.1`, `localhost`).
