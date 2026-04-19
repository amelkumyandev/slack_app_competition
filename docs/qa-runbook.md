# QA Runbook

## Goal

A QA reviewer should be able to take the repository, run Docker commands only, and validate the app without installing local toolchains.

## Expected startup contract

```bash
docker compose up --build
```

This should start the full baseline stack and make the app reachable at the documented URL.

## Compose expectations

The final solution should expose:

- the chat web UI
- the backend API and SignalR endpoints
- PostgreSQL and Redis internally
- a mounted volume for uploads

Optional later services:

- `e2e`
- `loadtest`
- `xmpp-a`
- `xmpp-b`

## QA smoke checklist

### A. Auth and account

- register a new account
- sign in with email + password
- verify persistent login after browser restart
- change password
- request a password reset flow
- sign out current session only

### B. Sessions

- open app in another browser or profile
- verify Sessions screen lists both sessions
- revoke the other session
- confirm current session survives

### C. Public and private rooms

- create a public room
- verify it appears in public catalog
- join with another user
- create a private room
- invite another user
- confirm private room does not appear in public catalog

### D. Contacts and PM rules

- send friend request by username
- accept request
- confirm PM becomes available
- ban the other user
- verify existing PM history remains visible but becomes read-only/frozen

### E. Presence and multi-tab behavior

- keep one tab active and one tab idle
- verify user remains online
- leave all tabs idle for >1 minute
- verify AFK
- close all tabs
- verify offline after timeout window

### F. Messaging

- send room and direct messages
- send multiline message
- edit own message
- delete own message
- admin deletes another user’s room message
- reply to an older message
- scroll old history

### G. Attachments

- upload image and generic file
- verify original file name is preserved
- add optional comment
- download as authorized user
- remove user from room and verify file access is lost
- delete room and verify attachment cleanup behavior

### H. Moderation

- promote member to admin
- remove admin (non-owner only)
- ban user from room
- view who banned the user
- unban user

## Critical advanced validation

### 1. Long-absent user

- create a user and add them to active rooms
- stop using that account
- generate a large number of new messages while the user is absent
- verify there is no unbounded per-user queue
- verify the user can reconnect and restore history via sync endpoints

### 2. Watermark gap recovery

- force the client to miss one SignalR message event
- verify the next event creates a watermark gap
- verify the client detects the gap and repairs via REST sync

### 3. Browser hibernation

- open a tab, then simulate hidden or hibernated tab behavior
- verify no explicit inactive signal is required
- verify server marks AFK and offline from heartbeat expiry

### 4. Large history

- seed a room with 100,000 messages
- verify initial load stays usable
- verify upward infinite scroll works progressively
- verify scroll anchor remains stable when older messages are prepended

### 5. Moderate realtime fan-out

- simulate 100+ connected users
- verify live delivery stays within target latency
- verify reconnect and sync repair continue to work under load

## Automated QA commands

With the Docker stack up, QA can now run:

```bash
npm run qa:smoke
```

This script covers:

- web route reachability
- auth bootstrap
- session lookup
- room creation/join
- room message + reply
- friendship acceptance + direct conversation bootstrap
- attachment upload/download and loss-of-access enforcement
- presence heartbeat recording

For advanced scenarios, QA can also run:

```bash
npm run qa:load:history
npm run qa:load:fanout
```

Recommended environment overrides when needed:

- `QA_API_BASE_URL`
- `QA_WEB_BASE_URL`
- `QA_HISTORY_MESSAGE_COUNT`
- `QA_FANOUT_USER_COUNT`

## Operational validation

During startup and smoke tests, verify:

- all critical containers are healthy
- API logs show no migration loops
- Redis is receiving presence heartbeats
- uploads volume is writable
- SignalR connections are stable
- reconnect behavior is visible and recoverable

## Documentation QA should expect

The final README should include:

- startup command
- default ports / URL
- the smoke and load commands
- the temporary-user strategy used by QA scripts
- how to run tests
- how to reset local data
- known limitations if any

## Podman Desktop note

Images, healthchecks, clear container names, and mounted volumes should remain easy to inspect in Podman Desktop, but the official repo contract remains standard Docker Compose.
