import { describe, it, expect } from "vitest";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { applySecurityHeaders } from "@/lib/security/headers";
import { NextResponse } from "next/server";

describe("Phase 3 Security & Rate Limiting Tests", () => {
  it("Enforces sliding window rate limits on sensitive endpoints", () => {
    const clientId = "client-ip-123.45.67.89";
    const route = "auth-login";
    const opts = { windowMs: 1000, maxRequests: 3 };

    // Request 1, 2, 3 -> Allowed
    expect(checkRateLimit(clientId, route, opts).allowed).toBe(true);
    expect(checkRateLimit(clientId, route, opts).allowed).toBe(true);
    expect(checkRateLimit(clientId, route, opts).allowed).toBe(true);

    // Request 4 -> Rejected
    const rejected = checkRateLimit(clientId, route, opts);
    expect(rejected.allowed).toBe(false);
    expect(rejected.remaining).toBe(0);
  });

  it("Applies strict production HTTP security headers to responses", () => {
    const baseResponse = NextResponse.json({ ok: true });
    const securedResponse = applySecurityHeaders(baseResponse);

    expect(securedResponse.headers.get("Content-Security-Policy")).toContain("default-src 'self'");
    expect(securedResponse.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(securedResponse.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(securedResponse.headers.get("Strict-Transport-Security")).toContain("max-age=");
  });
});
