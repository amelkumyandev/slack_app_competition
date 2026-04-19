# Solution Blueprint

## 1. Executive decision

Build the competition entry as a **single monorepo** with a **modular monolith ASP.NET backend** and a **Next.js frontend**. Use **SignalR** for live delivery, **PostgreSQL** for durable data, **Redis** for presence and ephemeral coordination, and a **local filesystem volume** for attachments.

The project risk is dominated by **correctness and delivery speed**, not by hyperscale. The hard parts are consistency rules: room access, bans, multi-tab presence, session isolation, persistent history, secure file access, moderation, long-history usability, and delete semantics.

## 2. Architecture goals

- finish the full required scope before attempting federation
- keep operational complexity low enough for Docker-only QA
- make the architecture friendly to Codex and parallel feature work
- preserve a clean path for XMPP later without distorting phase 1
- deliver a Slack-inspired UX that still matches the competition layout
- keep history robust for years of accumulated messages

## 3. Runtime topology

```text
Browser
  -> Next.js web app
  -> ASP.NET Core API + SignalR
      -> PostgreSQL
      -> Redis
      -> uploads volume
```

Phase 1 should stay simple. Do not block the solution on a dedicated reverse proxy. Add one later only if it clearly improves stability or routing.

## 4. Monorepo shape

```text
/apps
  /web
  /api
/src
  /BuildingBlocks
  /Modules
    /Identity
    /Sessions
    /Presence
    /Contacts
    /Rooms
    /Messaging
    /Attachments
    /Notifications
    /Administration
    /XmppBridge
/tests
  /unit
  /integration
  /e2e
  /load
/docs
/.github
```

## 5. Internal backend module boundaries

- **Identity** — registration, login, password change/reset, delete account
- **Sessions** — browser/device sessions, selective session revoke, persistent login
- **Presence** — multi-tab online / AFK / offline
- **Contacts** — friend requests, friendships, user-to-user bans
- **Rooms** — public/private rooms, invitations, membership, moderation, room bans
- **Messaging** — conversations, messages, replies, edits, deletes, sync
- **Attachments** — upload, metadata, access control, secure download, cleanup
- **Notifications** — unread counters, last-read watermarks, chat summaries
- **Administration** — room management actions and audits
- **XmppBridge** — optional phase 2

## 6. Conversation model

Use a unified conversation abstraction.

### Recommended tables

- `conversations`
- `conversation_messages`
- `conversation_reads`
- `message_attachments`

Rooms and direct dialogs should each own or reference one `conversation_id`.

### Why this helps

- one message model for room and direct chat
- one watermark strategy
- one unread/read model
- one history pagination model
- easier SignalR routing and sync logic

### Conversations table fields

Recommended core fields:

- `id`
- `type` (`room` or `direct`)
- `current_watermark`
- `created_at`
- `updated_at`

### Messages table fields

Recommended core fields:

- `id`
- `conversation_id`
- `watermark`
- `author_id`
- `text`
- `reply_to_message_id`
- `created_at`
- `edited_at`
- `deleted_at` or hard-delete strategy metadata

## 7. Realtime delivery model

Use a **hybrid REST + SignalR** model.

### REST responsibilities

REST is the primary command and query surface for:

- auth and sessions
- room and contact screens
- room join/leave/invite/admin actions
- initial chat load
- history pagination
- gap recovery
- unread/read updates if modeled explicitly
- attachment upload/download
- account delete flow

### SignalR responsibilities

SignalR is used for:

- new message fan-out
- message edit/delete fan-out
- presence updates
- unread summary updates
- invitation and moderation notifications
- reconnect and chat-summary refresh hints

### Important write-path rule

Do not use SignalR as the only write path.

The preferred flow is:

1. browser sends command via REST
2. backend validates auth and domain rules
3. backend persists the change
4. backend publishes realtime updates via SignalR

## 8. No unbounded offline queues

Do **not** keep endless per-user message queues.

If a user disappears for months or years, the system must not accumulate an ever-growing memory or Redis queue for that user.

Instead:

- PostgreSQL is the durable source of truth
- clients reconnect and recover from stored history
- SignalR is for live delivery while connected
- gap repair and catch-up happen through REST endpoints

This design handles long absences safely.

## 9. Conversation watermarks and gap recovery

Every conversation has a monotonically increasing **watermark**.

### Rule

Each persisted message increments the conversation watermark and stores that value on the message row.

### Client behavior

The client tracks the **last contiguous watermark** it has successfully applied for each open conversation.

Example:

- server conversation watermark is `5`
- client last contiguous watermark is `3`
- client receives event for watermark `5`

That means watermark `4` may be missing. The client must not assume it has a full stream. It must call the sync endpoint.

### Recommended endpoints

```text
GET /api/conversations/{conversationId}/messages?beforeWatermark={n}&pageSize={k}
GET /api/conversations/{conversationId}/sync?afterWatermark={n}
POST /api/conversations/{conversationId}/read
```

### Sync response should include

- missing messages in watermark order
- latest authoritative watermark
- enough metadata to reconcile message state
- optional hint that a full visible-window reload is needed if the gap is large

## 10. Presence model and browser hibernation

Presence must tolerate tabs being suspended by the browser.

### Client-side activity tracking

