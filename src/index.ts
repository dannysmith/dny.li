import {
  uniqueNamesGenerator,
  Config,
  adjectives,
  colors,
  animals,
} from 'unique-names-generator'
import { Env, URLRecord, RateLimitInfo } from './types'
import { handleAdminRequest } from './admin'

// ========== KV Storage Functions ==========

/**
 * Store a URL record in KV storage
 */
export async function storeURL(env: Env, record: URLRecord): Promise<void> {
  const key = `urls:${record.slug}`
  await env.URLS_KV.put(key, JSON.stringify(record))
}

/**
 * Retrieve a URL record from KV storage
 */
export async function getURL(
  env: Env,
  slug: string
): Promise<URLRecord | null> {
  const key = `urls:${slug}`
  const data = await env.URLS_KV.get(key)
  if (!data) return null

  try {
    return JSON.parse(data) as URLRecord
  } catch {
    return null
  }
}

/**
 * Update an existing URL record
 */
export async function updateURL(
  env: Env,
  slug: string,
  updates: Partial<URLRecord>
): Promise<void> {
  const existing = await getURL(env, slug)
  if (!existing) {
    throw new Error('URL not found')
  }

  const updated: URLRecord = {
    ...existing,
    ...updates,
    slug: existing.slug, // Ensure slug can't be changed
    updated: new Date().toISOString(),
  }

  await storeURL(env, updated)
}

/**
 * Delete a URL record from KV storage
 */
export async function deleteURL(env: Env, slug: string): Promise<void> {
  const key = `urls:${slug}`
  await env.URLS_KV.delete(key)
}

/**
 * List all URL records from KV storage
 */
export async function listAllURLs(env: Env): Promise<URLRecord[]> {
  const urls: URLRecord[] = []
  const list = await env.URLS_KV.list({ prefix: 'urls:' })

  for (const key of list.keys) {
    const data = await env.URLS_KV.get(key.name)
    if (data) {
      try {
        urls.push(JSON.parse(data) as URLRecord)
      } catch {
        // Skip malformed records
      }
    }
  }

  return urls.sort(
    (a, b) => new Date(b.created).getTime() - new Date(a.created).getTime()
  )
}

// ========== Slug Generation ==========

/**
 * Generate a random readable slug using unique-names-generator
 */
function generateSlug(): string {
  const config: Config = {
    dictionaries: [adjectives, colors, animals],
    separator: '-',
    length: 2,
    style: 'lowerCase',
  }

  return uniqueNamesGenerator(config)
}

/**
 * Generate a unique slug, checking for collisions
 */
export async function generateUniqueSlug(env: Env): Promise<string> {
  let attempts = 0
  const maxAttempts = 10

  while (attempts < maxAttempts) {
    const slug = generateSlug()
    const existing = await getURL(env, slug)

    if (!existing) {
      return slug
    }

    attempts++
  }

  // Fallback to adding a random number if too many collisions
  return `${generateSlug()}-${Math.floor(Math.random() * 1000)}`
}

/**
 * Validate a custom slug
 */
export function isValidCustomSlug(slug: string): boolean {
  // Must be 3-50 chars, alphanumeric with hyphens (no spaces or special chars)
  const slugRegex = /^[a-z0-9-]{3,50}$/

  // Must not start or end with hyphen
  if (slug.startsWith('-') || slug.endsWith('-')) {
    return false
  }

  // Must not have consecutive hyphens
  if (slug.includes('--')) {
    return false
  }

  // Check against reserved words
  const reserved = ['admin', 'api', 'health', 'status', 'backup']
  if (reserved.includes(slug.toLowerCase())) {
    return false
  }

  return slugRegex.test(slug)
}

// ========== URL Validation & Security ==========

/**
 * Validate URL format
 */
export function isValidURL(url: string): boolean {
  try {
    const parsed = new URL(url)
    // Only allow http and https protocols
    return ['http:', 'https:'].includes(parsed.protocol)
  } catch {
    return false
  }
}

/**
 * Check if URL is potentially dangerous
 */
