# StageSessionState Schema & Lifecycle

`StageSessionState` is the single source of truth for a StagePilot Room.

## State Hierarchy

```text
StageSessionState
├── session (roomId, roomCode, title, createdAt, updatedAt, isActive)
├── host (hostUserId, hostDeviceId, isHostConnected)
├── activeControllerDeviceId (string | null)
├── devices (Map of deviceId => DeviceState)
├── materials (Array of Material)
├── presentation (isPresenting, materialId, currentPage, totalPages, currentSlide, nextSlide, blanked, blackoutMode)
├── timer (mode, status, duration, startedAt, pausedAt, remaining, label)
├── brief (activeMessage, history)
└── displays (Map of displayId => DisplayState)
```

## Deterministic Reducer Flow

Commands mutate state deterministically via `stageSessionReducer(state, command)`:
1. Validate command schema with Zod (`CommandDispatcher`).
2. Verify authorization policies with `PermissionPolicy`.
3. Produce an immutable updated state clone with incremented `version` counter.
4. Persist to Durable Object SQLite storage.
5. Broadcast state to all connected WebSockets via `SYNC_STATE`.
