# ADR 010: Lightweight Event Workflow

## Event Concept
Events represent physical stage shows or conference tracks:
- Statuses: `PLANNED`, `LIVE`, `COMPLETED`, `CANCELLED`.
- Mapped 1-to-N with Stage Rooms.
- Room acts as the active realtime runtime for an Event.
