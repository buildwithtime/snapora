# REA CAPABILITY ASSESSMENT

## 1. REA Identity — VERIFIED

| Attribute | Value | Evidence |
|---|---|---|
| Tool name | Reverse Engineering Anything (REA) | `SKILL.md` frontmatter |
| Package | `rea-agents@6.7.0` | `rea --version` output |
| CLI paths | Global npm package (`rea`, `rea.cmd`) | `where rea` |
| MCP client registration | Local MCP client configuration (`mcp_config.json`) | `rea doctor --json` |
| Skill version | 42 | `rea doctor --json` identity block |
| MCP tool count | 207 | `rea doctor --json` catalog count |
| Node.js runtime | v22.20.0 | `node --version` |
| Host platform | win32 x64 | `rea doctor --json` |
| Live MCP server | Responding | `binary_session` call succeeded |

---

## 2. Analysis Engine Status — VERIFIED

| Engine | Status | Reason |
|---|---|---|
| Ghidra | Not configured | `GHIDRA_INSTALL_DIR` not set; Java path missing |
| Hopper | Unavailable | macOS only; win32 host unsupported |
| IDA | Not configured | `REA_IDA_MCP_CONFIG` not set |
| JADX | Not configured | `REA_JADX_MCP_JAR` not set |
| Kuna | Not configured | `REA_KUNA_COMMAND` not set |

> **Impact on Snapora research**: None. These engines are for native binary disassembly. Snapora is a web application; its reference products (SnapInsta, 4K Stogram) are web services, not locally-available native binaries to decompile.

---

## 3. Available Capabilities Relevant to Snapora Research

### 3.1 Browser and Web Inspection (Available, CDP Required)

| Tool | Availability | Note |
|---|---|---|
| `list_browser_targets` | Available | Needs browser with `--remote-debugging-port` |
| `inspect_web_page` | Available | Needs `cdp_endpoint` + `target_id` |
| `analyze_web_bundle` | Available | Needs browser target |
| `capture_web_screenshot` | Available | Needs browser target |
| `inspect_web_event_listeners` | Available | Needs browser target |
| `observe_web_session` | Available | Needs browser target |
| `inspect_web_network_capture` | Available | Needs browser target |

**Current sandbox limitation**: Playwright driver (v1.57.0) failed to install from CDN (HTTP 404 at `playwright.azureedge.net`). Browser tools could not be exercised. This is a **sandbox environment constraint**, not a REA defect.

**Resolution for future use**: Launch Chrome or Chromium with `--remote-debugging-port=9222` in a non-isolated environment, then call `list_browser_targets` to obtain target IDs.

### 3.2 JavaScript Application Analysis (Available)

| Tool | Availability | Applicable to Snapora |
|---|---|---|
| `analyze_javascript_application` | Available (electron-provider surface) | Yes — can analyze built JS bundles |
| `trace_javascript_semantics` | Available | Yes — for tracing queue logic |
| `compare_source_to_bundle` | Available | Yes — for verifying built output |
| `reconcile_javascript_runtime` | Available | Yes — for runtime/source reconciliation |
| `compare_javascript_export_shapes` | Available | Yes — for API shape comparison |
| `trace_application_feature` | Available | Yes — for feature-level tracing |
| `export_web_scripts` | Available | Yes |
| `recover_javascript_sources` | Available | Yes |

These tools are directly useful for analyzing Snapora's own **built application** once it exists, and can be used to analyze any public JavaScript bundles if a browser session becomes available.

### 3.3 Artifact and Package Inspection (Available)

| Tool | Availability | Applicable |
|---|---|---|
| `inspect_artifact` | Available | ZIP/package inspection |
| `extract_artifact` | Available | Archive extraction |
| `inspect_managed_artifact` | Available | .NET PE inspection |
| `inspect_managed_members` | Available | .NET member metadata |

### 3.4 Evidence and Session Management (Available)

| Tool | Availability |
|---|---|
| `binary_session` | Available — VERIFIED |
| `build_call_path` | Available |
| `compare_artifacts` | Available |
| `export_evidence_bundle` | Available |
| `inspect_analysis_view` | Available |

---

## 4. Capabilities Used in This Research Phase

| Tool | Invoked | Result |
|---|---|---|
| `binary_session` | Yes | Confirmed live server; enumerated all capability groups |
| `inspect_web_page` | Attempted | Failed — no CDP endpoint |
| `capture_web_screenshot` | Not attempted (no CDP) | N/A |
| `analyze_web_bundle` | Not attempted | N/A |

---

## 5. REA Capability Summary for Snapora Project

| Phase | REA Capability | Available Now | Available with CDP |
|---|---|---|---|
| Reference site inspection | Browser tools | No | Yes |
| JavaScript bundle analysis | JS analysis tools | Yes (for local files) | Yes (for live pages) |
| Snapora own-app analysis | JS + bundle tools | Yes (post-build) | Yes |
| Security audit of built app | Trace + compare tools | Yes (post-build) | Yes |
| Version comparison | `compare_application_versions` | Yes | Yes |

---

## 6. Recommendations

1. **For SnapInsta inspection**: When a live browser environment is available, use `list_browser_targets` → `inspect_web_page` with `include_script_sources: true` to analyze client-side form validation, URL regex patterns, and network request shapes.
2. **For Snapora own-app audit**: After build, use `analyze_javascript_application` on the bundled output to verify queue state machine logic, security boundaries, and absence of credential-handling code.
3. **For version comparison**: Use `compare_application_versions` after each significant release to detect behavioral regressions.
4. **Do not install missing analysis engines** (Ghidra, IDA, etc.) for this project — they are not required.

---

*Last updated: 2026-10-28*
