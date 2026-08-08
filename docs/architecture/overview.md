# StagePilot — Architecture Overview

StagePilot is an authoritative realtime stage control system engineered for live event production environments.

## 1. System Runtime Interfaces

1. **Control Room (`/control`, `/control/presentation`)**: Operated by the Host and approved Control devices for slide navigation, timer triggers, speaker briefs, and display blanking.
2. **Audience Display (`/display/audience`)**: Clean, fullscreen presentation output without browser chrome or UI widgets.
3. **Confidence Display (`/display/confidence`)**: Dedicated speaker monitor featuring current slide preview, next slide preview, stage countdown timer, and live show caller briefs.

## 2. Fundamental Model

```text
HOST
  |
  | authenticated
  v
ROOM
  |
  +-- CONTROL (Host Control, Backup Control, Show Caller)
  +-- AUDIENCE DISPLAY
  +-- CONFIDENCE DISPLAY
  |
  v
REALTIME SESSION STATE (Cloudflare Durable Object)
```

## 3. Key Design Principles

- **Authoritative Edge State**: Local browser state is never the source of truth. All updates flow through the StagePilot Durable Object (`StageRoom`).
- **WebSocket Hibernation**: Uses Cloudflare's WebSocket Hibernation API for zero-downtime, memory-efficient connection persistence.
- **Failover & Host Reconnect**: Host disconnect does not destroy active rooms. Controls remain functional and Host can seamlessly reconnect from any device.
- **Strict Role Isolation**: Display outputs cannot mutate presentation state; Control devices are restricted from administrative actions.
