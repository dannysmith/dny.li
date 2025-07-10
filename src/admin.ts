import { Env, URLRecord } from './types';
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
  escapeHTML 
} from './index';

// ========== Authentication ==========

/**
 * Authenticate API key from Authorization header
 */
export function authenticateAPIKey(request: Request, env: Env): boolean {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return false;
  
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return false;
  
  return parts[1] === env.API_SECRET;
}

/**
 * Sign a session cookie value using HMAC-SHA256
 */
async function signSessionCookie(timestamp: number, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(timestamp.toString());
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', key, data);
  const signatureArray = new Uint8Array(signature);
  const signatureHex = Array.from(signatureArray)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  return `${timestamp}.${signatureHex}`;
}

/**
 * Verify a session cookie and return the timestamp if valid
 */
async function verifySessionCookie(cookieValue: string, secret: string): Promise<number | null> {
  try {
    const parts = cookieValue.split('.');
    if (parts.length !== 2) return null;
    
    const timestamp = parseInt(parts[0]);
    const providedSignature = parts[1];
    
    if (isNaN(timestamp)) return null;
    
    // Check if session is expired (7 days = 7 * 24 * 60 * 60 * 1000 ms)
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - timestamp > sevenDaysMs) return null;
    
    // Verify signature
    const expectedCookie = await signSessionCookie(timestamp, secret);
    const expectedSignature = expectedCookie.split('.')[1];
    
    // Constant-time comparison to prevent timing attacks
    if (providedSignature.length !== expectedSignature.length) return null;
    
    let result = 0;
    for (let i = 0; i < providedSignature.length; i++) {
      result |= providedSignature.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
    }
    
    return result === 0 ? timestamp : null;
  } catch {
    return null;
  }
}

/**
 * Check if user is authenticated via session cookie
 */
async function isAuthenticated(request: Request, env: Env): Promise<boolean> {
  if (!env.API_SECRET) return true; // No auth required if no secret set (dev mode)
  
  const cookies = request.headers.get('Cookie');
  if (!cookies) return false;
  
  const sessionMatch = cookies.match(/session=([^;]+)/);
  if (!sessionMatch) return false;
  
  const timestamp = await verifySessionCookie(sessionMatch[1], env.API_SECRET);
  return timestamp !== null;
}

/**
 * Create a new session cookie
 */
async function createSessionCookie(env: Env, isSecure: boolean = true): Promise<string> {
  const timestamp = Date.now();
  const cookieValue = await signSessionCookie(timestamp, env.API_SECRET);
  
  const secureFlag = isSecure ? '; Secure' : '';
  return `session=${cookieValue}; HttpOnly${secureFlag}; SameSite=Strict; Max-Age=${7 * 24 * 60 * 60}; Path=/`;
}

// ========== API Endpoints ==========

/**
 * Handle POST /admin/urls - Create new URL
 */
