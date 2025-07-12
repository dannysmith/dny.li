import { describe, it, expect } from 'vitest'
import worker from '../src/index'
import { testEnv, createTestURL, getTestUrl } from './test-setup'

type ExecutionContext = import('@cloudflare/workers-types').ExecutionContext

// Helper to create session cookie for UI tests
async function createSessionRequest(url: string, options: RequestInit = {}) {
  // First login to get session cookie
  const loginForm = new FormData()
  loginForm.append('password', 'test-secret-key')

  const loginRequest = new Request(getTestUrl('/admin/login'), {
    method: 'POST',
    body: loginForm,
  })

  const loginResponse = await worker.fetch(
    loginRequest,
    testEnv,
    {} as ExecutionContext
  )
  const setCookieHeader = loginResponse.headers.get('Set-Cookie')

  if (!setCookieHeader) {
    throw new Error('Failed to get session cookie')
  }

  return new Request(url, {
    ...options,
    headers: {
      Cookie: setCookieHeader.split(';')[0], // Get just the cookie value
      ...options.headers,
    },
  })
}

describe('Admin UI', () => {
  describe('Authentication', () => {
    it('should redirect unauthenticated users to login', async () => {
      const request = new Request(getTestUrl('/admin'))
      const response = await worker.fetch(
        request,
        testEnv,
        {} as ExecutionContext
      )

      expect(response.status).toBe(302)
      expect(response.headers.get('Location')).toBe(
        getTestUrl('/admin/login')
      )
    })

    it('should login with correct password', async () => {
      const formData = new FormData()
      formData.append('password', 'test-secret-key')

      const request = new Request(getTestUrl('/admin/login'), {
        method: 'POST',
        body: formData,
      })

      const response = await worker.fetch(
        request,
        testEnv,
        {} as ExecutionContext
      )

      expect(response.status).toBe(302)
      expect(response.headers.get('Location')).toBe(
        getTestUrl('/admin')
      )
      expect(response.headers.get('Set-Cookie')).toContain(
        'url_shortener_session='
      )
    })

    it('should reject incorrect password', async () => {
      const formData = new FormData()
      formData.append('password', 'wrong-password')

      const request = new Request(getTestUrl('/admin/login'), {
        method: 'POST',
        body: formData,
      })

      const response = await worker.fetch(
        request,
        testEnv,
        {} as ExecutionContext
      )
      const html = await response.text()

      expect(response.status).toBe(200)
      expect(html).toContain('Invalid password')
    })
  })

  describe('Main Admin Page', () => {
    it('should display admin page for authenticated users', async () => {
      const request = await createSessionRequest(getTestUrl('/admin'))
      const response = await worker.fetch(
        request,
        testEnv,
        {} as ExecutionContext
      )
      const html = await response.text()

      expect(response.status).toBe(200)
      expect(html).toContain('URL to shorten')
      expect(html).toContain('Create Short URL')
    })

    it('should display success message from query params', async () => {
      const request = await createSessionRequest(
        getTestUrl('/admin?success=Test%20success%20message')
      )
      const response = await worker.fetch(
        request,
        testEnv,
        {} as ExecutionContext
      )
      const html = await response.text()

      expect(response.status).toBe(200)
      expect(html).toContain('Test success message')
    })

    it('should display error message from query params', async () => {
      const request = await createSessionRequest(
        getTestUrl('/admin?error=Test%20error%20message')
      )
      const response = await worker.fetch(
        request,
        testEnv,
        {} as ExecutionContext
      )
      const html = await response.text()

      expect(response.status).toBe(200)
      expect(html).toContain('Test error message')
    })
  })

  describe('Form Submissions', () => {
    it('should create URL and redirect back to admin', async () => {
      const formData = new FormData()
      formData.append('url', 'https://example.com/test')
      formData.append('slug', 'test-slug')

      const request = await createSessionRequest(
        getTestUrl('/admin/create'),
        {
          method: 'POST',
          body: formData,
        }
      )

      const response = await worker.fetch(
        request,
        testEnv,
        {} as ExecutionContext
      )

      expect(response.status).toBe(302)
      const location = response.headers.get('Location')
      expect(location).toContain('/admin?success=')
      expect(location).toContain('test-slug')
    })

    it('should update URL and redirect back to admin', async () => {
      // Create test URL first
      const testURL = createTestURL('test-slug', 'https://old-url.com')
      await testEnv.URLS_KV.put('urls:test-slug', JSON.stringify(testURL))

      const formData = new FormData()
      formData.append('url', 'https://new-url.com')

      const request = await createSessionRequest(
        getTestUrl('/admin/update/test-slug'),
        {
          method: 'POST',
          body: formData,
        }
      )

      const response = await worker.fetch(
        request,
        testEnv,
        {} as ExecutionContext
      )

      expect(response.status).toBe(302)
      const location = response.headers.get('Location')
      expect(location).toContain('/admin?success=')
    })

    it('should delete URL and redirect back to admin', async () => {
      // Create test URL first
      const testURL = createTestURL('test-slug')
      await testEnv.URLS_KV.put('urls:test-slug', JSON.stringify(testURL))

      const formData = new FormData()
      
      const request = await createSessionRequest(
        getTestUrl('/admin/delete/test-slug'),
        {
          method: 'POST',
          body: formData,
        }
      )

      const response = await worker.fetch(
        request,
        testEnv,
        {} as ExecutionContext
      )

      expect(response.status).toBe(302)
      const location = response.headers.get('Location')
      expect(location).toContain('/admin?success=')
    })
  })

  describe('Edit Form', () => {
    it('should display edit form for existing URL', async () => {
      const testURL = createTestURL(
        'test-slug',
        'https://example.com/edit-test'
      )
      await testEnv.URLS_KV.put('urls:test-slug', JSON.stringify(testURL))

      const request = await createSessionRequest(
        getTestUrl('/admin/edit/test-slug')
      )
      const response = await worker.fetch(
        request,
        testEnv,
        {} as ExecutionContext
      )
      const html = await response.text()

      expect(response.status).toBe(200)
      expect(html).toContain('Edit Short URL')
      expect(html).toContain('test-slug')
      expect(html).toContain('https:&#x2F;&#x2F;example.com&#x2F;edit-test')
      expect(html).toContain('Update URL')
      expect(html).toContain('Cancel')
    })

    it('should return 404 for non-existent URL', async () => {
      const request = await createSessionRequest(
        getTestUrl('/admin/edit/non-existent')
      )
      const response = await worker.fetch(
        request,
        testEnv,
        {} as ExecutionContext
      )

      expect(response.status).toBe(404)
    })
  })

  describe('Logout', () => {
    it('should logout and redirect to login page', async () => {
      const request = await createSessionRequest(
        getTestUrl('/admin/logout'),
        {
          method: 'POST',
        }
      )

      const response = await worker.fetch(
        request,
        testEnv,
        {} as ExecutionContext
      )

      expect(response.status).toBe(302)
      expect(response.headers.get('Location')).toBe(
        getTestUrl('/admin/login')
      )
      expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0')
    })
  })
})
