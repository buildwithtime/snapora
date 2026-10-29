# REA INVESTIGATION PLAN: INSTAGRAM MEDIA RETRIEVAL WORKFLOWS

**Investigation Title**: Reverse-Engineering Instagram Media Retrieval Workflows & Reference Architecture Analysis  
**Analyst**: Senior Reverse Engineer, Android Application Analyst, Protocol Researcher & Software Architect  
**Framework**: Reverse Engineering Anything (REA) `rea-agents@6.7.0` (Skill v42, 207 Tools)  
**Target Repository**: Snapora (`https://github.com/buildwithtime/snapora`)  
**Date**: October 28, 2026  

---

## 1. Research Objectives & Scope

Snapora currently implements an open-source, client-first media queue engine with IndexedDB persistence, SSRF protection, a deterministic MockProvider, and an official Meta oEmbed Live-Preview Provider (`InstagramOEmbedProvider`).

The objective of this investigation is to:
1. Examine how commercial, established reference applications (specifically **4K Stogram** and **Snapinsta**) discover, resolve, and extract Instagram media metadata and binary files.
2. Separate verified primary evidence, vendor claims, community reports, and technical inferences.
3. Rigorously evaluate official Meta APIs (oEmbed, Graph API, User Media) to identify legally compliant, authorized media retrieval pathways.
4. Synthesize an evidence-backed 15-stage media retrieval pipeline model.
5. Provide actionable architectural recommendations for Snapora without adopting unsafe, scraping-based, or Terms-of-Service-violating mechanisms.

---

## 2. Evidence Standards & Classification Schema

To ensure strict engineering integrity, every claim in this research is classified using REA's four-tier evidence hierarchy:

| Classification | Definition | Verification Criteria |
| :--- | :--- | :--- |
| **`VERIFIED`** | Direct, indisputable primary evidence. | Directly observed via local application binaries, DLL manifests, runtime logs, inspected file headers (e.g. `FBMD` magic bytes), or reproducible REA tool execution. |
| **`DOCUMENTED`** | Explicitly stated in vendor or platform documentation. | Sourced from official vendor product pages, Meta Developer documentation, JSON-LD schemas, or user manuals. |
| **`INFERRED`** | High-probability technical deduction. | Logical architectural hypothesis supported by indirect evidence (e.g. anti-bot behavior, HTTP status codes, network patterns). |
| **`UNKNOWN`** | Insufficient or inaccessible evidence. | Areas where internal implementation details cannot be observed without unauthorized actions. Explicitly labeled to avoid conjecture. |

---

## 3. Investigation Methodology & Phased Sequence

```
┌────────────────────────────────────────────────────────┐
│ Phase 1: REA Environment & Baseline Inspection         │
│ • Verify local REA tools, MCP status, and methodology  │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ Phase 2: 4K Stogram Deep Dive (Local Binary + Logs)    │
│ • Local binary inspection (Qt5, FFmpeg, LibExif)       │
│ • Primary runtime log analysis (igp Android spoofing)  │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ Phase 3: Snapinsta Deep Dive (Web/APK + File Artifacts)│
│ • Downloaded media inspection (Facebook FBMD headers)  │
│ • Cloud architecture & proxy rotation analysis         │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ Phase 4: 15-Stage Media Retrieval Pipeline Model       │
│ • Systematically classify every stage with evidence    │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ Phase 5: Official Meta API Capability Assessment       │
│ • Instagram oEmbed vs. Graph API User Media endpoints  │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ Phase 6: Safe & Authorized Reverse-Engineering Rules   │
│ • Strict boundaries against scraping/session theft     │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ Phase 7: Snapora Architectural Recommendations         │
│ • Comparative matrix & modular component roadmap       │
└────────────────────────────────────────────────────────┘
```

---

## 4. Local Tools & Environment Verification

* **REA Package**: `rea-agents@6.7.0` (Verified via `npx rea-agents@6.7.0 --version`).
* **MCP Integration**: Responding via native `binary_session` protocol.
* **Host Environment**: Windows 11 x64, Node.js v22.20.0, npm 10.9.3.
* **Local Reference Artifacts Discovered**:
  * **4K Stogram**: Installed at `C:\Program Files\4KDownload\4kstogram` (`4kstogram.exe`, v4.5.0 / v4.9.0).
  * **4K Stogram Runtime Logs**: Active log directory at `C:\Users\rpanw\AppData\Local\4kdownload.com\4K Stogram\4K Stogram\app_*.log`.
  * **Snapinsta Samples**: Real downloaded media files located in `C:\Users\rpanw\Downloads\SnapInsta.to_*_n.jpg`.

---

## 5. Ethical & Legal Safeguards

* **No Credential Interception**: No user passwords, session cookies, or authorization tokens are harvested or exfiltrated.
* **No Access Control Circumvention**: No anti-bot protections, CAPTCHAs, Cloudflare WAF challenges, or private account walls are bypassed.
* **No Production Code Disruption**: Snapora repository code is preserved in its working release state.
* **Separation of Previews from Downloads**: Clear distinction maintained between official metadata/embeds and binary downloads.