export async function handleCreateURL(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as { url: string; slug?: string };
    
    if (!body.url) {
      return new Response(JSON.stringify({ error: 'URL is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Normalize and validate URL
    const normalizedURL = normalizeURL(body.url);
    if (!isValidURL(normalizedURL)) {
      return new Response(JSON.stringify({ error: 'Invalid URL format' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Check for dangerous URLs
    if (isDangerousURL(normalizedURL)) {
      return new Response(JSON.stringify({ error: 'URL contains dangerous content' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Handle slug
    let slug: string;
    if (body.slug) {
      slug = body.slug.toLowerCase();
      if (!isValidCustomSlug(slug)) {
        return new Response(JSON.stringify({ error: 'Invalid slug format' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // Check if slug already exists
      const existing = await getURL(env, slug);
      if (existing) {
        return new Response(JSON.stringify({ error: 'Slug already exists' }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    } else {
      slug = await generateUniqueSlug(env);
    }
    
    // Fetch metadata
    const metadata = await fetchPageMetadata(normalizedURL, 5000);
    
    // Create URL record
    const record: URLRecord = {
      url: normalizedURL,
      slug,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      metadata
    };
    
    await storeURL(env, record);
    
    return new Response(JSON.stringify({
      success: true,
      data: record,
      shortUrl: `https://${env.DOMAIN}/${slug}`
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Handle PUT /admin/urls/{slug} - Update existing URL
 */
export async function handleUpdateURL(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const slug = pathParts[pathParts.length - 1];
    
    if (!slug) {
      return new Response(JSON.stringify({ error: 'Slug is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const body = await request.json() as { url?: string };
    
    if (!body.url) {
      return new Response(JSON.stringify({ error: 'URL is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Check if record exists
    const existing = await getURL(env, slug);
    if (!existing) {
      return new Response(JSON.stringify({ error: 'URL not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Normalize and validate new URL
    const normalizedURL = normalizeURL(body.url);
    if (!isValidURL(normalizedURL)) {
      return new Response(JSON.stringify({ error: 'Invalid URL format' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Check for dangerous URLs
    if (isDangerousURL(normalizedURL)) {
      return new Response(JSON.stringify({ error: 'URL contains dangerous content' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Fetch new metadata if URL changed
    let metadata = existing.metadata;
    if (normalizedURL !== existing.url) {
      metadata = await fetchPageMetadata(normalizedURL, 5000);
    }
    
    // Update record
    await updateURL(env, slug, {
      url: normalizedURL,
      metadata
    });
    
    const updated = await getURL(env, slug);
    
    return new Response(JSON.stringify({
      success: true,
      data: updated,
      shortUrl: `https://${env.DOMAIN}/${slug}`
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Handle DELETE /admin/urls/{slug} - Delete URL
 */
export async function handleDeleteURL(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const slug = pathParts[pathParts.length - 1];
    
    if (!slug) {
      return new Response(JSON.stringify({ error: 'Slug is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Check if record exists
    const existing = await getURL(env, slug);
    if (!existing) {
      return new Response(JSON.stringify({ error: 'URL not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    await deleteURL(env, slug);
    
    return new Response(JSON.stringify({
      success: true,
      message: 'URL deleted successfully'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Handle GET /admin/urls - List all URLs (public, no auth)
 */
export async function handleListURLs(request: Request, env: Env): Promise<Response> {
  try {
    const urls = await listAllURLs(env);
    
    // Transform URLs to include short URL
    const transformedUrls = urls.map(record => ({
      ...record,
      shortUrl: `https://${env.DOMAIN}/${record.slug}`
    }));
    
    return new Response(JSON.stringify({
      success: true,
      count: urls.length,
      data: transformedUrls
    }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60' // Cache for 1 minute
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Handle GET /admin/backup - Export all URLs as JSON
 */
export async function handleBackup(env: Env): Promise<Response> {
  try {
    const urls = await listAllURLs(env);
    
    return new Response(JSON.stringify({
      exportDate: new Date().toISOString(),
      count: urls.length,
      urls
    }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="urls-backup.json"'
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// ========== HTML Templates ==========

/**
 * Render the main admin page
 */
export function renderAdminPage(urls: URLRecord[], message?: { type: 'success' | 'error'; text: string }): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>URL Shortener Admin</title>
    <link rel="stylesheet" href="https://unpkg.com/@picocss/pico@1.5.10/css/pico.min.css">
    <style>
        .url-card {
            background: var(--card-background-color);
            border: 1px solid var(--card-border-color);
            border-radius: var(--border-radius);
            padding: var(--spacing);
            margin-bottom: var(--spacing);
        }
        .url-actions {
            display: flex;
            gap: var(--spacing);
            margin-top: var(--spacing);
        }
        .url-link {
            word-break: break-all;
        }
        .metadata {
            font-size: 0.875rem;
            color: var(--muted-color);
            margin-top: 0.5rem;
        }
        .message {
            padding: var(--spacing);
            border-radius: var(--border-radius);
            margin-bottom: var(--spacing);
        }
        .message.success {
            background: var(--ins-color);
            color: var(--contrast);
        }
        .message.error {
            background: var(--del-color);
            color: var(--contrast);
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 2rem;
        }
        .logout-form {
            margin: 0;
        }
        .logout-form button {
            background: var(--secondary);
            color: var(--secondary-inverse);
            border: none;
            padding: 0.5rem 1rem;
            border-radius: var(--border-radius);
            cursor: pointer;
            font-size: 0.875rem;
        }
        .logout-form button:hover {
            background: var(--secondary-hover);
        }
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: var(--spacing);
            margin-bottom: var(--spacing);
        }
        .stat-card {
            background: var(--card-background-color);
            border: 1px solid var(--card-border-color);
            border-radius: var(--border-radius);
            padding: var(--spacing);
            text-align: center;
        }
        .stat-value {
            font-size: 2rem;
            font-weight: bold;
            margin: 0;
        }
        .stat-label {
            color: var(--muted-color);
            margin: 0;
        }
    </style>
</head>
<body>
    <main class="container">
        <div class="header">
            <h1>URL Shortener Admin</h1>
            <form method="post" action="/admin/logout" class="logout-form">
                <button type="submit">Logout</button>
            </form>
        </div>
        
        ${message ? `
        <div class="message ${message.type}">
            ${escapeHTML(message.text)}
        </div>
        ` : ''}
        
        <div class="stats">
            <div class="stat-card">
                <p class="stat-value">${urls.length}</p>
                <p class="stat-label">Total URLs</p>
            </div>
            <div class="stat-card">
                <p class="stat-value">${urls.filter(u => {
                    const created = new Date(u.created);
                    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
                    return created > dayAgo;
                }).length}</p>
                <p class="stat-label">Created Today</p>
            </div>
        </div>
        
        <section>
            <h2>Create New Short URL</h2>
            ${renderCreateForm()}
        </section>
        
        <section>
            <h2>Existing URLs</h2>
            ${urls.length === 0 ? '<p>No URLs created yet.</p>' : ''}
            ${urls.map(url => `
                <div class="url-card">
                    <strong>/${escapeHTML(url.slug)}</strong> → 
                    <a href="${escapeHTML(url.url)}" target="_blank" class="url-link">${escapeHTML(url.url)}</a>
                    ${url.metadata?.title ? `
                        <div class="metadata">
                            <strong>Title:</strong> ${escapeHTML(url.metadata.title)}
                            ${url.metadata.description ? `<br><strong>Description:</strong> ${escapeHTML(url.metadata.description)}` : ''}
                        </div>
                    ` : ''}
                    <div class="metadata">
                        Created: ${new Date(url.created).toLocaleString()}
                        ${url.updated !== url.created ? `<br>Updated: ${new Date(url.updated).toLocaleString()}` : ''}
                    </div>
                    <div class="url-actions">
                        <a href="/admin/edit/${url.slug}" role="button" class="outline">Edit</a>
                        <form method="post" action="/admin/delete/${url.slug}" style="margin: 0;" onsubmit="return confirm('Are you sure you want to delete this URL?');">
                            <button type="submit" class="secondary">Delete</button>
                        </form>
                    </div>
                </div>
            `).join('')}
        </section>
        
        <section>
            <h3>API Access</h3>
            <p>Use the API endpoints with your API key in the Authorization header:</p>
            <pre><code>Authorization: Bearer YOUR_API_KEY</code></pre>
            <ul>
                <li><code>POST /admin/urls</code> - Create new URL</li>
                <li><code>PUT /admin/urls/{slug}</code> - Update URL</li>
                <li><code>DELETE /admin/urls/{slug}</code> - Delete URL</li>
                <li><code>GET /admin/urls</code> - List all URLs (public)</li>
                <li><code>GET /admin/backup</code> - Export backup</li>
            </ul>
        </section>
    </main>
</body>
</html>`;
}

/**
 * Render create URL form
 */
export function renderCreateForm(): string {
  return `
    <form method="post" action="/admin/create">
        <label for="url">
            URL to shorten <small>(required)</small>
            <input type="url" id="url" name="url" placeholder="https://example.com" required>
        </label>
        
        <label for="slug">
            Custom slug <small>(optional, leave blank for random)</small>
            <input type="text" id="slug" name="slug" placeholder="my-custom-slug" pattern="[a-z0-9-]{3,50}">
            <small>3-50 characters, lowercase letters, numbers, and hyphens only</small>
        </label>
        
        <button type="submit">Create Short URL</button>
    </form>
  `;
}

/**
 * Render edit URL form
 */
export function renderEditForm(record: URLRecord, domain: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Edit URL - URL Shortener Admin</title>
    <link rel="stylesheet" href="https://unpkg.com/@picocss/pico@1.5.10/css/pico.min.css">
</head>
<body>
    <main class="container">
        <h1>Edit Short URL</h1>
        
        <article>
            <p><strong>Slug:</strong> /${escapeHTML(record.slug)} (cannot be changed)</p>
            <p><strong>Short URL:</strong> <code>https://${escapeHTML(domain)}/${escapeHTML(record.slug)}</code></p>
            
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
                        <p><small>Metadata will be refreshed when URL is updated</small></p>
                    </fieldset>
                ` : ''}
                
                <div class="grid">
                    <button type="submit">Update URL</button>
                    <a href="/admin" role="button" class="secondary">Cancel</a>
                </div>
            </form>
        </article>
    </main>
</body>
</html>`;
}

/**
 * Render login form
 */
export function renderLoginForm(message?: { type: 'success' | 'error'; text: string }): string {
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
            
            ${message ? `<div class="message ${message.type}">${escapeHTML(message.text)}</div>` : ''}
            
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
</html>`;
}

// ========== Auth Handlers ==========

/**
 * Handle login and logout routes
 */
async function handleAuthRoutes(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  
  // Login page
  if (path === '/admin/login' && method === 'GET') {
    return new Response(renderLoginForm(), {
      headers: { 'Content-Type': 'text/html' }
    });
  }
  
  // Login form submission
  if (path === '/admin/login' && method === 'POST') {
    try {
      const formData = await request.formData();
      const password = formData.get('password') as string;
      
      if (!password) {
        return new Response(renderLoginForm({ type: 'error', text: 'Password is required' }), {
          headers: { 'Content-Type': 'text/html' }
        });
      }
      
      // Check password against API_SECRET
      if (!env.API_SECRET) {
        return new Response(renderLoginForm({ type: 'error', text: 'Admin authentication not configured' }), {
          headers: { 'Content-Type': 'text/html' }
        });
      }
      
      if (password !== env.API_SECRET) {
        console.log('Login failed: password mismatch', { provided: password, expected: env.API_SECRET });
        return new Response(renderLoginForm({ type: 'error', text: 'Invalid password' }), {
          headers: { 'Content-Type': 'text/html' }
        });
      }
      
      console.log('Login successful, creating session cookie');
      
      // Create session cookie and redirect to admin
      const isSecure = new URL(request.url).protocol === 'https:';
      const sessionCookie = await createSessionCookie(env, isSecure);
      return new Response(null, {
        status: 302,
        headers: {
          'Location': new URL('/admin', request.url).toString(),
          'Set-Cookie': sessionCookie
        }
      });
      
    } catch (error) {
      return new Response(renderLoginForm({ type: 'error', text: 'Login failed' }), {
        headers: { 'Content-Type': 'text/html' }
      });
    }
  }
  
  // Logout
  if (path === '/admin/logout' && method === 'POST') {
    const isSecure = new URL(request.url).protocol === 'https:';
    const secureFlag = isSecure ? '; Secure' : '';
    return new Response(null, {
      status: 302,
      headers: {
        'Location': new URL('/admin/login', request.url).toString(),
        'Set-Cookie': `session=; HttpOnly${secureFlag}; SameSite=Strict; Max-Age=0; Path=/`
      }
    });
  }
  
  return new Response('Not found', { status: 404 });
}

// ========== Main Admin Handler ==========

/**
 * Main admin request handler
 */
export async function handleAdminRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  
  // Allow login/logout routes without authentication
  if (path === '/admin/login' || path === '/admin/logout') {
    return await handleAuthRoutes(request, env);
  }
  
  // Check authentication for all other admin routes
  const authenticated = await isAuthenticated(request, env);
  if (!authenticated) {
    // Redirect to login page for HTML requests
    if (method === 'GET' && !path.startsWith('/admin/urls')) {
      return Response.redirect(new URL('/admin/login', request.url).toString(), 302);
    }
    // Return JSON error for API requests
    return new Response(JSON.stringify({ error: 'Unauthorized - please login' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // API endpoints
  if (path.startsWith('/admin/urls') || path === '/admin/backup') {
    // Check rate limiting for admin operations (50 requests per 15 minutes)
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
    const rateLimitKey = `admin:${clientIP}`;
    const isAllowed = await checkRateLimit(env, rateLimitKey, 50, 15 * 60 * 1000);
    
    if (!isAllowed) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Public endpoint - no auth required
    if (method === 'GET' && path === '/admin/urls') {
      return handleListURLs(request, env);
    }
    
    // All other API endpoints require authentication
    if (!authenticateAPIKey(request, env)) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 
          'Content-Type': 'application/json',
          'WWW-Authenticate': 'Bearer'
        }
      });
    }
    
    // Route API requests
    if (method === 'POST' && path === '/admin/urls') {
      return handleCreateURL(request, env);
    } else if (method === 'PUT' && path.startsWith('/admin/urls/')) {
      return handleUpdateURL(request, env);
    } else if (method === 'DELETE' && path.startsWith('/admin/urls/')) {
      return handleDeleteURL(request, env);
    } else if (method === 'GET' && path === '/admin/backup') {
      return handleBackup(env);
    }
  }
  
  // HTML interface endpoints
  
  // Main admin page
  if (method === 'GET' && path === '/admin') {
    const urls = await listAllURLs(env);
    return new Response(renderAdminPage(urls), {
      headers: { 'Content-Type': 'text/html' }
    });
  }
  
  // Edit form
  if (method === 'GET' && path.startsWith('/admin/edit/')) {
    const slug = path.substring('/admin/edit/'.length);
    const record = await getURL(env, slug);
    
    if (!record) {
      return new Response('Not found', { status: 404 });
    }
    
    return new Response(renderEditForm(record, env.DOMAIN), {
      headers: { 'Content-Type': 'text/html' }
    });
  }
  
  // Handle form submissions
  if (method === 'POST') {
    // Parse form data
    const formData = await request.formData();
    
    // Create URL
    if (path === '/admin/create') {
      const url = formData.get('url') as string;
      const slug = formData.get('slug') as string;
      
      // Create request object for API handler
      const apiRequest = new Request(request.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.API_SECRET}`
        },
        body: JSON.stringify({ url, slug: slug || undefined })
      });
      
      const response = await handleCreateURL(apiRequest, env);
      const result = await response.json() as any;
      
      const urls = await listAllURLs(env);
      const message = response.ok 
        ? { type: 'success' as const, text: `Created short URL: /${result.data?.slug || ''}` }
        : { type: 'error' as const, text: result.error || 'Failed to create URL' };
      
      return new Response(renderAdminPage(urls, message), {
        headers: { 'Content-Type': 'text/html' }
      });
    }
    
    // Update URL
    if (path.startsWith('/admin/update/')) {
      const slug = path.substring('/admin/update/'.length);
      const url = formData.get('url') as string;
      
      // Create request object for API handler
      const apiRequest = new Request(`${request.url.split('/admin/update/')[0]}/admin/urls/${slug}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.API_SECRET}`
        },
        body: JSON.stringify({ url })
      });
      
      const response = await handleUpdateURL(apiRequest, env);
      const result = await response.json() as any;
      
      const urls = await listAllURLs(env);
      const message = response.ok 
        ? { type: 'success' as const, text: `Updated URL: /${slug}` }
        : { type: 'error' as const, text: result.error || 'Failed to update URL' };
      
      return new Response(renderAdminPage(urls, message), {
        headers: { 'Content-Type': 'text/html' }
      });
    }
    
    // Delete URL
    if (path.startsWith('/admin/delete/')) {
      const slug = path.substring('/admin/delete/'.length);
      
      // Create request object for API handler
      const apiRequest = new Request(`${request.url.split('/admin/delete/')[0]}/admin/urls/${slug}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${env.API_SECRET}`
        }
      });
      
      const response = await handleDeleteURL(apiRequest, env);
      const result = await response.json() as any;
      
      const urls = await listAllURLs(env);
      const message = response.ok 
        ? { type: 'success' as const, text: `Deleted URL: /${slug}` }
        : { type: 'error' as const, text: result.error || 'Failed to delete URL' };
      
      return new Response(renderAdminPage(urls, message), {
        headers: { 'Content-Type': 'text/html' }
      });
    }
  }
  
  // Not found
  return new Response('Not found', { status: 404 });
}