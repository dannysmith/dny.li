import { describe, it, expect, beforeEach } from 'vitest'
import { 
  storeURL, 
  getURL, 
  updateURL, 
  deleteURL, 
  listAllURLs 
} from '../src/index'
import { 
  handleCreateURL, 
  handleUpdateURL, 
  handleDeleteURL 
} from '../src/admin'
import { testEnv, clearTestData, createTestURL, createAuthenticatedRequest } from './test-setup'

beforeEach(async () => {
  await clearTestData()
})

describe('KV Storage Functions', () => {
  it('should store and retrieve URL records', async () => {
    const testURL = createTestURL('test-slug', 'https://example.com/test')
    await storeURL(testEnv, testURL)
    
    const retrieved = await getURL(testEnv, 'test-slug')
    expect(retrieved).toEqual(testURL)
  })

  it('should return null for non-existent slugs', async () => {
    const result = await getURL(testEnv, 'non-existent')
    expect(result).toBeNull()
  })

  it('should update existing URL records', async () => {
    const testURL = createTestURL('test-slug', 'https://old-url.com')
    await storeURL(testEnv, testURL)
    
    await updateURL(testEnv, 'test-slug', { 
      url: 'https://new-url.com',
      metadata: { title: 'New Title' }
    })
    
    const updated = await getURL(testEnv, 'test-slug')
    expect(updated?.url).toBe('https://new-url.com')
    expect(updated?.metadata?.title).toBe('New Title')
    expect(updated?.slug).toBe('test-slug') // slug should not change
  })

  it('should delete URL records', async () => {
    const testURL = createTestURL('test-slug')
    await storeURL(testEnv, testURL)
    
    await deleteURL(testEnv, 'test-slug')
    
    const deleted = await getURL(testEnv, 'test-slug')
    expect(deleted).toBeNull()
  })

  it('should list all URL records', async () => {
    const url1 = createTestURL('slug-1', 'https://example.com/1')
    const url2 = createTestURL('slug-2', 'https://example.com/2')
    
    await storeURL(testEnv, url1)
    await storeURL(testEnv, url2)
    
    const allUrls = await listAllURLs(testEnv)
    expect(allUrls).toHaveLength(2)
    expect(allUrls.some(u => u.slug === 'slug-1')).toBe(true)
    expect(allUrls.some(u => u.slug === 'slug-2')).toBe(true)
  })
})

describe('Admin API Functions', () => {
  it('should create URL via handleCreateURL', async () => {
    const request = createAuthenticatedRequest('http://localhost:8787/admin/urls', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://example.com/test', slug: 'custom-slug' })
    })

    const response = await handleCreateURL(request, testEnv)
    const result = await response.json()

    expect(response.status).toBe(201)
    expect(result.success).toBe(true)
    expect(result.data.slug).toBe('custom-slug')
    expect(result.data.url).toBe('https://example.com/test')
    
    // Verify it was actually stored
    const stored = await getURL(testEnv, 'custom-slug')
    expect(stored?.url).toBe('https://example.com/test')
  })

  it('should update URL via handleUpdateURL', async () => {
    // Create initial URL
    const testURL = createTestURL('test-slug', 'https://old-url.com')
    await storeURL(testEnv, testURL)
    
    const request = createAuthenticatedRequest('http://localhost:8787/admin/urls/test-slug', {
      method: 'PUT',
      body: JSON.stringify({ url: 'https://new-url.com' })
    })

    const response = await handleUpdateURL(request, testEnv)
    const result = await response.json()

    expect(response.status).toBe(200)
    expect(result.success).toBe(true)
    expect(result.data.url).toBe('https://new-url.com/')
  })

  it('should delete URL via handleDeleteURL', async () => {
    // Create initial URL
    const testURL = createTestURL('test-slug')
    await storeURL(testEnv, testURL)
    
    const request = createAuthenticatedRequest('http://localhost:8787/admin/urls/test-slug', {
      method: 'DELETE'
    })

    const response = await handleDeleteURL(request, testEnv)
    const result = await response.json()

    expect(response.status).toBe(200)
    expect(result.success).toBe(true)
    
    // Verify it was deleted
    const deleted = await getURL(testEnv, 'test-slug')
    expect(deleted).toBeNull()
  })

  it('should handle malformed requests', async () => {
    const request = createAuthenticatedRequest('http://localhost:8787/admin/urls', {
      method: 'POST',
      body: JSON.stringify({ url: 'http://localhost/test' }) // Dangerous URL (localhost)
    })

    const response = await handleCreateURL(request, testEnv)
    const result = await response.json()

    expect(response.status).toBe(400)
    expect(result.error).toBe('URL contains dangerous content')
  })
})