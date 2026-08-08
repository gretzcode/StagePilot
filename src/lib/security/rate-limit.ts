/**
 * Production Rate Limiter for Cloudflare Workers
 * Sliding window bucket for sensitive API routes
 */

interface RateLimitStore {
  count: number;
  resetAt: number;
}

const memoryStore = new Map<string, RateLimitStore>();

export interface RateLimitOptions {
  windowMs: number; // Time window in ms (e.g. 60000 = 1 minute)
  maxRequests: number; // Max requests allowed per window
}

export function checkRateLimit(
  clientIpOrId: string,
  routeKey: string,
  options: RateLimitOptions = { windowMs: 60000, maxRequests: 30 }
): { allowed: boolean; remaining: number; resetAt: number } {
  const key = `${routeKey}:${clientIpOrId}`;
  const now = Date.now();
  const entry = memoryStore.get(key);

  if (!entry || now > entry.resetAt) {
    const newEntry: RateLimitStore = {
      count: 1,
      resetAt: now + options.windowMs,
    };
    memoryStore.set(key, newEntry);
    return { allowed: true, remaining: options.maxRequests - 1, resetAt: newEntry.resetAt };
  }

  if (entry.count >= options.maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count += 1;
  return { allowed: true, remaining: options.maxRequests - entry.count, resetAt: entry.resetAt };
}
