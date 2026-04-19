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

The server returns messages in stable chronological order for rendering.

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
- syncing missing messages
- connection restored
- retrying

The server should log:

- connection opened/closed
- group join/leave
- sync request duration
- number of recovered messages
- missed watermark windows
