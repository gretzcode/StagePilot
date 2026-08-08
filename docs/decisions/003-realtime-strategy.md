# ADR 003: Realtime Strategy & Hibernation State Recovery

## Context
Stage Control demands sub-50ms synchronization across multiple Control, Audience, and Confidence devices. Cloudflare Durable Objects hibernate in memory when idle.

## Decision & Audit Findings (RUNTIME-VERIFIED)
- **WebSocket Hibernation**: WebSockets remain connected using `this.ctx.acceptWebSocket(server, [deviceId])`.
- **Hibernation State Restoration Safety**: `webSocketMessage()` and `webSocketClose()` call `await this.ensureStateLoaded()` before processing incoming commands. If a Durable Object is evicted from memory during hibernation and wakes up upon a WebSocket message, persistent state is restored from SQLite storage (`this.ctx.storage.get("state")`).
- **Attachment Size Minimization**: Only `deviceId` string tag is stored in WebSocket attachments; the complete `StageSessionState` resides securely in Durable Object storage.

## Consequences
Memory hibernation keeps costs low while guaranteeing 100% state correctness across object reinitialization.
