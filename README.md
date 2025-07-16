# dny.li URL Shortener

A fast URL shortener with Cloudflare Workers backend and Chrome extension frontend.

## What It Does

- **Backend**: Cloudflare Worker that redirects `dny.li/<slug>` to target URLs.
- **Chrome Extension**: Side panel for creating short URLs from any webpage.
- **Admin Interface**: Web interface for managing URLs at `dny.li/admin`.

## Architecture

```
├── src/                   # Cloudflare Worker (backend)
│   ├── index.ts          # Main router and redirect logic
│   ├── admin.ts          # Admin interface and API endpoints
│   └── types.ts          # TypeScript interfaces
├── chrome-extension/      # Chrome extension (frontend)
│   ├── manifest.json     # Extension config
│   ├── side-panel.html   # Main UI
│   ├── side-panel.js     # Logic and API calls
│   └── background.js     # Service worker
├── tests/                # Test suite
├── data/                 # Backup storage
└── .github/workflows/    # GitHub Actions
    └── backup.yml        # Weekly backup workflow
```

## How It Works

1. **Cloudflare Worker** runs at `dny.li` handling:

   - Redirects: `GET /slug` → target URL
   - Admin UI: `GET /admin` → management interface
   - API: `POST /admin/urls` → create URLs

2. **Chrome Extension** provides:

   - Side panel that auto-fills current page URL
   - Smart slug generation from page titles
   - One-click URL creation with clipboard copy
   - Browse existing URLs

3. **Data Storage**:
   - URLs stored in Cloudflare KV (key-value store)
   - Weekly backups to GitHub via automated workflow

## Development

### Worker Setup

```bash
# Install dependencies
npm install

# Set up KV namespaces (one-time)
wrangler kv:namespace create "URLS_KV"
wrangler kv:namespace create "URLS_KV" --preview

# Set API secret
wrangler secret put API_SECRET

# Run locally
npm run dev
```

### Chrome Extension Setup

1. Load unpacked extension from `chrome-extension/` folder
2. Enter API token in settings (same as API_SECRET)
3. Use from any webpage

### Testing

```bash
npm test          # Run all tests
npm run typecheck # Check TypeScript
```

## Deployment

```bash
npm run deploy    # Deploy to Cloudflare
```

## Required Setup

- **Cloudflare KV namespace** for URL storage
- **API_SECRET** environment variable
- **GitHub secret** `WORKER_URL` for backups
