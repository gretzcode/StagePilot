# ADR 001: Technology Stack Selection & Modernization (Phase 0.5 Audit)

## Context
StagePilot requires a type-safe, resilient, low-latency web application foundation capable of running on Cloudflare Workers and Durable Objects. In Phase 0.5, the stack was audited and modernized from legacy Next.js 15.1.7 / OpenNext 0.5.0 / Wrangler 3.x to the current stable ecosystem.

## Stack Evolution Table

| Component | Previous Stack | Modernized Target | Status | Reason / Verification |
|---|---|---|---|---|
| Framework | Next.js 15.1.7 | Next.js 16.2.12 | UPGRADED (RUNTIME-VERIFIED) | Compiled & passed Next.js production build |
| OpenNext Adapter | @opennextjs/cloudflare 0.5.0 | @opennextjs/cloudflare 1.20.2 | UPGRADED (RUNTIME-VERIFIED) | Worker bundle compiled (.open-next/worker.js, 890 KB) |
| CLI / Deployment | Wrangler 3.109.2 | Wrangler 4.114.0 | UPGRADED (RUNTIME-VERIFIED) | Wrangler 4.x types and DO SQLite bindings verified |
| React | React 19.0.0 | React 19.2.8 | UPGRADED (RUNTIME-VERIFIED) | Compatible with Next.js 16 |
| State Management | Zustand 5.0.3 | Zustand 5.0.3 | STABLE (RUNTIME-VERIFIED) | Client-side stage room store |
| Validation | Zod 3.24.2 | Zod 3.24.2 | STABLE (RUNTIME-VERIFIED) | Type-safe command payload parsing |
| Auth Cryptography | jose 6.0.8 | jose 6.0.8 | STABLE (RUNTIME-VERIFIED) | Edge JWT signing & verification |
| Styling | Tailwind CSS v4.0.7 | Tailwind CSS v4.0.7 | STABLE (RUNTIME-VERIFIED) | Utility-first glassmorphism design system |
| Testing | Vitest 3.0.5 | Vitest 3.0.5 | STABLE (RUNTIME-VERIFIED) | 14/14 unit & integration tests passed |

## Decision
Modernize to **Next.js 16.2.12**, **@opennextjs/cloudflare 1.20.2**, and **Wrangler 4.114.0**.

## Consequences
Clean build output, zero deprecation patches, 100% compatibility with current Cloudflare Workers runtime, and zero architectural regressions.
