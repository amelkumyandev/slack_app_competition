# ADR-004: History Pagination and Virtualization

## Status

Accepted

## Context

Rooms may hold 100,000+ messages over time. Rendering or fetching full history at once will make the application slow and memory-heavy.

## Decision

Use stable watermark-based history pagination on the backend and virtualized message rendering on the frontend.

## Consequences

### Positive

- efficient long-history loading
- stable ordering
- better client performance
- easier scroll-anchor preservation

### Negative

- prepend logic is more complex than simple full-list rendering
- tests must cover virtualized scrolling behavior carefully

## Implementation notes

- fetch older history by `beforeWatermark`
- keep page sizes modest
- preserve scroll anchor when prepending
- do not rely on offset pagination for deep history