export function isDangerousURL(url: string): boolean {
  try {
    const parsed = new URL(url)

    // Block dangerous protocols
    const dangerousProtocols = ['javascript:', 'data:', 'vbscript:', 'file:']
    if (dangerousProtocols.includes(parsed.protocol)) {
      return true
    }

    // Block localhost and private IPs
    const hostname = parsed.hostname.toLowerCase()

    // Localhost variations
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '[::1]'
    ) {
      return true
    }

    // Private IP ranges
    const privateIPRegexes = [
      /^10\./, // 10.0.0.0/8
      /^172\.(1[6-9]|2[0-9]|3[01])\./, // 172.16.0.0/12
      /^192\.168\./, // 192.168.0.0/16
      /^169\.254\./, // Link-local
      /^fc00:/i, // IPv6 private
      /^fe80:/i, // IPv6 link-local
    ]

    if (privateIPRegexes.some((regex) => regex.test(hostname))) {
      return true
    }

    return false
  } catch {
    return true // If we can't parse it, consider it dangerous
  }
}

/**
 * Normalize URL (add protocol if missing, trim whitespace)
 */
export function normalizeURL(url: string): string {
  url = url.trim()

  // Add https:// if no protocol specified
  if (!url.match(/^https?:\/\//i)) {
    url = 'https://' + url
  }

  try {
    // Parse and reconstruct to normalize
    const parsed = new URL(url)
    return parsed.toString()
  } catch {
    return url
  }
}

// ========== Rate Limiting ==========

/**
 * Check rate limit using KV storage
 */
export async function checkRateLimit(
  env: Env,
  key: string,
  limit: number,
  window: number
): Promise<boolean> {
  const rateLimitKey = `rate:${key}`
  const now = Date.now()
  const windowStart = now - window

  const data = await env.URLS_KV.get(rateLimitKey)
  let rateLimitInfo: RateLimitInfo

  if (data) {
    try {
      rateLimitInfo = JSON.parse(data) as RateLimitInfo

      // If outside the window, reset
      if (rateLimitInfo.resetTime < now) {
        rateLimitInfo = { count: 1, resetTime: now + window }
      } else {
        // Within window, increment
        rateLimitInfo.count++
      }
    } catch {
      rateLimitInfo = { count: 1, resetTime: now + window }
    }
  } else {
    rateLimitInfo = { count: 1, resetTime: now + window }
  }

  // Store updated rate limit info
  await env.URLS_KV.put(rateLimitKey, JSON.stringify(rateLimitInfo), {
    expirationTtl: Math.ceil(window / 1000), // Convert to seconds
  })

  return rateLimitInfo.count <= limit
}

// ========== Metadata Fetching ==========

/**
 * Fetch page metadata with timeout
 */
export async function fetchPageMetadata(
  url: string,
  timeout: number = 5000
): Promise<{
  title?: string
  description?: string
  image?: string
}> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; URLShortenerBot/1.0)',
      },
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      return {}
    }

    const html = await response.text()

    // Extract metadata using regex (simple parsing)
    const metadata: { title?: string; description?: string; image?: string } =
      {}

    // Title
    const titleMatch =
      html.match(/<title[^>]*>([^<]+)<\/title>/i) ||
      html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i) ||
      html.match(/<meta\s+name="twitter:title"\s+content="([^"]+)"/i)
    if (titleMatch) {
      metadata.title = titleMatch[1].trim()
    }

    // Description
    const descMatch =
      html.match(/<meta\s+name="description"\s+content="([^"]+)"/i) ||
      html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i) ||
      html.match(/<meta\s+name="twitter:description"\s+content="([^"]+)"/i)
    if (descMatch) {
      metadata.description = descMatch[1].trim()
    }

    // Image
    const imageMatch =
      html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i) ||
      html.match(/<meta\s+name="twitter:image"\s+content="([^"]+)"/i)
    if (imageMatch) {
      metadata.image = imageMatch[1].trim()
    }

    return metadata
  } catch (error) {
    // Timeout or fetch error - return empty metadata
    return {}
  } finally {
    clearTimeout(timeoutId)
  }
}

