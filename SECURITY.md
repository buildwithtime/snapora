# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

The Snapora maintainers take security and privacy seriously. If you discover a vulnerability, please report it responsibly:

1. **Do not open a public issue.**
2. Send an email to the repository maintainers or use GitHub's private vulnerability reporting feature.
3. Include clear steps to reproduce the issue, details of the affected environment, and any potential remediation.
4. You will receive an initial response within 48 hours.

## Security Architecture Principles

- **Zero Credential Storage**: Snapora never collects, stores, or handles user platform passwords, cookies, or session tokens.
- **SSRF Defenses**: The backend strictly validates upstream hostnames against an allowlist, enforces HTTPS protocols, caps response body sizes (50MB), limits redirects (max 2), and rejects internal/private IP ranges.
- **Client-Side Queue**: Queue metadata and downloaded media remain in the user's browser (IndexedDB and memory). No server-side tracking, analytics, or user logs are retained.
