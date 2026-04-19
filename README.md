# Slack App Competition

This repository starts the competition entry as a **single monorepo** with a **modular monolith ASP.NET Core backend** and a **Next.js frontend**. The current state includes the scaffold plus the initial Docker bootstrap for local full-stack startup.

## Current Status

- `feat/scaffold-monorepo` established the monorepo layout and starter apps.
- `feat/docker-compose-bootstrap` adds Dockerfiles, Compose services, healthchecks, and startup docs.
- `feat/auth-and-account-core` adds cookie-backed registration, login, password management, and current-session logout foundations.
- `feat/session-management-screen` adds the persisted sessions API, selective revoke flow, and the first interactive web workspace at `/sessions`.
- `feat/friends-and-user-ban` adds the contacts/social-graph API for friend requests, friendship removal, user bans, and direct-message authorization checks.
- `feat/rooms-membership-and-moderation` adds backend room creation, public catalog search, public joins, private invitations, admin assignment, and remove-member-as-ban moderation flows.
- `feat/realtime-signalr-foundation` adds the authenticated SignalR hub, user and conversation groups, and realtime event routing for room/contact hints.
- `feat/presence-heartbeats-and-hibernation` adds per-tab presence heartbeats, aggregate online/AFK/offline inference, Redis-backed Docker storage with in-memory test fallback, and a live `/presence` workspace.
- `feat/conversation-watermarks-and-gap-recovery` adds durable room-backed conversations, monotonic watermarks, conversation history paging, and REST sync repair for missed realtime events.
- `feat/messaging-core-and-history` adds durable room and direct messages, multiline text, replies, edit/delete flows, room-admin delete permissions, direct-message read-only freeze after bans, and a live `/chat` workspace with windowed history rendering.
- `feat/attachments-and-secure-downloads` adds filesystem-backed uploads, secure attachment downloads, room-delete cleanup, and chat composer support for file sharing with optional comments.
- `feat/unread-and-chat-navigation` adds per-user conversation read watermarks, unread counters for rooms and directs, and live chat navigation pills that clear as conversations are opened.
- `feat/slack-like-shell-and-core-screens` adds a shared app shell, a dedicated `/auth` route, and cohesive route framing across auth, chat, sessions, and presence.
- `feat/admin-modals-and-room-management-ui` adds a keyboard-friendly room management modal in `/chat` with member search, admin controls, ban review, invitation actions, and destructive room confirmations.

## Planned Stack

- **Backend:** ASP.NET Core / .NET 10
- **Frontend:** Next.js / React
- **Realtime:** SignalR
- **Database:** PostgreSQL
- **Cache / ephemeral state:** Redis
- **Files:** local filesystem volume
- **Runtime target:** Docker Compose from repo root

## Repo Layout

```text
slack_app_competition/
  .github/
    pull_request_template.md
  apps/
    api/                  # ASP.NET Core host
    web/                  # Next.js app
  docs/
  src/
    BuildingBlocks/      # shared backend cross-cutting pieces
    Modules/             # future bounded modules
  tests/
    unit/
    integration/
    e2e/
    load/
  .env.example
  AGENTS.md
  README.md
  README_FIRST.md
  SlackAppCompetition.slnx
  package.json
```

## Backend Module Boundaries

The module folders already exist so feature branches can land cleanly:

- `Identity`
- `Sessions`
- `Presence`
- `Contacts`
- `Rooms`
- `Messaging`
- `Attachments`
- `Notifications`
- `Administration`
- `XmppBridge` (parked until phase 2)

## Startup Commands

These are the commands this branch aims to keep stable:

```bash
docker compose up --build
dotnet build
dotnet test
dotnet run --project apps/api
npm install
npm run build
npm run lint
npm run test
npm run dev:web
```

For local API-only work, `npm install` is only needed when you want to run the web app or frontend checks.

## Docker Startup

The baseline local stack runs from the repo root:

```bash
docker compose up --build
```

Expected URLs:

- Web UI: `http://localhost:3000`
- API: `http://localhost:8080`
- API health: `http://localhost:8080/healthz`

The Compose stack includes:

