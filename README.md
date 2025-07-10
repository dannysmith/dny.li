# URL Shortener Service

A fast, secure URL shortener built with Cloudflare Workers that redirects `s.danny.is/<slug>` to target URLs.

## Features

- **Fast Global Redirects**: Sub-20ms responses via Cloudflare's edge network
- **Social Media Support**: Serves rich preview metadata to social crawlers
- **Admin Interface**: Clean web interface for URL management
- **API Access**: REST API for programmatic URL management
- **Auto Slugs**: Generates readable slugs like "brave-blue-elephant"
- **Security**: Blocks dangerous URLs and implements rate limiting
- **Backups**: Automated daily backups to GitHub

## Project Structure

```
├── src/
│   ├── index.ts    # Main router and core logic
│   ├── admin.ts    # Admin interface and API
│   └── types.ts    # TypeScript interfaces
├── .github/workflows/
│   └── backup.yml  # Automated backup workflow
├── data/
│   └── urls-backup.json  # Backup storage
└── wrangler.toml   # Cloudflare configuration
```

## Development

### Local Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure Cloudflare (one-time setup):
   ```bash
   # Create KV namespaces
   wrangler kv:namespace create "URLS_KV"
   wrangler kv:namespace create "URLS_KV" --preview
   
   # Update wrangler.toml with the returned IDs
   
   # Set API secret
   wrangler secret put API_SECRET
   ```

3. Start development server:
   ```bash
   npm run dev
   ```

### Testing Locally

The service runs at `http://localhost:8787` with these endpoints:

- `GET /` - Landing page
- `GET /{slug}` - Redirect to target URL
- `GET /admin` - Admin interface
- `GET /health` - Health check

### API Endpoints

**Authentication**: Include `Authorization: Bearer <API_SECRET>` header

- `POST /admin/urls` - Create URL
- `PUT /admin/urls/{slug}` - Update URL  
- `DELETE /admin/urls/{slug}` - Delete URL
- `GET /all.json` - List all URLs (public)

## Deployment

1. Deploy to Cloudflare:
   ```bash
   npm run deploy
   ```

2. Configure custom domain in Cloudflare Workers dashboard

3. Set up GitHub secrets for backups:
   - `WORKER_URL`: Your worker URL (e.g., `https://s.danny.is`)

## Manual Setup Required

After deploying the code, you'll need to:

1. **Create KV namespace** in Cloudflare dashboard
2. **Set API_SECRET** environment variable
3. **Configure custom domain** (s.danny.is)
4. **Set GitHub secret** for WORKER_URL

All free tier compatible - no ongoing costs!