# Planning Notes

## Key Requirements Summary
- Fast global redirects (likely Cloudflare Workers)
- Admin panel for CRUD operations
- Authenticated API + public JSON endpoint
- SEO-friendly redirects with OG data passthrough
- Auto-generated readable slugs when not provided
- Free tier only, minimal maintenance
- GitHub backup strategy

## Research Findings

### 1. OG Data & Rich Previews
**Critical Discovery**: HTTP redirects break OG metadata for social platforms!
- Facebook, Twitter, Slack follow redirects but fail to extract metadata properly
- **Solution**: Conditional behavior - serve HTML with OG tags to social crawlers, HTTP redirects to users
- Detect user agents like `facebookexternalhit`, `Twitterbot` and serve metadata-rich pages

### 2. Cloudflare Architecture
**Perfect fit for requirements**:
- **Free tier**: 100k requests/day, 1k writes/day, 100k reads/day, 1GB storage
- **Performance**: 20ms average for hot reads, global edge deployment
- **Cost**: Easily stays within free tier for personal use
- 1GB storage ≈ 1 million URL mappings

### 3. Authentication Strategy
**Recommendation**: Start simple, upgrade later
- **Phase 1**: API key authentication (simplest)
- **Phase 2**: GitHub OAuth for better security
- Store secrets in Cloudflare environment variables

### 4. Slug Generation
**Solution**: `unique-names-generator` library
- Generates "apple-cupboard" style slugs
- Millions of combinations, collision detection
- Lightweight, perfect for Workers

### 5. Rate Limiting
**Built-in**: Cloudflare Workers has native rate limiting APIs

## Recommended Architecture

### Core Stack
- **Cloudflare Workers**: Global edge compute for redirects
- **Cloudflare KV**: URL storage (1GB free = ~1M URLs)
- **Cloudflare D1**: Optional for analytics/metadata (SQLite at edge)
- **GitHub Actions**: Automated backups and deployment

### Two-Component Design

**1. Redirect Worker** (`s.danny.is/*`)
- Handles all redirect requests
- User-agent detection for social crawlers
- Serves HTML with OG metadata to social bots
- HTTP 301 redirects for users/search engines
- Rate limiting on redirects

**2. Admin API Worker** (`admin.s.danny.is` or subdirectory)
- CRUD operations for URLs
- API key authentication
- Web interface for management
- Public JSON endpoint for all URLs
- Rate limiting on admin operations

### Data Storage Strategy
```json
// KV Storage Structure
{
  "urls:{slug}": {
    "url": "https://example.com/long-url",
    "slug": "apple-cupboard", 
    "created": "2025-01-10T12:00:00Z",
    "updated": "2025-02-09T12:00:00Z",
    "metadata": {
      "title": "Page Title",
      "description": "Page Description", 
      "image": "https://example.com/og-image.jpg"
    }
  }
}
```

### Deployment Strategy
1. **Single Worker**: Start with one worker handling both redirects and admin
2. **Split Later**: Separate if needed for performance/security
3. **Custom Domain**: Use Cloudflare for DNS (free)
4. **SSL**: Automatic with Cloudflare

## Answers & Final Architecture

### Decisions Made
1. **Metadata**: Auto-fetch with short timeout, fail gracefully if slow/unavailable
2. **Analytics**: None for MVP - keeps it simple and within free tier limits
3. **Admin UI**: Simple HTML forms with modern CSS styling
4. **Migration**: Not needed

### Simplified MVP Architecture

**Single Cloudflare Worker** handling:
- **Redirect endpoint** (`GET /:slug`)
- **Admin API** (`POST /admin/urls`, `PUT /admin/urls/:slug`, `DELETE /admin/urls/:slug`)
- **Admin UI** (`GET /admin` - simple HTML interface)
- **Public API** (`GET /api/urls` - JSON list of all URLs)

**Storage**: Cloudflare KV only - no D1 database needed without analytics