- `web` for the Next.js app
- `api` for the ASP.NET Core host
- `postgres` for durable data
- `redis` for presence and ephemeral coordination
- `uploads_data` as the mounted local attachment volume

## Current Auth API

The backend now exposes the initial auth/account endpoints:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `POST /api/auth/change-password`
- `POST /api/auth/password-reset/request`
- `POST /api/auth/password-reset/confirm`
- `POST /api/auth/delete-account`

Auth is currently implemented with a database-backed cookie session model so later session-management work can build on the same persistence instead of replacing it.

The web app now also includes a dedicated `/auth` route so signed-out users can enter through a focused account screen instead of borrowing the sessions page.

## Current Sessions API

The session-management slice now exposes:

- `GET /api/sessions`
- `DELETE /api/sessions/{sessionId}`

The web app includes a focused `/sessions` route that can:

- show the current browser session distinctly
- list other persisted sessions
- revoke another session without logging out the current browser
- route signed-out users to `/auth` for the actual sign-in and create-account flow

## Current Contacts API

The contacts slice now exposes:

- `GET /api/contacts`
- `POST /api/contacts/friend-requests`
- `POST /api/contacts/friend-requests/{requestId}/accept`
- `POST /api/contacts/friend-requests/{requestId}/decline`
- `POST /api/contacts/friends/remove`
- `POST /api/contacts/bans`
- `POST /api/contacts/bans/remove`
- `GET /api/contacts/pm-policy/{targetUserName}`

This branch is backend-first. It establishes:

- friend requests sent by username
- accept and decline flows
- friendship removal
- user-to-user bans
- direct-message policy checks that allow PMs only for confirmed friends and freeze them after a ban

## Current Rooms API

The rooms slice now exposes:

- `GET /api/rooms`
- `GET /api/rooms/{roomId}`
- `POST /api/rooms`
- `POST /api/rooms/{roomId}/join`
- `POST /api/rooms/{roomId}/leave`
- `POST /api/rooms/{roomId}/invitations`
- `POST /api/rooms/invitations/{invitationId}/accept`
- `POST /api/rooms/invitations/{invitationId}/decline`
- `POST /api/rooms/{roomId}/admins`
- `POST /api/rooms/{roomId}/admins/remove`
- `POST /api/rooms/{roomId}/members/remove`
- `POST /api/rooms/{roomId}/bans/remove`

This branch is backend-first. It establishes:

- unique room names
- searchable public room catalog
- public-room join behavior
- private-room invitation and acceptance flow
- owner-only admin management
- remove-member behavior that also applies a room ban
- rejoin prevention until explicit unban

## Current Realtime Contract

The realtime foundation now exposes:

- `GET /api/realtime/contract`
- `SignalR hub: /hubs/realtime`

Current hub methods:

- `SubscribeConversation`
- `UnsubscribeConversation`
- `Heartbeat`
- `Ping`

Current client events:

- `connection.ready`
- `subscription.updated`
- `event.received`

Current foundation guarantees:

- authenticated connections automatically join `user:{userId}`
- room members can subscribe to `conversation:{conversationId}`
- room/contact actions publish targeted realtime hints without polling
- conversation events now carry `conversationId` and `watermark`
- reconnect strategy remains REST-based for gap repair rather than per-user queues

## Current Messaging API

The messaging slice now exposes:

- `GET /api/conversations/{conversationId}/messages?beforeWatermark={n}&pageSize={k}`
- `GET /api/conversations/{conversationId}/sync?afterWatermark={n}`
- `POST /api/conversations/{conversationId}/messages`
- `POST /api/conversations/{conversationId}/attachments`
- `POST /api/conversations/{conversationId}/read-state`
- `POST /api/conversations/{conversationId}/messages/{messageId}/edit`
- `DELETE /api/conversations/{conversationId}/messages/{messageId}`
- `GET /api/conversations/direct`
- `POST /api/conversations/direct`
- `GET /api/attachments/{attachmentId}/download`

Current conversation guarantees:

