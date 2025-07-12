# URL Shortener Service

A fast URL shortener built with Cloudflare Workers that redirects `dny.li/<slug>` to target URLs.

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
├── tests/          # Test suite
│   ├── unit.test.ts       # Core function tests
│   ├── integration.test.ts # KV storage tests
│   ├── api.test.ts        # API endpoint tests
│   ├── admin-ui.test.ts   # Admin interface tests
│   ├── public.test.ts     # Public route tests
│   └── test-setup.ts      # Test configuration
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

3. Configure environment variables (optional):

   ```bash
   # Copy example environment file
   cp .env.example .env

   # Edit .env to set your preferred domain for testing
   # DOMAIN=localhost:8787 (default)
   # API_SECRET=your-secret-key-here
   ```

4. Start development server:
   ```bash
   npm run dev
   ```

### Testing and Quality Checks

Run the comprehensive test suite:

```bash
# Run all tests once
npm test

# Run tests in watch mode during development
npm run test:watch

# Run TypeScript type checking
npm run typecheck
```

The test suite covers:

- Unit tests for core functions
- API endpoint integration tests
- Admin UI form submission tests
- Public route functionality
- Authentication and authorization

### Local Testing

The service runs at `http://localhost:8787` with these endpoints:

- `GET /` - Redirects to main site
- `GET /{slug}` - Redirect to target URL
- `GET /admin` - Admin interface (requires login)
- `GET /admin/login` - Login page
- `GET /health` - Health check
- `GET /all.json` - Public JSON list of all URLs

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

2. Set up GitHub secrets for backups:
   - `WORKER_URL`: Your worker URL (e.g., `https://dny.li`)

## Manual Setup Required

After deploying the code, you'll need to:

1. **Create KV namespace** in Cloudflare dashboard
2. **Set API_SECRET** environment variable
3. **Set GitHub secret** for WORKER_URL

All free tier compatible - no ongoing costs!