Track user interaction using:

- `pointermove` or cursor movement, throttled
- `keydown`
- `click`
- `touchstart`
- `focus`
- `visibilitychange`

Do not send activity on every DOM event. Update a local `lastInteractionAt` value and send it in heartbeats.

### Heartbeat model

Recommended behavior:

- send heartbeat every 15–30 seconds while the tab is visible/alive
- send an immediate heartbeat on reconnect, focus, and visibility restore
- include `tabId`, `lastInteractionAt`, `visibilityState`, and `connection timestamp`

### Redis model

Store one ephemeral record per tab, for example:

- `presence:user:{userId}:tab:{tabId}`

Recommended TTL:

- 75 seconds

### Server-side status rules

- **Online** — at least one live tab has recent interaction
- **AFK** — at least one live tab exists, but all tabs have been idle for more than 1 minute
- **Offline** — all tab heartbeats have expired

This works even when the browser hibernates the tab, because the server infers state from missing heartbeats.

## 11. Session model

Support persistent login and per-session logout through explicit session persistence.

### Recommended approach

- `user_sessions` table
- one browser/profile = one session
- current-session logout revokes only that session
- Sessions UI reads from `user_sessions`
- selective revoke invalidates only the chosen session

Recommended fields:

- `id`
- `user_id`
- `refresh_token_hash` or session secret reference
- `ip_address`
- `user_agent`
- `created_at`
- `last_seen_at`
- `revoked_at`

## 12. Social graph and PM authorization

Use explicit tables for:

- `friend_requests`
- `friendships`
- `user_bans`

Rules:

- friend request may be sent by username or from room context
- direct messaging is allowed only if friendship is confirmed
- direct messaging is blocked if either user has banned the other
- existing direct history remains visible but becomes read-only after a user ban

## 13. Rooms and moderation

Core entities:

- `rooms`
- `room_members`
- `room_admins`
- `room_invitations`
- `room_bans`

Behavior:

- public rooms are searchable
- private rooms are invite-only
- owner is permanent admin
- removing a member acts as a room ban
- users who lose room access lose access to messages and attachments
- room deletion removes room history and attachments permanently

## 14. Attachments

### Storage

Store files on a mounted local volume.

Suggested directory layout:

```text
/uploads/conversations/{conversationId}/...
```

### Metadata

Store metadata in PostgreSQL:

- original filename
- content type
- byte size
- uploader id
- created at
- optional comment
- conversation id
- storage key or physical path reference

### Security rule

Never expose raw file paths directly to the browser. Serve downloads through authenticated endpoints that re-check access on every request.

## 15. Long-history design

This is a hard requirement now.

### Target

A room may contain **100,000+ messages** over years and still needs progressive upward scroll.

### Backend rules

- paginate by stable ordering, preferably `watermark desc`
- keep message windows small
- index message history properly
- avoid offset pagination for long histories

Recommended index:

- `(conversation_id, watermark desc)`

### Frontend rules

- use a virtualized message list
- preserve scroll anchor when prepending older messages
- do not auto-scroll while user reads older history
- show sync/reconnect state when repairing a gap
- render attachment previews lazily

## 16. Realtime fan-out pattern

For 100+ active users, do not use REST polling for live message flow, but also do not push all app state over WebSockets.

Recommended SignalR grouping:

- user group: `user:{userId}`
- conversation group: `conversation:{conversationId}`

Only fan out relevant events to relevant groups.

## 17. Compose target

Minimum services:

- `web`
- `api`
- `postgres`
- `redis`

Optional later:

- `e2e`
- `loadtest`
- `xmpp-a`
- `xmpp-b`

### Compose expectations

- health checks for critical services
- mounted volume for uploads
- named volume for postgres data
- stable network aliases
- migrations on startup or explicit migration command documented

## 18. Testing strategy

### Unit tests

- business rules
- validators
- policy checks

### Integration tests

- auth/session behavior
- friendship and PM authorization
- room membership and bans
- attachment access control
- watermark generation and sync endpoints

### E2E tests

- register/login
- create/join room
- invite to private room
- friend request and PM
- message edit/delete/reply
- unread behavior
- session revoke
- multi-tab presence
- gap recovery
- loss of room access and file access

### Load / durability tests

- 100+ concurrent connected users
- rooms with 100K historical messages
- reconnect after missed events
- long-absent user without unbounded queue growth

## 19. Phase plan

### Phase 0
Docs, ADRs, repo file map, prompts

### Phase 1
Monorepo scaffold and Docker foundation

### Phase 2
Auth, sessions, rooms, contacts, moderation

### Phase 3
Realtime foundation, presence, watermarks

### Phase 4
Messaging, history, unread, attachments

### Phase 5
Slack-like frontend polish, admin UI, QA hardening

### Phase 6
Optional XMPP/Jabber

## 20. XMPP / Jabber phase 2

Treat XMPP as an isolated extension module with its own compose profile and acceptance gate.

Do not let XMPP change the phase 1 storage, sync, or message delivery model.

## 21. ADR summary

- **ADR-001** — hybrid REST + SignalR
- **ADR-002** — conversation watermarks and gap recovery
- **ADR-003** — heartbeat-based presence with hibernation tolerance
- **ADR-004** — history pagination and virtualization