- each room or direct dialog owns a durable `conversationId`
- room and direct messages are persisted into `conversation_messages` with monotonic per-conversation watermarks
- each user can advance an independent read watermark per conversation without affecting other members
- history pages return materialized chat messages in chronological order, including reply previews and edited/deleted state
- direct conversations respect friendship and ban policy, including read-only history after a ban
- missed realtime windows can be repaired through REST without any unbounded per-user queue
- history paging is stable by message creation watermark, unread counts are derived from durable read state plus authored message watermarks, and the `/chat` workspace keeps the DOM bounded with windowed rendering for long histories

The web app now includes a focused `/chat` route that can:

- open room or direct conversations
- start direct messages from confirmed friends
- show unread pills for rooms and direct conversations
- page older history progressively
- clear unread counts by advancing the conversation read watermark when a chat is opened
- send multiline messages with reply targets
- upload files with optional message text
- download attachments from message history
- edit or delete messages when policy allows
- reconnect SignalR, detect watermark gaps, and trigger REST sync repair
- open a room-management modal with member filtering, admin actions, ban review, invitation sending, room leave, and room delete flows

Current attachment guarantees:

- uploads are stored on the mounted local filesystem volume rather than in the database
- attachment metadata is materialized directly into conversation history and sync responses
- downloads re-check room or direct-message access on every request
- removing a user from a room immediately blocks future attachment downloads for that room
- deleting a room removes its attachment files permanently along with the conversation

## Current Presence Contract

The presence slice now exposes:

- `GET /api/presence/me`
- `POST /api/presence/heartbeat`
- `SignalR hub method: Heartbeat`

Current presence guarantees:

- each browser tab keeps a stable `tabId` in session storage
- heartbeats include `tabId`, `lastInteractionAtUtc`, `visibilityState`, and `connectedAtUtc`
- the server aggregates live tabs into `online`, `afk`, or `offline`
- AFK and offline are inferred from freshness and expiry rather than explicit inactive signals
- Docker uses Redis for presence storage, while tests and local non-Docker runs default to the in-memory store

The web app now includes a focused `/presence` route that:

- opens the authenticated SignalR channel
- sends an immediate heartbeat on startup, focus, reconnect, and visibility restore
- keeps a scheduled heartbeat loop alive while the tab is active
- shows the current aggregate, live tab inventory, reconnect state, and recent presence transitions

## Environment Contract

Copy `.env.example` to `.env` if you want to override the defaults. The Compose file is written with safe fallbacks, so the stack can still start without a local `.env` file.

The main variables cover:

- API and web host ports
- PostgreSQL credentials
- Redis port
- presence store and heartbeat timings
- uploads storage location
- browser-visible API and SignalR URLs

## Local Reset

To stop the stack:

```bash
docker compose down
```

To stop it and clear persisted local data:

```bash
docker compose down --volumes
```

## Troubleshooting

- If `web` fails during build, confirm `npm install` completed successfully once in the repo root and that your lockfile is up to date.
- If `api` cannot connect later during feature work, check the Compose-provided `ConnectionStrings__Postgres` and `ConnectionStrings__Redis` environment values.
- If ports `3000`, `8080`, `5432`, or `6379` are already in use, override them in `.env`.
- If you need container logs, use `docker compose logs -f web api postgres redis`.

## Reading Order

Read these files before starting feature work:

1. `README_FIRST.md`
2. `AGENTS.md`
3. `docs/repo-file-map.md`
4. `docs/solution-blueprint.md`
5. `docs/architecture/realtime-sync.md`
6. `docs/git-flow.md`
7. `docs/implementation-backlog.md`

## Next Branches

Recommended early merge order:

1. `feat/scaffold-monorepo`
2. `feat/docker-compose-bootstrap`
3. `feat/auth-and-account-core`
4. `feat/session-management-screen`
5. `feat/friends-and-user-ban`
6. `feat/rooms-membership-and-moderation`
7. `feat/realtime-signalr-foundation`
8. `feat/presence-heartbeats-and-hibernation`
9. `feat/conversation-watermarks-and-gap-recovery`
10. `feat/messaging-core-and-history`

## Notes

- The backend remains a single deployment unit with clear internal boundaries.
- SignalR, PostgreSQL, Redis, and filesystem storage are now part of the active implementation path, with watermarks, durable messaging, and attachments still coming in later branches.
- XMPP stays out of phase 1 work until the core scope is stable.
