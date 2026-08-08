# ADR 009: Material Lifecycle & Retention Strategy

## Material Lifecycle States
`UPLOADING` -> `PROCESSING` -> `READY` / `ERROR` -> `DELETING` -> `DELETED`

## Retention
Materials belong to Rooms. Deleting a material marks D1 record as `DELETED` and schedules R2 object removal. Closed Rooms retain material metadata for event archives.
