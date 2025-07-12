import { beforeEach, vi } from 'vitest'
import { Env } from '../src/types'

// Mock fetchPageMetadata to avoid network calls
vi.mock('../src/index', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../src/index')>()
  return {
    ...mod,
    fetchPageMetadata: vi.fn().mockResolvedValue({
      title: 'Test Page Title',
      description: 'Test page description',
      image: 'https://example.com/test-image.jpg'
    })
  }
})

// Mock KV store for testing
class MockKVNamespace {
  private store = new Map<string, string>()
  
  async get(key: string): Promise<string | null> {
    return this.store.get(key) || null
  }
  
  async put(key: string, value: string): Promise<void> {
    this.store.set(key, value)
  }
  
  async delete(key: string): Promise<void> {
    this.store.delete(key)
  }
  
  async list(options?: { prefix?: string }): Promise<{ keys: { name: string }[] }> {
    const keys: { name: string }[] = []
    for (const [key] of this.store) {
      if (!options?.prefix || key.startsWith(options.prefix)) {
        keys.push({ name: key })
      }
    }
    return { keys }
  }
  
  clear() {
    this.store.clear()
  }
}

const mockKV = new MockKVNamespace()

// Test environment setup
export const testEnv: Env = {
  URLS_KV: mockKV as any,
  API_SECRET: 'test-secret-key',
  DOMAIN: 'localhost:8787'
}

// Helper function to clear test data
export async function clearTestData() {
  (mockKV as any).clear()
}

// Helper function to create test URL record
export function createTestURL(slug: string, url: string = 'https://example.com') {
  return {
    url,
    slug,
    created: '2024-01-01T00:00:00Z',
    updated: '2024-01-01T00:00:00Z',
    metadata: {
      title: 'Test Page Title',
      description: 'Test page description',
      image: 'https://example.com/test-image.jpg'
    }
  }
}

// Helper to make authenticated API request
export function createAuthenticatedRequest(url: string, options: RequestInit = {}) {
  return new Request(url, {
    ...options,
    headers: {
      'Authorization': 'Bearer test-secret-key',
      'Content-Type': 'application/json',
      ...options.headers
    }
  })
}

// Setup that runs before each test
beforeEach(async () => {
  await clearTestData()
})