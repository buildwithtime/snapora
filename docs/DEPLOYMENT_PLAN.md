# DEPLOYMENT PLAN — SNAPORA

## 1. Architectural Separation

Snapora adopts a decoupled deployment model designed for zero-cost static hosting of the client interface combined with a lightweight, stateless containerized backend proxy:

```
┌───────────────────────────────────────────────┐
│              GitHub Pages / CDN               │
│          Static Frontend SPA (React)          │
│    Built with: base: './', VITE_API_BASE_URL  │
└───────────────────────┬───────────────────────┘
                        │
                        │ HTTPS (POST /api/resolve)
                        ▼
┌───────────────────────────────────────────────┐
│          Render / Fly.io / Cloud Run          │
│          Stateless Backend API (Fastify)      │
│    SSRF Shield, Rate Limiting, Mock Provider  │
└───────────────────────────────────────────────┘
```

---

## 2. Frontend Static Deployment (GitHub Pages)

### Configuration

- **Base Path**: Configured as relative (`base: './'`) in `frontend/vite.config.ts`. The compiled bundle works seamlessly in root domains (such as `https://snapora-1r3i.onrender.com/`) or repository subpaths (`https://user.github.io/snapora/`) without broken asset links.
- **Routing**: Single-page application without server-side rewrites. All queue state is managed locally via React Context and IndexedDB.
- **API Base URL**: Configured via the `VITE_API_BASE_URL` environment variable during CI build:
  ```bash
  VITE_API_BASE_URL=https://api.snapora.example.com npm run build --workspace=frontend
  ```

### GitHub Actions Deployment Workflow (`.github/workflows/deploy-pages.yml`)

```yaml
name: Deploy Frontend to GitHub Pages

on:
  push:
    branches: [ master ]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'npm'
      - run: npm ci
      - run: npm run build --workspace=frontend
        env:
          VITE_API_BASE_URL: ${{ secrets.PROD_API_BASE_URL }}
      - uses: actions/upload-pages-artifact@v3
        with:
          path: 'frontend/dist'
      - id: deployment
        uses: actions/deploy-pages@v4
```

---

## 3. Backend Deployment (Containerized Node.js)

### Recommended Platforms

- **Render** (Web Service, Node environment or Docker)
- **Fly.io** (`fly launch` using Dockerfile)
- **Railway** / **Google Cloud Run**

### Containerfile (`backend/Dockerfile`)

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY backend/package*.json ./backend/
RUN npm ci
COPY backend ./backend
RUN npm run build --workspace=backend

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/backend/package*.json ./backend/
RUN npm ci --omit=dev
COPY --from=builder /app/backend/dist ./backend/dist

EXPOSE 3001
CMD ["node", "backend/dist/index.js"]
```

### Production Environment Variables

| Variable | Recommended Value | Purpose |
|---|---|---|
| `NODE_ENV` | `production` | Enables production optimizations and disables debug logs |
| `PORT` | `3001` or provided by host | Listening port |
| `HOST` | `0.0.0.0` | Container bind address |
| `RATE_LIMIT_MAX` | `30` | Per-IP requests per minute |
| `ALLOWED_HOSTNAMES` | `instagram.com,www.instagram.com,cdninstagram.com,instagr.am` | Upstream SSRF allowlist |
| `DEFAULT_PROVIDER` | `mock` or `oembed` | Active resolution engine (`oembed` for live Meta API) |
| `INSTAGRAM_APP_ID` | `your_app_id` | Meta Developer App ID (Required for `oembed` mode) |
| `INSTAGRAM_CLIENT_TOKEN` | `your_client_token` | Meta Developer Client Token (Required for `oembed` mode) |
| `INSTAGRAM_OEMBED_ACCESS_TOKEN` | `${app_id}\|${client_token}` | Optional direct composite App Access Token |
| `RESOLVER_TIMEOUT_MS` | `15000` | Upstream provider timeout in milliseconds |
| `MAX_RESPONSE_SIZE_BYTES` | `157286400` | Max upstream response size (150MB) |
| `CORS_ORIGIN` | `https://snapora-1r3i.onrender.com` | Allowed frontend production origin (defaults strictly to Render domain in production) |
| `CORS_PREVIEW_ORIGINS` | `https://preview.example.com` | Optional comma-delimited list of approved pull-request preview domains |

---

## 4. Production Release & Rollback Strategy

Snapora utilizes an immutable, audit-compliant release and rollback workflow for Render deployments.

### A. Zero-Downtime Rollback via Render Deployment History (Primary)

Render retains an immutable build artifact history for every successful deployment:

1. Open the **Render Dashboard** for the `snapora` service.
2. Navigate to the **Deploys** tab.
3. Locate the previous known-good deployment (e.g. the deployment corresponding to release `v0.2.0` / commit `f320005`).
4. Click the three-dots context menu on that deploy and select **Rollback to this deploy**.
5. Render immediately diverts network traffic to the previously compiled, verified container image without re-building or touching Git pointers.

### B. Rollback via Known-Good Git Commit

If a code-level hotfix or redeployment is required:

1. Identify the known-good base commit:
   * **v0.2.0 Release**: `f320005d0d1f92588a1ff63ad48e9e70a173ef11`
   * **Base Audit Commit**: `592b03d0d8bbec35f639ae53578bb7f7f45c26b5`
2. Create a clean rollback branch directly from the known-good commit:
   ```bash
   git checkout -b hotfix/rollback-to-v0.2.0 f320005
   ```
3. Alternatively, create a forward revert commit on the active branch:
   ```bash
   git revert -m 1 <release-merge-commit-sha>
   ```
4. Never force-push (`git push -f`) or rewrite public Git branch history.

### C. Immutable Release Tags Policy

Release tags (`v0.1.0`, `v0.2.0`, `v0.3.0`, etc.) serve as immutable cryptographic audit checkpoints:

* **Strict Prohibition of Tag Rewriting**: Release tags must **never** be deleted, moved, or updated with `-f` (`git tag -f` and `git push --delete <tag>` are strictly forbidden).
* **Forward-Only Patch Progression**: If a defect is discovered in a published tag (e.g. `v0.3.0`), a new corrective patch release tag (e.g. `v0.3.1`) must be created pointing to the remedial commit. This preserves auditability across all production deployments and package registries.
