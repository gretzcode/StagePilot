# ADR 006: Security Architecture & Rate Limiting

## Context
StagePilot operates in live event environments requiring secure authentication, input sanitization, and protection against unauthorized control injection.

## Security Controls (RUNTIME-VERIFIED)
1. **Password Security**: Web Crypto API PBKDF2-SHA256 (100,000 iterations) for Worker compatibility.
2. **Session Hardening**: HttpOnly, Secure, `SameSite=Strict` cookies (`stagepilot_session_id`).
3. **Rate Limiting**: Sliding window rate limiters protecting `/api/auth/login`, `/api/room/create`, and `/api/material/upload`.
4. **Security Headers**: Strict CSP, `nosniff`, `SAMEORIGIN`, and HSTS headers.
5. **Server-Side Authorization**: PermissionPolicy enforces role boundaries inside Durable Objects; display roles (Audience, Confidence) cannot execute control commands.
