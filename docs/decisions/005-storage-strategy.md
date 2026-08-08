# ADR 005: Storage Strategy & Data Separation

## Context
StagePilot requires high-performance realtime state coordination combined with persistent account metadata and binary object storage for presentation materials.

## Decision
Enforce strict 3-tier data separation:
1. **Cloudflare D1**: Persistent Host account credentials, session metadata, persistent Room records, and Event workflows.
2. **SQLite-backed Durable Objects (`StageRoom`)**: Authoritative in-memory & SQLite persistent realtime Room state (`StageSessionState`), connected devices, slide indices, timestamp timers, and live speaker briefs.
3. **Cloudflare R2**: Presentation material binaries (PDF, PPTX, Images) accessed via direct browser upload authorization and scoped object keys (`rooms/{roomId}/materials/{materialId}/source`).

## Consequences (RUNTIME-VERIFIED)
Zero high-frequency WebSocket state writes to D1, keeping D1 row operations minimal while guaranteeing sub-50ms realtime synchronization.
