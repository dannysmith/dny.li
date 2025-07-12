import { describe, it, expect } from 'vitest'
import worker from '../src/index'
import { testEnv, createAuthenticatedRequest, createTestURL } from './test-setup'

describe('API Endpoints', () => {
  describe('POST /admin/urls', () => {
    it('should create URL with auto-generated slug', async () => {
      const request = createAuthenticatedRequest('http://localhost:8787/admin/urls', {
        method: 'POST',
        body: JSON.stringify({ url: 'https://example.com/test' })
      })

      const response = await worker.fetch(request, testEnv, {} as ExecutionContext)
      const result = await response.json()

      expect(response.status).toBe(201)
      expect(result.success).toBe(true)
      expect(result.data.url).toBe('https://example.com/test')
      expect(result.data.slug).toMatch(/^[a-z]+-[a-z]+-[a-z]+$/)
      expect(result.shortUrl).toBe(`http://localhost:8787/${result.data.slug}`)
    })

    it('should create URL with custom slug', async () => {
      const request = createAuthenticatedRequest('http://localhost:8787/admin/urls', {
        method: 'POST',
        body: JSON.stringify({ url: 'https://example.com/test', slug: 'custom-slug' })
      })

      const response = await worker.fetch(request, testEnv, {} as ExecutionContext)
      const result = await response.json()

      expect(response.status).toBe(201)
      expect(result.success).toBe(true)
      expect(result.data.slug).toBe('custom-slug')
      expect(result.shortUrl).toBe('http://localhost:8787/custom-slug')
    })

    it('should reject invalid URL', async () => {
      const request = createAuthenticatedRequest('http://localhost:8787/admin/urls', {
        method: 'POST',
        body: JSON.stringify({ url: 'not-a-url' })
      })

      const response = await worker.fetch(request, testEnv, {} as ExecutionContext)
      const result = await response.json()

      expect(response.status).toBe(400)
      expect(result.error).toBe('Invalid URL format')
    })

    it('should reject dangerous URL', async () => {
      const request = createAuthenticatedRequest('http://localhost:8787/admin/urls', {
        method: 'POST',
        body: JSON.stringify({ url: 'javascript:alert(1)' })
      })

      const response = await worker.fetch(request, testEnv, {} as ExecutionContext)
      const result = await response.json()

      expect(response.status).toBe(400)
      expect(result.error).toBe('URL contains dangerous content')
    })

    it('should reject duplicate slug', async () => {
      // Create first URL
      await testEnv.URLS_KV.put('urls:test-slug', JSON.stringify(createTestURL('test-slug')))

      const request = createAuthenticatedRequest('http://localhost:8787/admin/urls', {
        method: 'POST',
        body: JSON.stringify({ url: 'https://example.com/test', slug: 'test-slug' })
      })

      const response = await worker.fetch(request, testEnv, {} as ExecutionContext)
      const result = await response.json()

      expect(response.status).toBe(409)
      expect(result.error).toBe('Slug already exists')
    })

    it('should require authentication', async () => {
      const request = new Request('http://localhost:8787/admin/urls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com/test' })
      })

      const response = await worker.fetch(request, testEnv, {} as ExecutionContext)
      const result = await response.json()

      expect(response.status).toBe(401)
      expect(result.error).toBe('Unauthorized - please login')
    })
  })

  describe('PUT /admin/urls/{slug}', () => {
    it('should update existing URL', async () => {
      // Create test URL
      const testURL = createTestURL('test-slug', 'https://old-url.com')
      await testEnv.URLS_KV.put('urls:test-slug', JSON.stringify(testURL))

      const request = createAuthenticatedRequest('http://localhost:8787/admin/urls/test-slug', {
        method: 'PUT',
        body: JSON.stringify({ url: 'https://new-url.com' })
      })

      const response = await worker.fetch(request, testEnv, {} as ExecutionContext)
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.data.url).toBe('https://new-url.com')
      expect(result.data.slug).toBe('test-slug')
    })

    it('should return 404 for non-existent slug', async () => {
      const request = createAuthenticatedRequest('http://localhost:8787/admin/urls/non-existent', {
        method: 'PUT',
        body: JSON.stringify({ url: 'https://example.com' })
      })

      const response = await worker.fetch(request, testEnv, {} as ExecutionContext)
      const result = await response.json()

      expect(response.status).toBe(404)
      expect(result.error).toBe('URL not found')
    })

    it('should reject invalid URL', async () => {
      const testURL = createTestURL('test-slug')
      await testEnv.URLS_KV.put('urls:test-slug', JSON.stringify(testURL))

      const request = createAuthenticatedRequest('http://localhost:8787/admin/urls/test-slug', {
        method: 'PUT',
        body: JSON.stringify({ url: 'invalid-url' })
      })

      const response = await worker.fetch(request, testEnv, {} as ExecutionContext)
      const result = await response.json()

      expect(response.status).toBe(400)
      expect(result.error).toBe('Invalid URL format')
    })
  })

  describe('DELETE /admin/urls/{slug}', () => {
    it('should delete existing URL', async () => {
      // Create test URL
      const testURL = createTestURL('test-slug')
      await testEnv.URLS_KV.put('urls:test-slug', JSON.stringify(testURL))

      const request = createAuthenticatedRequest('http://localhost:8787/admin/urls/test-slug', {
        method: 'DELETE'
      })

      const response = await worker.fetch(request, testEnv, {} as ExecutionContext)
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.message).toBe('URL deleted successfully')

      // Verify it's actually deleted
      const deleted = await testEnv.URLS_KV.get('urls:test-slug')
      expect(deleted).toBeNull()
    })

    it('should return 404 for non-existent slug', async () => {
      const request = createAuthenticatedRequest('http://localhost:8787/admin/urls/non-existent', {
        method: 'DELETE'
      })

      const response = await worker.fetch(request, testEnv, {} as ExecutionContext)
      const result = await response.json()

      expect(response.status).toBe(404)
      expect(result.error).toBe('URL not found')
    })
  })
})