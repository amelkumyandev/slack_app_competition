# Acceptance and Load Tests

This document describes the advanced scenarios that must pass before the project is considered competition-ready.

## 1. Acceptance baseline

The following must already work before advanced tests:

- Docker-only startup
- auth and sessions
- public/private rooms
- contacts and PM authorization
- room moderation
- message create/edit/delete/reply
- secure attachments
- unread indicators
- presence
- long-history navigation

## 2. Watermark integrity test

### Objective

Verify that the client detects and repairs missing message events.

### Scenario

1. Open the same conversation in two clients.
2. Force one client to miss exactly one SignalR event.
3. Send another message so the next watermark arrives.
4. Verify the client detects the watermark gap.
5. Verify it requests `sync?afterWatermark=<lastSeen>`.
6. Verify the missing message is restored in the correct place.

## 3. Long-absent user test

### Objective

Verify the system does not grow unbounded per-user queues.

### Scenario

1. Create a user and let them join active rooms.
2. Stop using that account.
3. Generate many messages over time.
4. Inspect the system design and runtime behavior to confirm messages remain in durable storage only.
5. Reconnect the user later.
6. Verify the user catches up from history and sync endpoints.

## 4. Browser hibernation test

### Objective

Verify presence does not depend on explicit inactive events.

### Scenario

1. Open a tab and let it become hidden or suspended.
2. Confirm the client stops sending heartbeats.
3. Verify the server eventually transitions status by TTL expiry.
4. Bring the tab back.
5. Verify immediate heartbeat and presence restoration.

## 5. Multi-tab aggregation test

### Objective

Verify aggregated presence across tabs.

### Scenario

1. Open the app in two tabs for the same user.
2. Keep one active and one idle.
3. Verify the user remains online.
4. Let both go idle.
5. Verify AFK after the idle threshold.
6. Close both tabs.
7. Verify offline after heartbeat expiry.

## 6. Large history test

### Objective

Verify the room remains usable with 100,000 messages.

### Scenario

1. Seed a room with 100,000 messages.
2. Load the latest window.
3. Scroll upward progressively.
4. Verify scroll-anchor stability.
5. Verify memory usage remains reasonable.
6. Verify no full DOM render of all messages occurs.

## 7. Moderate realtime fan-out test

### Objective

Verify live chat works for 100+ active users.

### Scenario

1. Open 100+ active connections.
2. Send messages in a shared room.
3. Verify live delivery latency remains within the target.
4. Verify reconnect and gap repair still work under concurrent load.

## 8. Attachment access regression test

### Objective

Verify file access follows room access.

### Scenario

1. Upload a file to a room.
2. Confirm members can download it.
3. Ban one member from the room.
4. Verify that member can no longer see or download the file.
5. Delete the room.
6. Verify attachment cleanup behavior.

## 9. Suggested pass criteria

- no broken Docker startup
- no message ordering corruption
- no invisible watermark gaps
- no presence state stuck forever after tab sleep
- no unbounded queue behavior
- no UI freeze in 100K history rooms
