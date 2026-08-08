# ADR 007: Deployment Pipeline & Environment Separation

## Pipeline Stages
1. `npm run typecheck`
2. `npm run lint`
3. `npm run test`
4. `npm run build` (Next.js production build)
5. `npm run build:worker` (`opennextjs-cloudflare` bundle generation)
6. `wrangler d1 migrations apply DB`
7. `wrangler deploy`

## Verification (RUNTIME-VERIFIED)
Worker bundle generated at `.open-next/worker.js` with Wrangler 4.114.0 configuration.
