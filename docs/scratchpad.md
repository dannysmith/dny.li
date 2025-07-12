# Scratchpad

## Next Tasks

### Admin UI Improvements

- [x] Move th URL creation form to the top of the page and remove the heading
- [x] Auto-focus the "URL to shortern" box on page load
- [x] Copy the new short URL to the clipboard on creation of a new shortURL
- [x] Give th UI some polish and make it feel a more modern and slick
- [x] Add a quick copy button to the URL cards

### Technical Improvements

- [x] Redirect GET requests to `/` to `https://danny.is`
- [x] Write simple, FAST automated tests to check the functionality works. These must run reliably in a local environment and properly tear down any seed data or stuff they create afterwards:
  - [x] All API Endpoints
  - [x] All admin endpoints
  - [x] `/` and `/all.json`
  - [x] Any unit tests which seem important to check
- [x] Review all code to ensure it's as simple, modern, performant and robust as possible.

### Simple Chrome Extension

When clicking the extension button in chrome, it should open the admin interface in a chrome sidePanel, populate the "URL to shortern" input with the currently open pages url and then try to form a sensible kebab-case slug from the current pages URL (and/or title) and pre-fill the slug input with that, but with the text selected for fast editing. When hitting save it should copy the full short URL to the clipboard.If it'snot possible to load the actual admin interface inside a chrome sidePanel, we can replicate the interface inside the extension and make calls to the admin AP instead. The list of all existing URLs can be got from the open `/all.json` endpoint for displaying the list.The code for the extension should be as simple as humanly possible to achieve the goal.

## Chrome Extension Research & Implementation Plan

### Architecture Decision: Replicated UI (Recommended)

**Why not embed the admin interface in iframe:**

- Cross-origin restrictions due to CSP headers
- Content-Security-Policy in Manifest V3 forbids external iframes
- X-Frame-Options headers would block embedding
- Complex workarounds using declarativeNetRequest are security risks

**Recommended approach: Replicate UI in extension**

- Build lightweight HTML/JS interface inside extension
  - Editing and deleting exisitng shortURLs need not be included
  - Adding new shortURLS and viewing/copying existing ones should.
- Use existing `/admin/urls` API endpoints with Bearer token auth
- Fetch existing URLs from public `/all.json` endpoint
- Much simpler, more secure, and reliable

### Side Panel API Capabilities & Limitations

**What works:**

- Side panel persists across tabs when configured
- Full Chrome extension APIs available
- Can make HTTP requests to our API
- User can control side panel position (left/right)
- Opens on toolbar icon click with `sidePanel.setPanelBehavior()`

**Limitations:**

- Must be Manifest V3
- No programmatic width control
- Limited visibility state detection
- Opens only via user action (security requirement)

### Slug Generation Strategy

**Input sources:**

1. Page title (`document.title`)
2. Page URL path segments
3. Meta og:title if available

**Generation algorithm:**

```javascript
function generateSlug(title, url) {
  // Try title first, fallback to URL path
  const source = title || extractPathFromUrl(url)

  return source
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special chars
    .replace(/[\s_-]+/g, '-') // Replace spaces/underscores with hyphens
    .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
    .substring(0, 50) // Limit length
}
```

### Implementation Plan

**File Structure:**

```
chrome-extension/
├── manifest.json          # Manifest V3 config
├── side-panel.html        # Main UI
├── side-panel.js          # UI logic & API calls
├── background.js          # Service worker
├── styles.css             # Minimal styling
└── icons/                 # Extension icons
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

**Key Features:**

1. **Auto-populate current page URL** on side panel open
2. **Smart slug generation** from page title/URL
3. **Text selection** for quick editing of generated slug
4. **One-click creation** with instant clipboard copy
5. **List of existing URLs** with search/copy functionality
6. **Minimal UI** matching the existing admin interface style

**API Integration:**

- Create: `POST /admin/urls` with Bearer token
- List: `GET /all.json` (public endpoint)
- Authentication: Store API token in extension storage

**Technical Requirements:**

- Manifest V3 with `sidePanel` permission
- Host permissions for API domain
- Storage permission for API token
- Tabs permission to access current page info

**Authentication Strategy:**

- Store API secret in extension options page
- Use Bearer token authentication for API calls
- Graceful fallback if token invalid/missing
