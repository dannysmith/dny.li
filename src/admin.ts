import { Env, URLRecord } from './types'
import {
  checkRateLimit,
  isDangerousURL,
  isValidURL,
  normalizeURL,
  isValidCustomSlug,
  generateUniqueSlug,
  fetchPageMetadata,
  storeURL,
  getURL,
  updateURL,
  deleteURL,
  listAllURLs,
  escapeHTML,
} from './index'

// ========== Authentication ==========

/**
 * Authenticate API key from Authorization header
 */
export function authenticateAPIKey(request: Request, env: Env): boolean {
  const authHeader = request.headers.get('Authorization')
  console.log(
    'API auth check - header:',
    authHeader,
    'expected:',
    env.API_SECRET
  )
  if (!authHeader) return false

  const parts = authHeader.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer') return false

  const isValid = parts[1] === env.API_SECRET
  console.log('API auth result:', isValid, 'provided:', parts[1])
  return isValid
}

/**
 * Sign a session cookie value using HMAC-SHA256
 */
async function signSessionCookie(
  timestamp: number,
  secret: string
): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(timestamp.toString())
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign('HMAC', key, data)
  const signatureArray = new Uint8Array(signature)
  const signatureHex = Array.from(signatureArray)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  return `${timestamp}.${signatureHex}`
}

/**
 * Verify a session cookie and return the timestamp if valid
 */
async function verifySessionCookie(
  cookieValue: string,
  secret: string
): Promise<number | null> {
  try {
    const parts = cookieValue.split('.')
    if (parts.length !== 2) return null

    const timestamp = parseInt(parts[0])
    const providedSignature = parts[1]

    if (isNaN(timestamp)) return null

    // Check if session is expired (7 days = 7 * 24 * 60 * 60 * 1000 ms)
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
    if (Date.now() - timestamp > sevenDaysMs) return null

    // Verify signature
    const expectedCookie = await signSessionCookie(timestamp, secret)
    const expectedSignature = expectedCookie.split('.')[1]

    // Constant-time comparison to prevent timing attacks
    if (providedSignature.length !== expectedSignature.length) return null

    let result = 0
    for (let i = 0; i < providedSignature.length; i++) {
      result |=
        providedSignature.charCodeAt(i) ^ expectedSignature.charCodeAt(i)
    }

    return result === 0 ? timestamp : null
  } catch {
    return null
  }
}

/**
 * Check if user is authenticated via session cookie
 */
async function isAuthenticated(request: Request, env: Env): Promise<boolean> {
  if (!env.API_SECRET) {
    console.log('No API_SECRET set, allowing access')
    return true // No auth required if no secret set (dev mode)
  }

  const cookies = request.headers.get('Cookie')
  console.log('Checking authentication, cookies:', cookies)
  if (!cookies) {
    console.log('No cookies found')
    return false
  }

  // Parse cookies more reliably to avoid conflicts with other session cookies
  const cookiePairs = cookies.split(';').map((c) => c.trim())
  let sessionValue = null

  for (const pair of cookiePairs) {
    if (pair.startsWith('url_shortener_session=')) {
      sessionValue = pair.substring('url_shortener_session='.length)
      break
    }
  }

  console.log('Found url_shortener_session cookie value:', sessionValue)
  if (!sessionValue) {
    console.log('No url_shortener_session cookie found')
    return false
  }

  const timestamp = await verifySessionCookie(sessionValue, env.API_SECRET)
  console.log('Session verification result:', timestamp)
  return timestamp !== null
}

/**
 * Create a new session cookie
 */
async function createSessionCookie(
  env: Env,
  isSecure: boolean = true
): Promise<string> {
  const timestamp = Date.now()
  const cookieValue = await signSessionCookie(timestamp, env.API_SECRET)

  const secureFlag = isSecure ? '; Secure' : ''
  return `url_shortener_session=${cookieValue}; HttpOnly${secureFlag}; SameSite=Strict; Max-Age=${
    7 * 24 * 60 * 60
  }; Path=/`
}

// ========== API Endpoints ==========

/**
 * Handle POST /admin/urls - Create new URL
 */