**Metadata fetching**: 3-5 second timeout, extract title/description from HTML, store in KV

### Benefits of This Simplified Approach
- **Faster development**: No analytics complexity
- **Lower resource usage**: Stays well within free tier
- **Easier maintenance**: Single worker, single storage system
- **Future-proof**: Can add analytics later without breaking changes

## Critical Requirements Analysis

### ✅ Requirements Coverage Check
- **Fast global redirects**: Cloudflare Workers (20ms edge response)
- **Instant availability**: KV eventual consistency solved with synchronous validation  
- **SEO-friendly**: HTTP 301 redirects for users/search engines
- **Social media OG**: HTML pages with metadata for social crawlers
- **Custom slugs**: User input validation and storage
- **Auto slugs**: unique-names-generator for readable kebab-case
- **Admin panel**: Simple HTML forms with Pico CSS
- **Admin API**: REST endpoints with API key auth
- **Public JSON**: Unauthenticated endpoint for URL list
- **Security**: URL validation, rate limiting, dangerous protocol blocking
- **Backups**: GitHub Actions for automated KV data export
- **Free tier**: Well within Cloudflare limits
- **Minimal maintenance**: Single Worker, minimal dependencies

## Detailed Implementation Plan

### Phase 1: Project Setup & Basic Structure

#### 1.1 Initialize Cloudflare Workers Project
```bash
npm create cloudflare@latest s-danny-is -- --type="Hello World script"
cd s-danny-is
npm install unique-names-generator @types/node
```

#### 1.2 Configure wrangler.toml
```toml
name = "s-danny-is"
main = "src/index.ts"
compatibility_date = "2024-12-01"

[vars]
DOMAIN = "s.danny.is"

[[kv_namespaces]]
binding = "URLS_KV"
preview_id = "preview-kv-id"
id = "production-kv-id"

[env.production]
[[env.production.kv_namespaces]]
binding = "URLS_KV"
id = "production-kv-id"
```

#### 1.3 Setup TypeScript Types
```typescript
// src/types.ts
export interface Env {
  URLS_KV: KVNamespace;
  API_SECRET: string;
  DOMAIN: string;
}

export interface URLRecord {
  url: string;
  slug: string;
  created: string;
  updated: string;
  metadata?: {
    title?: string;
    description?: string;
    image?: string;
  };
}
```

### Phase 2: Core Logic in index.ts

#### 2.1 Main Router & Core Functions
```typescript
// src/index.ts - Main file containing:

// KV Storage Functions
async function storeURL(env: Env, record: URLRecord): Promise<void>
async function getURL(env: Env, slug: string): Promise<URLRecord | null>
async function updateURL(env: Env, slug: string, updates: Partial<URLRecord>): Promise<void>
async function deleteURL(env: Env, slug: string): Promise<void>
async function listAllURLs(env: Env): Promise<URLRecord[]>

// Slug Generation
function generateSlug(): string
async function generateUniqueSlug(env: Env): Promise<string>
function isValidCustomSlug(slug: string): boolean

// URL Validation & Security
function isValidURL(url: string): boolean
function isDangerousURL(url: string): boolean
function normalizeURL(url: string): string

// Rate Limiting
async function checkRateLimit(env: Env, key: string, limit: number, window: number): Promise<boolean>

// Metadata Fetching
async function fetchPageMetadata(url: string, timeout: number = 5000): Promise<{
  title?: string;
  description?: string;
  image?: string;
}>

// Social Media Detection
function isSocialMediaCrawler(userAgent: string): boolean
function generateOGHTML(record: URLRecord): string

// Main Router
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response>
}
```

### Phase 3: Admin Interface Module

