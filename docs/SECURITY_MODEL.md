# Snapora Security Model & Threat Defense Architecture

**Document Version:** 1.0.0  
**Status:** Implemented & Verified  
**Scope:** Frontend (React 19), Backend (Fastify), and Media Download Pipeline

---

## 1. Threat Matrix & Defense Strategy

Snapora is designed according to the principle of defense-in-depth, prioritizing user account safety, server network boundary integrity, and binary file authenticity.

| Threat Scenario | Risk Level | Attack Vector | Snapora Defense Mechanism | Verification Reference |
| :--- | :--- | :--- | :--- | :--- |
| **Server-Side Request Forgery (SSRF)** | Critical | Malicious user supplies URL targeting internal VPC hosts, cloud metadata (`169.254.169.254`), or localhost (`127.0.0.1`). | Socket-level DNS pre-resolution blocks all private RFC1918 subnets, link-local, loopback, multicast, and cloud metadata IPs for both IPv4 and IPv6 before connecting. | `backend/src/utils/ssrf.ts` & `backend/src/utils/ssrf.test.ts` |
| **DNS Rebinding & TOCTOU** | High | Attacker resolves domain to public IP during validation, then changes DNS to internal IP during HTTP request. | Pre-flight DNS validation resolves all target IP addresses. Redirects are handled manually (up to 3) and each destination IP is re-asserted against the blocklist. | `backend/src/routes/download.ts` |
| **HTML / Script Injection via Renamed Files** | High | Upstream server returns an HTML error page or phishing script with `.jpg` or `.mp4` extension. | Binary magic-byte validation inspects first bytes of stream: verifies JPEG SOI (`FF D8 FF`), MP4 `ftyp` box, or WebP `RIFF/WEBP`. Immediately rejects HTML, XML, or text bodies. | `backend/src/utils/mediaValidator.ts` & `mediaValidator.test.ts` |
| **Instagram Account Checkpoints & Bans** | Catastrophic | Scraping tools log in with user passwords, triggering Meta fraud detection and account lockouts. | **Zero Credential Collection**: Snapora never prompts for or stores Instagram usernames/passwords. Previews use official oEmbed; creator downloads use official OAuth 2.0. | `docs/rea_research/4K_STOGRAM_ANALYSIS.md` |
| **Path Traversal on Media Downloads** | Medium | User or upstream sends malicious `filename` parameter containing `../../etc/passwd`. | Filenames are strictly sanitized: all directory separators (`/`, `\`), control characters, and special symbols are stripped or replaced with underscores. | `backend/src/routes/download.ts` |
| **Resource Exhaustion / Large Payload Flooding** | Medium | Attacker supplies link to multi-gigabyte stream to exhaust server memory. | Configurable `MAX_RESPONSE_SIZE_BYTES` (50MB default) is checked against `Content-Length` and enforced dynamically during streaming with stream abort. | `backend/src/routes/download.ts` & `backend/src/config/index.ts` |

---

## 2. SSRF IP Blocklist Specification

Before making any outbound HTTP connection, `assertSafeDestinationHost` performs DNS lookup and validates that none of the returned addresses fall into prohibited ranges:

### IPv4 Prohibited Address Blocks
- `0.0.0.0/8` (Current network)
- `10.0.0.0/8` (Private RFC 1918)
- `100.64.0.0/10` (Carrier-grade NAT)
- `127.0.0.0/8` (Loopback)
- `169.254.0.0/16` (Link-local & AWS/GCP/Azure Cloud Metadata `169.254.169.254`)
- `172.16.0.0/12` (Private RFC 1918)
- `192.0.0.0/24` (IETF protocol assignments)
- `192.0.2.0/24` (TEST-NET-1)
- `192.168.0.0/16` (Private RFC 1918)
- `198.18.0.0/15` (Network benchmark testing)
- `198.51.100.0/24` (TEST-NET-2)
- `203.0.113.0/24` (TEST-NET-3)
- `224.0.0.0/4` (Multicast)
- `240.0.0.0/4` (Reserved for future use)
- `255.255.255.255` (Broadcast)

### IPv6 Prohibited Address Blocks
- `::1` (IPv6 Loopback)
- `::` (Unspecified address)
- `fe80::/10` (Link-local)
- `fc00::/7` (Unique-local RFC 4193)
- `ff00::/8` (Multicast)
- `2001:db8::/32` (Documentation)
- `::ffff:0:0/96` (IPv4-mapped IPv6 addresses are unpacked and checked against the IPv4 blocklist)

---

## 3. Media Magic Byte Verification Rules

To prevent server and client compromise from malicious MIME type spoofing:
1. **JPEG Image**:
   - Offset `0x00..0x02` must strictly match `FF D8 FF` (Start of Image marker).
2. **MP4 Video (ISO BMFF)**:
   - Offset `0x04..0x07` must strictly match ASCII `'ftyp'` (`0x66 0x74 0x79 0x70`).
3. **WebP Image**:
   - Offset `0x00..0x03` must match `'RIFF'` and offset `0x08..0x0B` must match `'WEBP'`.
4. **HTML/Script Detection**:
   - If the first 64 bytes contain `<!doctype html`, `<html`, `<?xml`, `{`, or `<script`, the download is immediately rejected with HTTP 422 Unprocessable Entity (`MEDIA_VALIDATION_FAILED`).

---

## 4. Secret Isolation & Zero-Knowledge Architecture

1. **No Client-Side Secrets**: Neither Meta App Secrets nor Client Tokens are bundled into Vite client builds.
2. **No Persistent Session Tokens in Storage**: Snapora avoids storing sensitive credentials in IndexedDB or localStorage.
3. **Safe Error Logging**: Server error handlers log structured diagnostics internally while scrubbing tokens and credentials from client HTTP responses.
