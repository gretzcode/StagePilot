# Realtime Architecture & Hibernation State Safety

StagePilot leverages Cloudflare Workers and Durable Objects (`StageRoom`) for low-latency state coordination.

## Architecture Diagram

```text
                  CLIENT WEBSOCKETS
        (Control / Audience / Confidence / Host)
                           |
                           v
              Cloudflare Worker Gateway
                           |
                           v
                 StageRoom Durable Object
               (WebSocket Hibernation API)
                           |
                           +---> SQLite Storage persistence
                           |
                           +---> Hibernation Recovery Guard
                           |
                           +---> Broadcast state updates
```

## Hibernation Lifecycle & Recovery Guard

1. **Connection Tagging**: WebSockets are accepted using `ctx.acceptWebSocket(ws, [deviceId])`.
2. **Hibernation**: When no messages arrive, the Durable Object instance is evicted from memory. Connected WebSockets remain active in Cloudflare's infrastructure.
3. **Re-initialization Wakeup**: Upon new message arrival, `StageRoom` constructor runs, followed immediately by `webSocketMessage()`.
4. **State Recovery**: `webSocketMessage()` calls `ensureStateLoaded()`, fetching the latest `StageSessionState` from SQLite storage (`ctx.storage.get("state")`).
5. **Command Execution**: Command is processed via `CommandDispatcher.dispatch()`, persisted to SQLite, and broadcast via `SYNC_STATE`.