#### 3.1 Admin Module (admin.ts)
```typescript
// src/admin.ts - Complete admin functionality:

// Authentication
function authenticateAPIKey(request: Request, env: Env): boolean

// API Endpoints
export async function handleCreateURL(request: Request, env: Env): Promise<Response>
export async function handleUpdateURL(request: Request, env: Env): Promise<Response>
export async function handleDeleteURL(request: Request, env: Env): Promise<Response>
export async function handleListURLs(request: Request, env: Env): Promise<Response>

// HTML Templates with Pico CSS
function renderAdminPage(urls: URLRecord[]): string
function renderCreateForm(): string
function renderEditForm(record: URLRecord): string

// Main admin request handler
export async function handleAdminRequest(request: Request, env: Env): Promise<Response>
```

### Phase 4: Consolidated Implementation Notes

#### 4.1 Implementation Strategy
- **index.ts**: Handles all redirect traffic (performance critical) + core utility functions
- **admin.ts**: Complete admin functionality (auth, API, HTML interface)
- **types.ts**: Shared TypeScript interfaces

#### 4.2 Key Features Consolidated
- URL validation with security checks (localhost, private IPs, dangerous protocols)
- Rate limiting (Admin: 50 req/15min, Public: 60 req/min)
- Metadata auto-fetch with 5s timeout and graceful fallback
- Social media crawler detection for OG HTML responses
- API key authentication for admin functions
- Pico CSS styling for clean, responsive admin interface

### Phase 5: GitHub Backup System

#### 5.1 GitHub Actions Workflow
```yaml
# .github/workflows/backup.yml
name: Backup URLs
on:
  schedule:
    - cron: '0 2 * * *' # Daily at 2 AM
  workflow_dispatch:

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Backup URLs
        run: curl -s ${{ secrets.BACKUP_ENDPOINT }} > data/urls-backup.json
      - name: Commit & Push
        run: |
          git config --local user.name "Backup Bot"
          git add data/urls-backup.json
          git commit -m "Automated URL backup" && git push || echo "No changes"
```

#### 5.2 Backup Endpoint
```typescript
// Added to admin.ts
export async function handleBackup(env: Env): Promise<Response>
// Returns JSON export of all URLs for GitHub Actions
```

### Phase 6: Testing & Deployment

#### 6.1 Local Development
```bash
# Test locally
wrangler dev

# Test specific endpoints
curl -X POST http://localhost:8787/admin/urls \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","slug":"test"}'
```

#### 6.2 Production Deployment
```bash
# Create KV namespace
wrangler kv:namespace create "URLS_KV"
wrangler kv:namespace create "URLS_KV" --preview

# Set secrets
wrangler secret put API_SECRET

# Deploy
wrangler deploy
```

### Phase 7: Domain Configuration

#### 7.1 Cloudflare DNS Setup
- Add CNAME: s.danny.is -> worker-name.subdomain.workers.dev
- Configure custom domain in Cloudflare Workers dashboard
- SSL automatically handled by Cloudflare

## Simplified File Structure

```
s-danny-is/
├── src/
│   ├── index.ts           # Main router + core logic (redirects, storage, validation, etc.)
│   ├── admin.ts           # Complete admin functionality (auth, API, UI)
│   └── types.ts           # TypeScript interfaces
├── .github/workflows/
│   └── backup.yml         # Automated backups
├── data/
│   └── urls-backup.json   # Backup storage
├── wrangler.toml          # Cloudflare config
└── package.json           # Dependencies
```

## Implementation Order

1. **Foundation** (Phase 1-2): Project setup, core logic in index.ts
2. **Admin Interface** (Phase 3): Complete admin module (auth, API, UI)
3. **Features** (Phase 4): Final integration and refinements
4. **Operations** (Phase 5-7): Backups, testing, deployment

## Key Implementation Notes

- **Error Handling**: All functions should handle errors gracefully
- **Logging**: Use console.log for debugging, structured logging for production
- **Performance**: Optimize for < 10ms CPU time on free tier
- **Security**: Validate all inputs, sanitize outputs
- **Testing**: Test locally with `wrangler dev` before deployment

This plan provides a complete roadmap for implementing a production-ready URL shortener that meets all requirements while staying within Cloudflare's free tier.
