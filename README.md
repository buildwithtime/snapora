# Snapora ⚡

> **Modern, secure, open-source multi-URL media downloader queue**

[![CI](https://github.com/snapora/snapora/actions/workflows/ci.yml/badge.svg)](https://github.com/snapora/snapora/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)
[![Fastify](https://img.shields.io/badge/Fastify-4-black.svg)](https://fastify.dev/)

---

> [!NOTE]
> **PREVIEW RELEASE & TRANSPARENCY NOTICE**: Snapora is an open-source technical preview (`v0.1.0-preview`). To comply with platform Terms of Service and preserve a strict **Zero-Credential** privacy architecture, the application operates against a **deterministic MockProvider** with simulated media fixtures (`picsum.photos` and public sample MP4s). It does **not** scrape, harvest, or download real media from Instagram servers.

---

Snapora is an open-source, client-first media utility engineered for reliability, safety, and transparency. It provides an intuitive queue state machine capable of processing multiple public Instagram URLs sequentially, with IndexedDB persistence, SSRF-safe upstream resolution, and zero credential storage.

---

## ✨ Core Capabilities

- **Sequential Multi-URL Queue**: Add multiple URLs at once (newline-separated or single entry) and process them sequentially with pause, resume, retry, and cancellation controls.
- **Client-Side Persistence**: Queue state and job history persist in your browser's IndexedDB, keeping your data entirely local.
- **Standalone Demo Mode**: Can be deployed as a 100% static client on GitHub Pages without requiring a deployed backend server.
- **Privacy & Security First**:
  - **Zero Credential Collection**: No Instagram logins, sessions, or passwords needed or stored.
  - **SSRF Defenses**: Server-side allowlist filtering, strict HTTPS enforcement, response size limits, and redirect validation.
  - **No User Tracking**: Stateless backend proxy; zero user database or persistent server telemetry.
- **Extensible Architecture**: Clean `IMediaProvider` abstraction separating interface contracts from provider resolution engines.
- **Responsive & Modern UI**: Built with React 19, TypeScript, and modern dark-mode CSS design tokens.

---

## 🏗️ Architecture

Snapora uses a decoupled architecture designed for static deployment and stateless safety:

```
┌────────────────────────────────────────────────────────┐
│                   Snapora Frontend                     │
│  (React 19 + TypeScript + Vite + IndexedDB)            │
│  • Queue State Machine (Concurrency = 1)               │
│  • Client-side URL normalization & duplicate detection │
│  • Standalone Demo Resolver (Mock Provider)            │
│  • In-browser download triggers                        │
└───────────────────────────┬────────────────────────────┘
                            │
                            │ Optional: HTTP POST /api/resolve
                            ▼
┌────────────────────────────────────────────────────────┐
│                   Snapora Backend                      │
│  (Node.js + Fastify + TypeScript)                      │
│  • Strict Hostname Allowlist Check                     │
│  • SSRF Shield & Embedded Credential Rejection         │
│  • Rate Limiting & Timeout Controls                    │
│  • Provider Resolvers (Mock / Public Extractor)        │
└────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) >= 20.x
- npm >= 10.x

### Installation

```bash
git clone https://github.com/snapora/snapora.git
cd snapora
npm install
```

### Running Locally

```bash
# Starts both frontend (:5173) and backend (:3001) concurrently
npm run dev
```

Visit [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🧪 Testing & Validation

```bash
# Run unit & integration tests across all workspaces
npm test

# Run TypeScript typechecks
npm run typecheck

# Build for production
npm run build
```

---

## 📱 Manual Smoke Tests (Desktop & Mobile)

To quickly verify core functionality manually:
1. **Homepage Load**: Open `http://localhost:5173`. Confirm the header status shows `Engine Idle` and stat counters read `0`.
2. **Batch Paste**: Click the **"Load Sample URLs"** button. Confirm three URLs populate the input area.
3. **Queue Execution**: Click **"Add to Queue"**. Observe the feedback banner ("Added 3 URLs to queue").
4. **Sequential Processing**: Watch the jobs progress one-by-one from `Queued` to `Resolving` to `✓ Ready`.
5. **Downloads**: Click **"Download"** on a completed item to verify the browser save action triggers.
6. **Persistence**: Refresh the browser page. Confirm all completed and pending jobs reload from IndexedDB.
7. **Controls**: Test **Pause Queue**, **Resume Queue**, and **Clear Completed**.

---

## 📁 Repository Structure

```
snapora/
├── backend/            # Fastify REST API proxy
│   ├── src/
│   │   ├── config/     # Environment & allowlist configuration
│   │   ├── providers/  # IMediaProvider implementations (Mock, Types)
│   │   ├── routes/     # Fastify API routes (/api/resolve, /api/health)
│   │   └── utils/      # SSRF filters, URL sanitizers, error codes
│   └── tsconfig.json
├── frontend/           # React + Vite application
│   ├── src/
│   │   ├── components/ # QueueBoard, UrlInput, JobCard, Controls
│   │   ├── context/    # QueueContext state machine & reducer
│   │   ├── types/      # QueueJob, Provider, and UI types
│   │   └── utils/      # URL validator, IndexedDB storage, mock resolver
│   └── vite.config.ts
├── docs/               # Architecture, Security, Roadmap & Audit Docs
│   ├── ARCHITECTURE_DECISIONS.md
│   ├── DEPLOYMENT_PLAN.md
│   ├── END_TO_END_TEST_PLAN.md
│   ├── MEDIA_PROVIDER_STATUS.md
│   ├── PRODUCTION_READINESS_AUDIT.md
│   ├── RELEASE_READINESS_REPORT.md
│   └── SECURITY_REVIEW.md
├── LICENSE             # MIT License
├── CONTRIBUTING.md     # Contributor Guidelines
├── SECURITY.md         # Vulnerability Disclosure Policy
└── README.md
```

---

## 🔒 Security & Disclosure

Please review [SECURITY.md](SECURITY.md) for vulnerability reporting guidelines and defense-in-depth specifications.

## 🤝 Contributing

Contributions are welcome! Please review [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## 📄 License

This project is licensed under the [MIT License](LICENSE).