// ========== Social Media Detection ==========

/**
 * Detect if the user agent is a social media crawler
 */
export function isSocialMediaCrawler(userAgent: string): boolean {
  if (!userAgent) return false

  const crawlers = [
    'facebookexternalhit',
    'facebookcatalog',
    'twitterbot',
    'linkedinbot',
    'whatsapp',
    'telegram',
    'slackbot',
    'discord',
    'pinterest',
    'tumblr',
    'redditbot',
  ]

  const lowerUA = userAgent.toLowerCase()
  return crawlers.some((crawler) => lowerUA.includes(crawler))
}

/**
 * Generate HTML with Open Graph tags for social media crawlers
 */
function generateOGHTML(record: URLRecord): string {
  const title = record.metadata?.title || record.url
  const description =
    record.metadata?.description || `Redirect to ${record.url}`
  const image = record.metadata?.image || ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHTML(title)}</title>

    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website">
    <meta property="og:url" content="${escapeHTML(record.url)}">
    <meta property="og:title" content="${escapeHTML(title)}">
    <meta property="og:description" content="${escapeHTML(description)}">
    ${image ? `<meta property="og:image" content="${escapeHTML(image)}">` : ''}

    <!-- Twitter -->
    <meta property="twitter:card" content="${
      image ? 'summary_large_image' : 'summary'
    }">
    <meta property="twitter:url" content="${escapeHTML(record.url)}">
    <meta property="twitter:title" content="${escapeHTML(title)}">
    <meta property="twitter:description" content="${escapeHTML(description)}">
    ${
      image
        ? `<meta property="twitter:image" content="${escapeHTML(image)}">`
        : ''
    }

    <!-- Redirect after a delay for crawlers that execute JavaScript -->
    <meta http-equiv="refresh" content="3;url=${escapeHTML(record.url)}">
    <script>
        setTimeout(function() {
            window.location.href = "${escapeHTML(record.url)}";
        }, 3000);
    </script>
</head>
<body>
    <p>Redirecting to <a href="${escapeHTML(record.url)}">${escapeHTML(
    record.url
  )}</a>...</p>
</body>
</html>`
}

/**
 * Escape HTML special characters
 */
export function escapeHTML(str: string): string {
  const map: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
  }

  return str.replace(/[&<>"'/]/g, (char) => map[char] || char)
}

// ========== Main Router ==========

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    // Health check
    if (path === '/health' || path === '/status') {
      return new Response('OK', { status: 200 })
    }

    // Public JSON endpoint for all URLs
    if (path === '/all.json') {
      const urls = await listAllURLs(env)
      return new Response(JSON.stringify(urls, null, 2), {
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300' // Cache for 5 minutes
        }
      })
    }

    // Handle admin routes
    if (path.startsWith('/admin') || path.startsWith('/api')) {
      return handleAdminRequest(request, env)
    }

    // Root path - redirect to main site
    if (path === '/' || path === '') {
      return Response.redirect('https://danny.is', 302)
    }

    // Extract slug from path
    const slug = path.substring(1).toLowerCase()

    // Validate slug format
    if (!slug || !isValidCustomSlug(slug)) {
      return new Response('Invalid URL', { status: 400 })
    }

    // Rate limiting for redirects (60 requests per minute per IP)
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown'
    const rateLimitKey = `redirect:${clientIP}`
    const isAllowed = await checkRateLimit(env, rateLimitKey, 60, 60000) // 60 req/min

    if (!isAllowed) {
      return new Response('Rate limit exceeded', { status: 429 })
    }

    // Get URL record
    const record = await getURL(env, slug)

    if (!record) {
      return new Response('Not found', { status: 404 })
    }

    // Check if it's a social media crawler
    const userAgent = request.headers.get('User-Agent') || ''
    if (isSocialMediaCrawler(userAgent)) {
      // Return HTML with OG tags for social media crawlers
      return new Response(generateOGHTML(record), {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
        },
      })
    }

    // Regular users and search engines get HTTP 301 redirect
    return Response.redirect(record.url, 301)
  },
}
