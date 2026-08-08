# ADR 008: Room Lifecycle Strategy

## States
- `DRAFT`: Room created, initial material loading.
- `ACTIVE`: Live stage control room active with connected devices.
- `PAUSED`: Room temporarily paused.
- `CLOSED`: Room explicitly closed by Host.
- `EXPIRED`: Inactive Room retired after cleanup threshold.

## Behavior
Host disconnect does NOT close the Room. Active presentation and stage timer remain alive until explicitly closed via `[ END ROOM ]`.
