# Security Policy

## Supported Versions

| Version | Supported          | Status |
| :--- | :---: | :--- |
| `0.3.x` | :white_check_mark: | Active production release; fully supported |
| `0.2.x` | :warning: | Maintenance; critical security patches only |
| `0.1.x` | :x: | End of life; unsupported |

---

## Reporting a Vulnerability

The Snapora maintainers take application security and user privacy seriously. If you discover a security vulnerability, please report it responsibly:

1. **Do not open a public issue.** Public issues disclose attack vectors prematurely.
2. **Submit via GitHub Private Vulnerability Reporting**:
   - Navigate to the repository's **[Security](https://github.com/buildwithtime/snapora/security)** tab.
   - Click **Report a vulnerability** under **Advisories**.
   - Provide a detailed summary, reproducible steps (or proof-of-concept), affected components, and potential remediation.
3. You will receive an acknowledgment within 48 hours, followed by triage and remediation updates.

---

## What Qualifies as a Security Vulnerability

Please distinguish between **actual security vulnerabilities** and **Instagram platform access limitations**:

### Qualifies as a Security Vulnerability (Report Privately):
- Server-Side Request Forgery (SSRF) filter bypasses allowing access to loopback, RFC1918 subnets, link-local, or cloud metadata IP addresses (`169.254.169.254`).
- Remote code execution, prototype pollution, or memory corruption vectors.
- Cross-Site Scripting (XSS) or HTML injection in frontend media captions or metadata.
- Path traversal, directory escape, or arbitrary file overwrite during ZIP export or download filename generation.
- Production CORS origin bypasses allowing unauthorized cross-origin credential access.

### Does NOT Qualify as a Security Vulnerability (Expected Platform Boundaries):
- **Instagram Login Walls & Bot Challenges**: Receiving HTTP 403 (`LOGIN_WALL_ENCOUNTERED`) or empty React SPA shells when querying public posts or profiles without cookies is normal platform anti-scraping behavior by Instagram, not a defect or vulnerability in Snapora.
- **Private Account Rejections**: Snapora deliberately does not download private Instagram media.
- **Upstream Rate Limiting (HTTP 429)**: Throttling by Instagram's CDN or web endpoints is an expected network condition.

---

## Security Architecture & Defense-in-Depth

- **Zero Credential Storage**: Snapora never collects, stores, or handles user platform passwords, cookies, or session tokens.
- **SSRF Defenses**: The backend strictly validates upstream hostnames against an allowlist, enforces HTTPS protocols, caps response body sizes (150 MB default ceiling), limits redirects (max 2), and resolves DNS to verify socket IPs are not in private or reserved ranges before connecting.
- **MIME Magic-Byte Verification**: Media payloads are checked for genuine binary headers (JPEG `FF D8 FF`, MP4 `ftyp`, WebM `1A 45 DF A3`) before being delivered to users or packaged into archives.
- **Client-Side Queue & Local Isolation**: Queue metadata and downloaded media remain in the user's browser (IndexedDB and memory). No server-side tracking, analytics, or user logs are retained.
