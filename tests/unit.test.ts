import { describe, it, expect, vi } from 'vitest'
import { 
  isValidURL, 
  isDangerousURL, 
  isValidCustomSlug,
  generateUniqueSlug,
  normalizeURL,
  escapeHTML,
  isSocialMediaCrawler
} from '../src/index'
import { authenticateAPIKey } from '../src/admin'
import { testEnv } from './test-setup'

describe('URL Validation', () => {
  it('should validate correct URLs', () => {
    expect(isValidURL('https://example.com')).toBe(true)
    expect(isValidURL('http://example.com')).toBe(true)
    expect(isValidURL('https://sub.example.com/path?query=1')).toBe(true)
  })

  it('should reject invalid URLs', () => {
    expect(isValidURL('not-a-url')).toBe(false)
    expect(isValidURL('ftp://example.com')).toBe(false)
    expect(isValidURL('')).toBe(false)
    expect(isValidURL('https://')).toBe(false)
  })

  it('should normalize URLs correctly', () => {
    expect(normalizeURL('HTTP://EXAMPLE.COM')).toBe('http://example.com/')
    expect(normalizeURL('https://example.com/')).toBe('https://example.com/')
    expect(normalizeURL('  https://example.com  ')).toBe('https://example.com/')
  })
})

describe('Dangerous URL Detection', () => {
  it('should detect localhost URLs', () => {
    expect(isDangerousURL('http://localhost')).toBe(true)
    expect(isDangerousURL('https://localhost:3000')).toBe(true)
    expect(isDangerousURL('http://127.0.0.1')).toBe(true)
  })

  it('should detect private IP ranges', () => {
    expect(isDangerousURL('http://192.168.1.1')).toBe(true)
    expect(isDangerousURL('http://10.0.0.1')).toBe(true)
    expect(isDangerousURL('http://172.16.0.1')).toBe(true)
  })

  it('should detect dangerous protocols', () => {
    expect(isDangerousURL('javascript:alert(1)')).toBe(true)
    expect(isDangerousURL('data:text/html,<script>alert(1)</script>')).toBe(true)
  })

  it('should allow safe URLs', () => {
    expect(isDangerousURL('https://example.com')).toBe(false)
    expect(isDangerousURL('https://google.com')).toBe(false)
  })
})

describe('Slug Validation and Generation', () => {
  it('should validate custom slugs', () => {
    expect(isValidCustomSlug('valid-slug')).toBe(true)
    expect(isValidCustomSlug('test123')).toBe(true)
    expect(isValidCustomSlug('a-b-c')).toBe(true)
  })

  it('should reject invalid custom slugs', () => {
    expect(isValidCustomSlug('ab')).toBe(false) // too short
    expect(isValidCustomSlug('UPPERCASE')).toBe(false)
    expect(isValidCustomSlug('invalid_slug')).toBe(false) // underscore
    expect(isValidCustomSlug('invalid slug')).toBe(false) // space
    expect(isValidCustomSlug('a'.repeat(51))).toBe(false) // too long
  })

  it('should generate unique slugs', async () => {
    const slug1 = await generateUniqueSlug(testEnv)
    const slug2 = await generateUniqueSlug(testEnv)
    
    expect(slug1).toMatch(/^[a-z]+-[a-z]+$/)
    expect(slug2).toMatch(/^[a-z]+-[a-z]+$/)
    expect(slug1).not.toBe(slug2)
  })
})

describe('Authentication', () => {
  it('should authenticate valid API key', () => {
    const request = new Request('https://example.com', {
      headers: { 'Authorization': 'Bearer test-secret-key' }
    })
    expect(authenticateAPIKey(request, testEnv)).toBe(true)
  })

  it('should reject invalid API key', () => {
    const request = new Request('https://example.com', {
      headers: { 'Authorization': 'Bearer wrong-key' }
    })
    expect(authenticateAPIKey(request, testEnv)).toBe(false)
  })

  it('should reject missing authorization header', () => {
    const request = new Request('https://example.com')
    expect(authenticateAPIKey(request, testEnv)).toBe(false)
  })

  it('should reject malformed authorization header', () => {
    const request = new Request('https://example.com', {
      headers: { 'Authorization': 'Invalid format' }
    })
    expect(authenticateAPIKey(request, testEnv)).toBe(false)
  })
})

describe('Utility Functions', () => {
  it('should escape HTML correctly', () => {
    expect(escapeHTML('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;'
    )
    expect(escapeHTML('Safe text')).toBe('Safe text')
    expect(escapeHTML('AT&T')).toBe('AT&amp;T')
  })

  it('should detect social media crawlers', () => {
    expect(isSocialMediaCrawler('facebookexternalhit/1.1')).toBe(true)
    expect(isSocialMediaCrawler('Twitterbot/1.0')).toBe(true)
    expect(isSocialMediaCrawler('LinkedInBot/1.0')).toBe(true)
    expect(isSocialMediaCrawler('Mozilla/5.0 (compatible; Slackbot-LinkExpanding 1.0')).toBe(true)
    expect(isSocialMediaCrawler('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')).toBe(false)
  })
})