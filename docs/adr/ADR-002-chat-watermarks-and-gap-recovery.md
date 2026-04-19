# ADR-002: Chat Watermarks and Gap Recovery

## Status

Accepted

## Context

Users can disconnect, tabs can hibernate, and SignalR messages can be missed during transient failures. The system needs a cheap and reliable way to detect missing events without maintaining unbounded per-user delivery queues.

## Decision

Each conversation has a monotonically increasing **watermark**. Every persisted message receives the next watermark value for that conversation. Clients track the last contiguous watermark they have applied. If a gap is detected, the client calls a REST sync endpoint.

## Consequences

### Positive

- simple message-integrity check
- supports reconnect after missed realtime updates
- avoids endless offline queues
- supports unread state with read watermarks

### Negative

- the database must assign watermarks transactionally
- client state must persist last contiguous watermark per conversation

## Implementation notes

- use `GET /api/conversations/{conversationId}/sync?afterWatermark={n}`
- use `GET /api/conversations/{conversationId}/messages?beforeWatermark={n}&pageSize={k}`
- include `conversationId` and `watermark` in realtime envelopes for conversation-scoped events
- test forced missed-event scenarios explicitly
