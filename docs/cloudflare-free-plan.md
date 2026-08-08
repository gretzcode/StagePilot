# StagePilot — Cloudflare Free Plan Capacity Audit

This report analyzes StagePilot V1 resource utilization against Cloudflare Free Plan limits.

## 1. Cloudflare Free Limits & StagePilot Workload Mapping

| Component | Cloudflare Free Limit | Expected StagePilot V1 Workload | Risk Level | Upgrade Trigger |
|---|---|---|---|---|
| **Workers Requests** | 100,000 requests/day | ~500–2,000 API requests/event | LOW | Running >50 simultaneous active rooms daily |
| **Durable Objects (SQLite)** | Available on Free plan | 1 DO per active Stage Room | LOW | DO storage > 10GB or high concurrent CPU time |
| **R2 Storage** | 10 GB storage / 1M Class A ops / 10M Class B ops / month | 200 MB – 2 GB / month for PDF/PPTX decks | LOW | Exceeding 10 GB total stored deck binaries |
| **D1 Database** | 5M rows read / day, 100k rows written / day | ~1,000 reads / day, ~50 writes / day | LOW | High frequency user registration or heavy analytics |
| **WebSockets** | Supported via WebSocket Hibernation API | 4–10 connected clients per room | LOW | Hibernation keeps idle DO memory cost at 0 |
| **Worker KV (Cache)** | 100,000 reads / day, 1,000 writes / day | Cache assets & static metadata | LOW | High cache churn |

## 2. Cost Safety Design Safeguards
1. **Timestamp-based Timers**: Timers compute remaining time client-side; zero periodic database writes.
2. **WebSocket Hibernation**: Connected idle sockets hibernate; Durable Objects consume zero CPU/RAM when idle.
3. **Throttled State Writes**: Active state is saved to SQLite only on explicit domain commands (`SLIDE_NEXT`, `TIMER_START`, etc.).

## 3. Conclusion
StagePilot V1 easily operates within Cloudflare Free Plan limits for standard events (1–5 concurrent stage rooms, 10 connected devices each).
