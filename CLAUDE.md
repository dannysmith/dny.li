# CLAUDE.md

This file provides guidance to Claude when working with this repository.

## The Project

**dny.li URL Shortener** - A personal URL shortener with two main components:

1. **Cloudflare Worker** (`src/`) - Backend service that handles redirects and provides admin interface
2. **Chrome Extension** (`chrome-extension/`) - Frontend that integrates with the backend API

## Architecture Overview

- **Backend**: Cloudflare Worker with KV storage, handles redirects and admin API
- **Frontend**: Chrome extension with side panel UI for creating URLs
- **Storage**: Cloudflare KV for URLs, GitHub for backups
- **API**: REST endpoints for URL management (Bearer token auth)

## Key Files

- `src/index.ts` - Main router, redirect logic, health checks
- `src/admin.ts` - Admin interface, API endpoints, authentication
- `chrome-extension/side-panel.js` - Extension logic, API integration
- `chrome-extension/manifest.json` - Extension configuration (Manifest V3)

## Development Workflow

After making any significant code changes, you MUST automatically run:

1. **Run Tests**: `npm test`

   - Covers unit tests, API endpoints, admin UI, and public routes
   - All tests must pass before considering work complete

2. **TypeScript Check**: `npm run typecheck`
   - Validates TypeScript compilation
   - Must have no TypeScript errors before work complete

## Integration Points

The Chrome extension integrates with these API endpoints:

- `POST /admin/urls` - Create URLs (requires Bearer token)
- `GET /all.json` - List URLs (public endpoint)

## Key Considerations

- This is a personal project, so prioritize simplicity over enterprise features
- Chrome extension uses Manifest V3 security standards
- All API calls require HTTPS and proper authentication
- The worker runs on Cloudflare's free tier
