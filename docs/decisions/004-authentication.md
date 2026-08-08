# ADR 004: Host Authentication Strategy & Phase 0.5 Audit

## Context
Section 14 & 20 require an Edge-compatible Host authentication mechanism where Host identity binds room ownership across device reconnects.

## Current Audit Findings (RUNTIME-VERIFIED)
- **Foundation Status**: Edge-compatible JWT session token generation (`src/lib/auth/jwt.ts`) using `jose` (HMAC-SHA256). Room ownership is bound to `hostUserId`.
- **Phase 0.5 Acceptable Boundary**: Secrets (`JWT_SECRET`) remain server-only. Host can disconnect and rejoin from any device without destroying active sessions.
- **Phase 1 Production Auth Strategy (Deferred to Phase 1)**:
  - Database user account storage (Cloudflare D1 / Better-Auth).
  - Secure HTTP-only cookies with `SameSite=Strict` and `Secure` flags.
  - Session revocation list & brute-force rate limiting.
