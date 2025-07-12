# dny.li Chrome Extension

A Chrome extension that provides quick access to create short URLs using the dny.li service directly from any webpage.

## Features

- **Auto-populate current page URL** when opening the side panel
- **Smart slug generation** from page title or URL path
- **One-click URL creation** with automatic clipboard copy
- **Browse existing short URLs** with search functionality
- **Copy existing short URLs** with a single click
- **Clean, minimal UI** that matches the main admin interface

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked" and select the `chrome-extension` folder
4. The extension icon should appear in your toolbar

## Setup

1. Click the extension icon to open the side panel
2. Click the settings gear icon (⚙️) in the top right
3. Enter your API token (the same secret used for admin access)
4. Click "Save"

## Usage

1. Navigate to any webpage you want to shorten
2. Click the extension icon to open the side panel
3. The current page URL will be auto-populated
4. A suggested slug will be generated from the page title
5. Edit the slug if desired (text is pre-selected for easy editing)
6. Click "Create Short URL"
7. The short URL is automatically copied to your clipboard

## Files

- `manifest.json` - Extension configuration (Manifest V3)
- `side-panel.html` - Main UI layout
- `side-panel.js` - Logic and API integration
- `background.js` - Service worker
- `styles.css` - Styling
- `icons/` - Extension icons

## API Integration

The extension uses the existing dny.li API endpoints:
- `POST /admin/urls` - Create new short URLs (requires Bearer token)
- `GET /all.json` - Fetch existing URLs (public endpoint)

## Security

- Uses Manifest V3 security standards
- API token stored securely in Chrome's sync storage
- All requests use HTTPS
- No external dependencies or scripts