export async function handleCreateURL(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const body = (await request.json()) as { url: string; slug?: string }

    if (!body.url) {
      return new Response(JSON.stringify({ error: 'URL is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Normalize and validate URL
    const normalizedURL = normalizeURL(body.url)
    if (!isValidURL(normalizedURL)) {
      return new Response(JSON.stringify({ error: 'Invalid URL format' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Check for dangerous URLs
    if (isDangerousURL(normalizedURL)) {
      return new Response(
        JSON.stringify({ error: 'URL contains dangerous content' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    // Handle slug
    let slug: string
    if (body.slug) {
      slug = body.slug.toLowerCase()
      if (!isValidCustomSlug(slug)) {
        return new Response(JSON.stringify({ error: 'Invalid slug format' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      // Check if slug already exists
      const existing = await getURL(env, slug)
      if (existing) {
        return new Response(JSON.stringify({ error: 'Slug already exists' }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    } else {
      slug = await generateUniqueSlug(env)
    }

    // Fetch metadata
    const metadata = await fetchPageMetadata(normalizedURL, 5000)

    // Create URL record
    const record: URLRecord = {
      url: normalizedURL,
      slug,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      metadata,
    }

    await storeURL(env, record)

    return new Response(
      JSON.stringify({
        success: true,
        data: record,
        shortUrl: `https://${env.DOMAIN}/${slug}`,
      }),
      {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

/**
 * Handle PUT /admin/urls/{slug} - Update existing URL
 */
export async function handleUpdateURL(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const url = new URL(request.url)
    const pathParts = url.pathname.split('/')
    const slug = pathParts[pathParts.length - 1]

    if (!slug) {
      return new Response(JSON.stringify({ error: 'Slug is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const body = (await request.json()) as { url?: string }

    if (!body.url) {
      return new Response(JSON.stringify({ error: 'URL is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Check if record exists
    const existing = await getURL(env, slug)
    if (!existing) {
      return new Response(JSON.stringify({ error: 'URL not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Normalize and validate new URL
    const normalizedURL = normalizeURL(body.url)
    if (!isValidURL(normalizedURL)) {
      return new Response(JSON.stringify({ error: 'Invalid URL format' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Check for dangerous URLs
    if (isDangerousURL(normalizedURL)) {
      return new Response(
        JSON.stringify({ error: 'URL contains dangerous content' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    // Fetch new metadata if URL changed
    let metadata = existing.metadata
    if (normalizedURL !== existing.url) {
      metadata = await fetchPageMetadata(normalizedURL, 5000)
    }

    // Update record
    await updateURL(env, slug, {
      url: normalizedURL,
      metadata,
    })

    const updated = await getURL(env, slug)

    return new Response(
      JSON.stringify({
        success: true,
        data: updated,
        shortUrl: `https://${env.DOMAIN}/${slug}`,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

/**
 * Handle DELETE /admin/urls/{slug} - Delete URL
 */
export async function handleDeleteURL(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const url = new URL(request.url)
    const pathParts = url.pathname.split('/')
    const slug = pathParts[pathParts.length - 1]

    if (!slug) {
      return new Response(JSON.stringify({ error: 'Slug is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Check if record exists
    const existing = await getURL(env, slug)
    if (!existing) {
      return new Response(JSON.stringify({ error: 'URL not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    await deleteURL(env, slug)

    return new Response(
      JSON.stringify({
        success: true,
        message: 'URL deleted successfully',
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

// ========== HTML Templates ==========

/**
 * Render the main admin page
 */
export function renderAdminPage(
  urls: URLRecord[],
  domain: string,
  message?: { type: 'success' | 'error'; text: string; newShortUrl?: string }
): string {
  const icon = {
    copy: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`,
    check: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
    edit: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`,
    delete: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`,
  }

  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>URL Shortener Admin</title>
    <link rel="stylesheet" href="https://unpkg.com/@picocss/pico@1.5.10/css/pico.min.css">
    <style>
        :root { --pico-font-size: 90%; }
        body { position: relative; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; padding-top: 2rem; }
        .container { max-width: 800px; }
        .logout-form { position: absolute; top: 0.75rem; right: 1rem; }
        .logout-form button { --pico-font-size: 0.75rem; padding: 0.25rem 0.5rem; background: var(--pico-secondary-background); color: var(--pico-secondary-foreground); }
        .create-form-section { padding: 1rem; margin-bottom: 2rem; border: 1px solid var(--pico-form-element-border-color); border-radius: var(--pico-border-radius); }
        .search-section { margin-bottom: 2rem; }
        .url-list-header { margin-bottom: 1rem; }
        .url-card { display: grid; grid-template-columns: 1fr auto; gap: 1rem; align-items: center; padding: 0.75rem 1rem; border-radius: var(--pico-border-radius); margin-bottom: 0.5rem; border: 1px solid var(--pico-form-element-border-color); transition: background-color 0.2s ease-in-out; }
        .url-card:hover { background-color: var(--pico-card-background-color); }
        .url-card[hidden] { display: none; }
        .url-info { word-wrap: break-word; overflow: hidden; }
        .url-info strong { font-size: 1.1rem; }
        .url-info a { font-family: monospace; font-size: 0.9rem; color: var(--pico-muted-color); }
        .url-actions { display: flex; gap: 0.25rem; align-items: center; }
        .url-actions > * { margin-bottom: 0; }
        .url-actions button, .url-actions a { --pico-font-size: 0.8rem; padding: 0.4rem; white-space: nowrap; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; }
        .icon-btn { background: transparent !important; border: none !important; padding: 0.4rem !important; }
        .icon-btn:hover { background: var(--pico-secondary-background) !important; }
        .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 2rem; }
        .stat-card { padding: 0.75rem; text-align: center; background: var(--pico-card-background-color); border: 1px solid var(--pico-card-border-color); border-radius: var(--pico-border-radius); }
        .stat-value { font-size: 1.5rem; font-weight: bold; }
        .stat-label { font-size: 0.8rem; color: var(--pico-muted-color); }
    </style>
</head>
<body>
    <form method="post" action="/admin/logout" class="logout-form">
        <button type="submit">Logout</button>
    </form>

    <main class="container">
        ${
          message
            ? `<div class="message ${message.type}" ${
                message.newShortUrl
                  ? `data-new-short-url="${escapeHTML(message.newShortUrl)}"`
                  : ''
              }>${escapeHTML(message.text)}</div>`
            : ''
        }

        <article class="create-form-section">${renderCreateForm()}</article>

        <div class="stats">${
          urls.length > 0
            ? `<div class="stat-card"><p class="stat-value">${
                urls.length
              }</p><p class="stat-label">Total URLs</p></div><div class="stat-card"><p class="stat-value">${
                urls.filter(
                  (u) => new Date(u.created) > new Date(Date.now() - 864e5)
                ).length
              }</p><p class="stat-label">Created Today</p></div>`
            : ''
        }</div>

        ${
          urls.length > 0
            ? `
        <section class="search-section">
            <input type="search" id="search-box" placeholder="Search by slug or destination URL...">
        </section>
        <section id="url-list">
            ${urls
              .map((url) => {
                const shortUrl = `https://${domain}/${url.slug}`
                return `
                <div class="url-card" data-search-term="${escapeHTML(
                  url.slug.toLowerCase()
                )} ${escapeHTML(url.url.toLowerCase())}">
                    <div class="url-info">
                        <strong>/${escapeHTML(url.slug)}</strong><br>
                        <a href="${escapeHTML(
                          url.url
                        )}" target="_blank">${escapeHTML(url.url)}</a>
                    </div>
                    <div class="url-actions">
                        <button class="icon-btn copy-btn" data-url="${escapeHTML(
                          shortUrl
                        )}" title="Copy short URL">${icon.copy}</button>
                        <a href="/admin/edit/${
                          url.slug
                        }" class="icon-btn" title="Edit URL">${icon.edit}</a>
                        <form method="post" action="/admin/delete/${
                          url.slug
                        }" onsubmit="return confirm('Are you sure you want to delete this URL?');">
                            <button type="submit" class="icon-btn" title="Delete URL">${
                              icon.delete
                            }</button>
                        </form>
                    </div>
                </div>`
              })
              .join('')}
        </section>
        `
            : '<p>No URLs created yet. Create one above!</p>'
        }
    </main>
    <script>
      document.addEventListener('DOMContentLoaded', () => {
        const copyIcon = '${icon.copy}';
        const checkIcon = '${icon.check}';

        const handleCopyClick = (button) => {
            const url = button.dataset.url;
            navigator.clipboard.writeText(url).then(() => {
                button.innerHTML = checkIcon;
                button.disabled = true;
                setTimeout(() => {
                    button.innerHTML = copyIcon;
                    button.disabled = false;
                }, 1500);
            }).catch(err => console.error('Failed to copy: ', err));
        };

        const successMessage = document.querySelector('[data-new-short-url]');
        if (successMessage) {
            const urlToCopy = successMessage.dataset.newShortUrl;
            if (urlToCopy) {
                navigator.clipboard.writeText(urlToCopy).then(() => {
                    const originalText = successMessage.textContent;
                    successMessage.textContent = 'Copied to clipboard!';
                    setTimeout(() => { successMessage.textContent = originalText; }, 2000);
                }).catch(err => console.error('Failed to copy URL: ', err));
            }
        }

        document.getElementById('url-list')?.addEventListener('click', (e) => {
            const button = e.target.closest('.copy-btn');
            if (button) handleCopyClick(button);
        });

        const searchBox = document.getElementById('search-box');
        searchBox?.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            document.querySelectorAll('.url-card').forEach(card => {
                card.hidden = !card.dataset.searchTerm.includes(searchTerm);
            });
        });
      });
    </script>
</body>
</html>`
}

/**
 * Render create URL form
 */
export function renderCreateForm(): string {
  return `
    <form method="post" action="/admin/create">
        <div class="grid">
            <label for="url">
                URL to shorten
                <input type="url" id="url" name="url" placeholder="https://example.com/my-long-url-to-shorten" required autofocus>
            </label>
            <label for="slug">
                Custom slug (optional)
                <input type="text" id="slug" name="slug" placeholder="custom-slug" pattern="[a-z0-9-]{3,50}">
            </label>
        </div>
        <button type="submit">Create Short URL</button>
    </form>
  `
}

/**
 * Render edit URL form
 */
export function renderEditForm(record: URLRecord, domain: string): string {
  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Edit URL - URL Shortener Admin</title>
    <link rel="stylesheet" href="https://unpkg.com/@picocss/pico@1.5.10/css/pico.min.css">
    <style>
        :root { --pico-font-size: 90%; }
        body { position: relative; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; padding-top: 2rem; }
        .container { max-width: 800px; }
        .grid a[role="button"] { align-self: end; }
    </style>
</head>
<body>
    <main class="container">
        <h2>Edit Short URL</h2>

        <article>
            <p>
                <strong>Slug:</strong> /${escapeHTML(record.slug)} (cannot be changed)<br>
                <strong>Short URL:</strong> <code>https://${escapeHTML(domain)}/${escapeHTML(record.slug)}</code>
            </p>

            <form method="post" action="/admin/update/${escapeHTML(record.slug)}">
                <label for="url">
                    Destination URL
                    <input type="url" id="url" name="url" value="${escapeHTML(record.url)}" required>
                </label>

                ${record.metadata ? `
                    <fieldset>
                        <legend>Current Metadata</legend>
                        ${record.metadata.title ? `<p><strong>Title:</strong> ${escapeHTML(record.metadata.title)}</p>` : ''}
                        ${record.metadata.description ? `<p><strong>Description:</strong> ${escapeHTML(record.metadata.description)}</p>` : ''}
                        ${record.metadata.image ? `<p><strong>Image:</strong> <a href="${escapeHTML(record.metadata.image)}" target="_blank">View</a></p>` : ''}
                        <p><small>Metadata will be refreshed when the destination URL is updated.</small></p>
                    </fieldset>
                ` : ''}

                <div class="grid">
                    <button type="submit">Update URL</button>
                    <a href="/admin" role="button" class="outline">Cancel</a>
                </div>
            </form>
        </article>
    </main>
</body>
</html>`
}

/**
 * Render login form
 */
export function renderLoginForm(message?: {
  type: 'success' | 'error'
  text: string
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Admin Login - URL Shortener</title>
    <link rel="stylesheet" href="https://unpkg.com/@picocss/pico@1.5.10/css/pico.min.css">
    <style>
        .login-container {
            max-width: 400px;
            margin: 10vh auto;
        }
        .login-form {
            background: var(--card-background-color);
            border: 1px solid var(--card-border-color);
            border-radius: var(--border-radius);
            padding: 2rem;
        }
        .message {
            padding: 1rem;
            border-radius: var(--border-radius);
            margin-bottom: 1rem;
        }
        .message.success {
            background: var(--ins-color);
            color: var(--contrast);
        }
        .message.error {
            background: var(--del-color);
            color: var(--contrast);
        }
    </style>
</head>
<body>
    <div class="login-container">
        <div class="login-form">
            <h1>Admin Login</h1>

            ${
              message
                ? `<div class="message ${message.type}">${escapeHTML(
                    message.text
                  )}</div>`
                : ''
            }

            <form method="post" action="/admin/login">
                <label for="password">
                    Admin Password
                    <input type="password" id="password" name="password" required autofocus>
                </label>

                <button type="submit">Sign In</button>
            </form>
        </div>
    </div>
</body>
</html>`
}

// ========== Auth Handlers ==========

/**
 * Handle login and logout routes
 */
async function handleAuthRoutes(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname
  const method = request.method

  // Login page
  if (path === '/admin/login' && method === 'GET') {
    return new Response(renderLoginForm(), {
      headers: { 'Content-Type': 'text/html' },
    })
  }

  // Login form submission
  if (path === '/admin/login' && method === 'POST') {
    try {
      const formData = await request.formData()
      const password = formData.get('password') as string

      if (!password) {
        return new Response(
          renderLoginForm({ type: 'error', text: 'Password is required' }),
          {
            headers: { 'Content-Type': 'text/html' },
          }
        )
      }

      // Check password against API_SECRET
      if (!env.API_SECRET) {
        return new Response(
          renderLoginForm({
            type: 'error',
            text: 'Admin authentication not configured',
          }),
          {
            headers: { 'Content-Type': 'text/html' },
          }
        )
      }

      if (password !== env.API_SECRET) {
        console.log('Login failed: password mismatch', {
          provided: password,
          expected: env.API_SECRET,
        })
        return new Response(
          renderLoginForm({ type: 'error', text: 'Invalid password' }),
          {
            headers: { 'Content-Type': 'text/html' },
          }
        )
      }

      console.log('Login successful, creating session cookie')

      // Create session cookie and redirect to admin
      const isSecure = new URL(request.url).protocol === 'https:'
      const sessionCookie = await createSessionCookie(env, isSecure)
      return new Response(null, {
        status: 302,
        headers: {
          Location: new URL('/admin', request.url).toString(),
          'Set-Cookie': sessionCookie,
        },
      })
    } catch (error) {
      return new Response(
        renderLoginForm({ type: 'error', text: 'Login failed' }),
        {
          headers: { 'Content-Type': 'text/html' },
        }
      )
    }
  }

  // Logout
  if (path === '/admin/logout' && method === 'POST') {
    const isSecure = new URL(request.url).protocol === 'https:'
    const secureFlag = isSecure ? '; Secure' : ''
    return new Response(null, {
      status: 302,
      headers: {
        Location: new URL('/admin/login', request.url).toString(),
        'Set-Cookie': `url_shortener_session=; HttpOnly${secureFlag}; SameSite=Strict; Max-Age=0; Path=/`,
      },
    })
  }

  return new Response('Not found', { status: 404 })
}

// ========== Main Admin Handler ==========

/**
 * Main admin request handler
 */
export async function handleAdminRequest(
  request: Request,
  env: Env
): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname
  const method = request.method

  // Allow login/logout routes without authentication
  if (path === '/admin/login' || path === '/admin/logout') {
    return await handleAuthRoutes(request, env)
  }

  // For API endpoints, check both cookie and API key authentication
  if (path.startsWith('/admin/urls')) {
    const cookieAuth = await isAuthenticated(request, env)
    const apiKeyAuth = authenticateAPIKey(request, env)

    if (!cookieAuth && !apiKeyAuth) {
      // Redirect to login page for HTML requests (no auth header = browser)
      if (method === 'GET' && !request.headers.get('Authorization')) {
        return Response.redirect(
          new URL('/admin/login', request.url).toString(),
          302
        )
      }
      // Return JSON error for API requests
      return new Response(
        JSON.stringify({ error: 'Unauthorized - please login' }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }
  } else {
    // For HTML interface routes, only check cookie authentication
    const authenticated = await isAuthenticated(request, env)
    if (!authenticated) {
      return Response.redirect(
        new URL('/admin/login', request.url).toString(),
        302
      )
    }
  }

  // API endpoints
  if (path.startsWith('/admin/urls')) {
    // Check rate limiting for admin operations (50 requests per 15 minutes)
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown'
    const rateLimitKey = `admin:${clientIP}`
    const isAllowed = await checkRateLimit(
      env,
      rateLimitKey,
      50,
      15 * 60 * 1000
    )

    if (!isAllowed) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Handle API endpoints (authentication already checked above)

    // Route API requests
    if (method === 'POST' && path === '/admin/urls') {
      return handleCreateURL(request, env)
    } else if (method === 'PUT' && path.startsWith('/admin/urls/')) {
      return handleUpdateURL(request, env)
    } else if (method === 'DELETE' && path.startsWith('/admin/urls/')) {
      return handleDeleteURL(request, env)
    }
  }

  // HTML interface endpoints

  // Main admin page
  if (method === 'GET' && path === '/admin') {
    const urls = await listAllURLs(env)
    return new Response(renderAdminPage(urls, env.DOMAIN), {
      headers: { 'Content-Type': 'text/html' },
    })
  }

  // Edit form
  if (method === 'GET' && path.startsWith('/admin/edit/')) {
    const slug = path.substring('/admin/edit/'.length)
    const record = await getURL(env, slug)

    if (!record) {
      return new Response('Not found', { status: 404 })
    }

    return new Response(renderEditForm(record, env.DOMAIN), {
      headers: { 'Content-Type': 'text/html' },
    })
  }

  // Handle form submissions
  if (method === 'POST') {
    // Parse form data
    const formData = await request.formData()

    // Create URL
    if (path === '/admin/create') {
      const url = formData.get('url') as string
      const slug = formData.get('slug') as string

      // Create request object for API handler
      const apiRequest = new Request(request.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.API_SECRET}`,
        },
        body: JSON.stringify({ url, slug: slug || undefined }),
      })

      const response = await handleCreateURL(apiRequest, env)
      const result = (await response.json()) as any

      const urls = await listAllURLs(env)
      const message = response.ok
        ? {
            type: 'success' as const,
            text: `Created short URL: /${result.data?.slug || ''}`,
            newShortUrl: result.shortUrl,
          }
        : {
            type: 'error' as const,
            text: result.error || 'Failed to create URL',
          }

      return new Response(renderAdminPage(urls, env.DOMAIN, message), {
        headers: { 'Content-Type': 'text/html' },
      })
    }

    // Update URL
    if (path.startsWith('/admin/update/')) {
      const slug = path.substring('/admin/update/'.length)
      const url = formData.get('url') as string

      // Create request object for API handler
      const apiRequest = new Request(
        `${request.url.split('/admin/update/')[0]}/admin/urls/${slug}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${env.API_SECRET}`,
          },
          body: JSON.stringify({ url }),
        }
      )

      const response = await handleUpdateURL(apiRequest, env)
      const result = (await response.json()) as any

      const urls = await listAllURLs(env)
      const message = response.ok
        ? { type: 'success' as const, text: `Updated URL: /${slug}` }
        : {
            type: 'error' as const,
            text: result.error || 'Failed to update URL',
          }

      return new Response(renderAdminPage(urls, env.DOMAIN, message), {
        headers: { 'Content-Type': 'text/html' },
      })
    }

    // Delete URL
    if (path.startsWith('/admin/delete/')) {
      const slug = path.substring('/admin/delete/'.length)

      // Create request object for API handler
      const apiRequest = new Request(
        `${request.url.split('/admin/delete/')[0]}/admin/urls/${slug}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${env.API_SECRET}`,
          },
        }
      )

      const response = await handleDeleteURL(apiRequest, env)
      const result = (await response.json()) as any

      const urls = await listAllURLs(env)
      const message = response.ok
        ? { type: 'success' as const, text: `Deleted URL: /${slug}` }
        : {
            type: 'error' as const,
            text: result.error || 'Failed to delete URL',
          }

      return new Response(renderAdminPage(urls, env.DOMAIN, message), {
        headers: { 'Content-Type': 'text/html' },
      })
    }
  }

  // Not found
  return new Response('Not found', { status: 404 })
}
