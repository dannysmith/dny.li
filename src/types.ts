export interface Env {
  URLS_KV: KVNamespace;
  API_SECRET: string;
  DOMAIN: string;
}

export interface URLRecord {
  url: string;
  slug: string;
  created: string;
  updated: string;
  metadata?: {
    title?: string;
    description?: string;
    image?: string;
  };
}

export interface RateLimitInfo {
  count: number;
  resetTime: number;
}