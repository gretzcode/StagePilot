# ADR 005: Material Presentation Rendering Strategy

## Context
Presentation material formats include PDF, PPT/PPTX, URL, and IMAGE.

## Decision
- Define format-agnostic abstraction contracts: `Material`, `MaterialProvider`, `MaterialRenderer`, and `PresentationAdapter`.
- Decouple presentation state management (`currentPage`, `materialId`, `blanked`) from underlying format renderers.

## Consequences
New format support (e.g. video streams or 3D models) can be added without modifying the realtime presentation control contracts.
