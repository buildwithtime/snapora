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

- **Base Path**: Configured as relative (`base: './'`) in `frontend/vite.config.ts`. The compiled bundle works seamlessly in root domains (`https://snapora.app`) or repository subpaths (`https://user.github.io/snapora/`) without broken asset links.
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
| `RESOLVER_TIMEOUT_MS` | `10000` | Upstream provider timeout in milliseconds |
| `MAX_RESPONSE_SIZE_BYTES` | `52428800` | Max upstream response size (50MB) |
| `CORS_ORIGIN` | `https://your-frontend.github.io` | Allowed frontend origin(s) |
