import { describe, it, expect } from 'vitest'
import worker from '../src/index'
import { testEnv, createTestURL } from './test-setup'

type ExecutionContext = import('@cloudflare/workers-types').ExecutionContext

describe('Public Routes', () => {
  describe('Root redirect', () => {
    it('should redirect root to danny.is', async () => {
      const request = new Request('http://localhost:8787/')
      const response = await worker.fetch(
        request,
        testEnv,
        {} as ExecutionContext
      )

      expect(response.status).toBe(302)
      expect(response.headers.get('Location')).toBe('https://danny.is')
    })

    it('should redirect empty path to danny.is', async () => {
      const request = new Request('http://localhost:8787')
      const response = await worker.fetch(
        request,
        testEnv,
        {} as ExecutionContext
      )

      expect(response.status).toBe(302)
      expect(response.headers.get('Location')).toBe('https://danny.is')
    })
  })

  describe('All URLs JSON endpoint', () => {
    it('should return empty array when no URLs exist', async () => {
      const request = new Request('http://localhost:8787/all.json')
      const response = await worker.fetch(
        request,
        testEnv,
        {} as ExecutionContext
      )
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('application/json')
      expect(data).toEqual([])
    })

    it('should return all URLs as JSON', async () => {
      // Create test URLs
      const url1 = createTestURL('test-1', 'https://example.com/1')
      const url2 = createTestURL('test-2', 'https://example.com/2')

      await testEnv.URLS_KV.put('urls:test-1', JSON.stringify(url1))
      await testEnv.URLS_KV.put('urls:test-2', JSON.stringify(url2))

      const request = new Request('http://localhost:8787/all.json')
      const response = await worker.fetch(
        request,
        testEnv,
        {} as ExecutionContext
      )
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('application/json')
      expect(data).toHaveLength(2)
      expect(data.some((u: any) => u.slug === 'test-1')).toBe(true)
      expect(data.some((u: any) => u.slug === 'test-2')).toBe(true)
    })

    it('should have cache headers', async () => {
      const request = new Request('http://localhost:8787/all.json')
      const response = await worker.fetch(
        request,
        testEnv,
        {} as ExecutionContext
      )

      expect(response.headers.get('Cache-Control')).toBe('public, max-age=300')
    })
  })

  describe('Short URL redirects', () => {
    it('should redirect to destination URL', async () => {
      const testURL = createTestURL(
        'test-slug',
        'https://example.com/destination'
      )
      await testEnv.URLS_KV.put('urls:test-slug', JSON.stringify(testURL))

      const request = new Request('http://localhost:8787/test-slug')
      const response = await worker.fetch(
        request,
        testEnv,
        {} as ExecutionContext
      )

      expect(response.status).toBe(301)
      expect(response.headers.get('Location')).toBe(
        'https://example.com/destination'
      )
    })

    it('should return 404 for non-existent slug', async () => {
      const request = new Request('http://localhost:8787/non-existent')
      const response = await worker.fetch(
        request,
        testEnv,
        {} as ExecutionContext
      )

      expect(response.status).toBe(404)
    })

    it('should handle case insensitive slugs', async () => {
      const testURL = createTestURL(
        'test-slug',
        'https://example.com/destination'
      )
      await testEnv.URLS_KV.put('urls:test-slug', JSON.stringify(testURL))

      const request = new Request('http://localhost:8787/TEST-SLUG')
      const response = await worker.fetch(
        request,
        testEnv,
        {} as ExecutionContext
      )

      expect(response.status).toBe(301)
      expect(response.headers.get('Location')).toBe(
        'https://example.com/destination'
      )
    })

    it('should serve HTML with OG metadata for social media bots', async () => {
      const testURL = createTestURL(
        'test-slug',
        'https://example.com/destination'
      )
      await testEnv.URLS_KV.put('urls:test-slug', JSON.stringify(testURL))

      const request = new Request('http://localhost:8787/test-slug', {
        headers: { 'User-Agent': 'facebookexternalhit/1.1' },
      })
      const response = await worker.fetch(
        request,
        testEnv,
        {} as ExecutionContext
      )
      const html = await response.text()

      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('text/html')
      expect(html).toContain('<meta property="og:title"')
      expect(html).toContain('Test Page Title')
      expect(html).toContain('<meta http-equiv="refresh"')
      expect(html).toContain('https://example.com/destination')
    })
  })

  describe('Health check', () => {
    it('should respond to health check', async () => {
      const request = new Request('http://localhost:8787/health')
      const response = await worker.fetch(
        request,
        testEnv,
        {} as ExecutionContext
      )
      const text = await response.text()

      expect(response.status).toBe(200)
      expect(text).toBe('OK')
    })

    it('should respond to status check', async () => {
      const request = new Request('http://localhost:8787/status')
      const response = await worker.fetch(
        request,
        testEnv,
        {} as ExecutionContext
      )
      const text = await response.text()

      expect(response.status).toBe(200)
      expect(text).toBe('OK')
    })
  })
})
