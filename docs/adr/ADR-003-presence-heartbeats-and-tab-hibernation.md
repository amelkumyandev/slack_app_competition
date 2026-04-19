# ADR-003: Presence Heartbeats and Tab Hibernation

## Status

Accepted

## Context

Presence must support online, AFK, and offline across multiple tabs. Browsers can suspend inactive tabs, which means JavaScript stops and explicit “inactive” events cannot be relied on.

## Decision

Use per-tab heartbeats with TTL in Redis. The client sends periodic heartbeats with last interaction metadata while the tab is alive. The server computes user presence from the freshest tab records.

## Consequences

### Positive

- robust to tab sleep and hibernation
- supports multi-tab aggregation
- low latency and simple server-side expiry model

### Negative

- requires Redis or a similar TTL-capable ephemeral store
- presence is eventually consistent within the heartbeat window

## Implementation notes

- each tab has a `tabId`
- store `lastInteractionAt` and `lastHeartbeatAt`
- online if any live tab is recently active
- AFK if tabs exist but all are idle
- offline if all tab heartbeats expire
