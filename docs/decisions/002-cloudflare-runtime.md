# ADR 002: Cloudflare Workers & OpenNext 1.20.2 Target Runtime

## Context
The deployment target is Cloudflare Workers Free with SQLite-backed Durable Objects using Wrangler 4.114.0 and `@opennextjs/cloudflare` 1.20.2.

## Decision
- Use OpenNext 1.20.2 to bundle Next.js 16.2.12 into `.open-next/worker.js`.
- Store authoritative stage session state inside SQLite-backed Durable Objects (`StageRoom`).
- Use `wrangler.jsonc` and `open-next.config.ts` (`proxyExternalRequest: "fetch"`) for build orchestration.

## Consequences (RUNTIME-VERIFIED)
No Node.js server dependencies in production runtime. All API routes and worker logic are edge-compatible.
