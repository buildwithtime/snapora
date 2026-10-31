## Description

<!-- Provide a concise explanation of the changes introduced by this pull request. -->

## Type of Change

- [ ] `feat`: New feature or user-facing capability
- [ ] `fix`: Bug fix or error resolution
- [ ] `docs`: Documentation addition or update
- [ ] `refactor`: Internal code restructuring without behavioral change
- [ ] `perf`: Performance optimization
- [ ] `test`: New or updated automated tests
- [ ] `chore`: Dependency updates, build configs, or CI adjustments

## Related Issue / Ticket

Fixes # <!-- Link related issue if applicable -->

## Verification Checklist

Please verify that all quality checks pass locally prior to submission:

- [ ] `npm test` passes with 0 failures across both workspaces (frontend & backend).
- [ ] `npm run typecheck` passes with 0 TypeScript diagnostics.
- [ ] `npm run lint` passes with 0 linter warnings or errors.
- [ ] `npm run build` compiles production distributions cleanly.
- [ ] `git diff --check` emits zero whitespace or formatting errors.

## Security & Architecture Integrity

- [ ] **SSRF Filters Maintained**: Strict DNS pre-flight checks blocking private, loopback, link-local, and cloud metadata IPs (`169.254.169.254`).
- [ ] **CORS Hardened**: No wildcard (`*`) CORS origins in production configurations.
- [ ] **Binary Magic-Byte Inspection**: MIME signatures validated for image (JPEG) and video (MP4/WebM) payloads.
- [ ] **Zero Credential Collection**: No user platform credentials, session cookies, or passwords requested or handled.
- [ ] **Standardized Ceilings**: Respects `MAX_PROFILE_ITEMS` (500) and `MAX_ZIP_ITEMS` (50).
