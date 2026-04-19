# Realtime Sync Architecture

This document defines the intended **REST + SignalR + watermark** model.

## 1. Design intent

The system must support:

- low-latency live chat for 100+ active users
- durable history for years
- gap repair after missed realtime events
- reconnect safety
- browser tab hibernation behavior
- no unbounded per-user delivery queues

## 2. Hybrid model

### REST is responsible for

- initial conversation load
- older history pagination
- catch-up sync after reconnect or gap detection
- message create/edit/delete commands
- room and admin actions
- uploads/downloads
- read marker updates

### SignalR is responsible for

- new message fan-out
- edit/delete fan-out
- presence updates
- unread summary updates
- invitation/moderation hints
- reconnect status hints

## 3. Conversation groups

Use SignalR groups to avoid broad fan-out:

- `user:{userId}`
- `conversation:{conversationId}`

The server should add connections to user and open-conversation groups as needed.

## 3.1 Current hub foundation

The current implementation exposes:

- hub route: `/hubs/realtime`
- contract endpoint: `GET /api/realtime/contract`

Current hub methods:

- `SubscribeConversation`
- `UnsubscribeConversation`
- `Heartbeat`
- `Ping`

Current client events:

- `connection.ready`
- `subscription.updated`
- `event.received`

Current conversation key support:

- `conversation:{conversationId}`
- legacy `room:{roomId}` resolution for backward-compatible room lookups

That means the current SignalR group for a room conversation is:

- `conversation:{conversationId}`

Room subscriptions now resolve to a durable conversation identifier, which keeps the naming aligned with the broader conversation model the messaging branch will continue to extend.

## 3.2 Current presence heartbeat contract

The current implementation also exposes:

- `GET /api/presence/me`
- `POST /api/presence/heartbeat`
- `presence.state.changed` through the generic `event.received` SignalR envelope

The current client heartbeat payload includes:

- `tabId`
- `lastInteractionAtUtc`
- `visibilityState`
- `connectedAtUtc`

The current aggregate state rules are:

- `online` when at least one live tab has recent interaction
- `afk` when live tabs exist but all tracked interactions are stale
- `offline` when all tab heartbeats have expired

In Docker, the presence store is Redis-backed. In tests and local non-Docker runs, the repo currently falls back to an in-memory store so the stable build and test commands do not require a live Redis instance.

## 4. Watermark contract

Every message event must include:

- `conversationId`
- `watermark`
- `messageId`
- `eventType`
- `serverTimestamp`

Example shape:

```json
{
  "conversationId": "conv_123",
  "watermark": 4571,
  "messageId": "msg_789",
  "eventType": "message.created",
  "serverTimestamp": "2026-04-19T12:10:00Z"
}
```

Current realtime envelopes now carry `conversationId` and `watermark` directly for conversation-scoped events so clients can detect a gap without parsing event-specific payload fields.

## 5. Gap detection rule

If the client last contiguous watermark is `N` and it receives an event with watermark `> N + 1`, the stream is incomplete.

The client must call the sync endpoint:

```text
GET /api/conversations/{conversationId}/sync?afterWatermark={N}
```

## 6. History fetch rule

Older history should be fetched by watermark window, for example:

```text
GET /api/conversations/{conversationId}/messages?beforeWatermark={N}&pageSize=50
```

The current implementation returns **materialized chat messages** in stable chronological order for rendering. Sync repair still uses the event stream endpoint:

```text
GET /api/conversations/{conversationId}/sync?afterWatermark={N}
```

That split keeps the UI simple for replies, edits, and deletes while preserving watermark-aware repair.

## 7. No queue rule

Do not implement endless per-user queues in Redis or memory.

While the user is offline:

- messages are just persisted
- no user-specific backlog grows forever
- on reconnect, the client syncs from durable history

## 8. Reconnect flow

Recommended reconnect sequence:

1. client reconnects to SignalR
2. client sends immediate presence heartbeat
3. client requests active conversation sync using last contiguous watermark
4. client resumes live event processing only after sync completes

## 9. Read tracking

Use conversation read watermarks:

- `conversation_id`
- `user_id`
- `last_read_watermark`
- `updated_at`

This supports unread counts without storing huge per-message delivery state.

## 10. Failure handling

The client should surface friendly states:

- reconnecting
- heartbeat retrying
- syncing missing messages
- connection restored
- retrying

The server should log:

- connection opened/closed
- group join/leave
- presence state transitions
- sync request duration
- number of recovered messages
- missed watermark windows
