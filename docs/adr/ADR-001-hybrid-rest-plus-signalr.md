# ADR-001: Hybrid REST + SignalR

## Status

Accepted

## Context

The application needs low-latency live updates for chat and presence, but it also needs durable history, secure writes, and a straightforward QA story. Pure REST polling is too expensive and too slow for 100+ active users. Pure WebSocket-only state management makes the app harder to reason about and more fragile during reconnects.

## Decision

Use a **hybrid model**:

- **REST** for commands, queries, initial fetch, history pagination, uploads/downloads, admin flows, and sync repair
- **SignalR** for low-latency fan-out of message, presence, unread, invitation, and moderation events

## Consequences

### Positive

- cleaner write path
- durable and auditable command processing
- simpler reconnect and gap repair model
- lower complexity than an all-WebSocket state machine
- better scalability than heavy polling

### Negative

- the frontend must coordinate two transport styles
- contracts must stay aligned between API and SignalR payloads

## Implementation notes

- message create/edit/delete should succeed through REST first
- SignalR publishes only after persistence succeeds
- clients use REST sync to repair missed SignalR events
