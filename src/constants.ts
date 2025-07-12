/**
 * Application constants
 * Centralized configuration values for timeouts, limits, and durations
 */

// Rate Limiting
export const RATE_LIMITS = {
  REDIRECT_REQUESTS_PER_MINUTE: 60,
  REDIRECT_WINDOW_MS: 60000, // 1 minute
} as const

// Cache Settings
export const CACHE = {
  ALL_URLS_MAX_AGE: 300, // 5 minutes
} as const

// Timeouts
export const TIMEOUTS = {
  METADATA_FETCH_MS: 5000, // 5 seconds
} as const

// Session Management
export const SESSION = {
  DURATION_MS: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
  DURATION_SECONDS: 7 * 24 * 60 * 60, // 7 days in seconds
  CLEANUP_INTERVAL_MS: 15 * 60 * 1000, // 15 minutes
} as const

// Slug Generation
export const SLUG = {
  RANDOM_SUFFIX_MAX: 1000,
} as const