# First Prompts for Codex

These prompts are designed so you can paste them directly into Codex app, CLI, or IDE workflows. Use one feature branch per prompt unless the prompt explicitly says otherwise.

## Prompt 0 — Read the operating model first

```text
Read README_FIRST.md, AGENTS.md, docs/repo-file-map.md, docs/solution-blueprint.md, docs/architecture/realtime-sync.md, docs/git-flow.md, and docs/implementation-backlog.md.

Do not write code yet. Summarize:
- repo structure
- core architecture
- branch plan
- non-negotiable rules
- specialist lane ownership
- realtime + watermark model
- long-history and presence constraints

Point out any contradictions before implementation begins.
```

## Prompt 1 — Bootstrap the monorepo

```text
Read AGENTS.md, docs/solution-blueprint.md, docs/git-flow.md, and docs/implementation-backlog.md.

Create the initial monorepo scaffold for this project:
- apps/web as a Next.js app
- apps/api as an ASP.NET Core .NET 10 app
- src/Modules and src/BuildingBlocks folders for the backend structure
- tests/unit, tests/integration, tests/e2e, tests/load folders
- .env.example and a root README skeleton

Do not implement business features yet. Focus on structure, naming, and a clean starting point that matches the architecture docs. Work on branch feat/scaffold-monorepo.
```

## Prompt 2 — Docker compose foundation

```text
Read AGENTS.md, docs/solution-blueprint.md, docs/qa-runbook.md, and docs/implementation-backlog.md.

Implement the initial Docker setup for this monorepo:
- Dockerfile for apps/api
- Dockerfile for apps/web
- root docker-compose.yml with api, web, postgres, redis and named volumes
- healthchecks for critical services
- startup documentation in README

The stack must start with docker compose up --build from the repo root. Keep the setup simple and reliable. Work on branch feat/docker-compose-bootstrap.
```

## Prompt 3 — Auth and account lifecycle

```text
Read AGENTS.md, docs/solution-blueprint.md, and docs/implementation-backlog.md.

Implement the auth and account core on branch feat/auth-and-account-core:
- registration with unique email and username
- login with persistent session support
- logout current session only
- password change
- password reset flow scaffolding
- delete account service skeleton

Use PostgreSQL for persistence. Keep domain rules server-side. Add tests for unique constraints and session behavior.
```

## Prompt 4 — Sessions screen and selective logout

```text
Read AGENTS.md, docs/solution-blueprint.md, docs/frontend-ux-spec.md, and docs/implementation-backlog.md.

Implement feature branch feat/session-management-screen:
- persist user sessions with device/browser/IP metadata where possible
- API to list active sessions
- API to revoke a selected session
- Sessions screen in the frontend

Keep the current session distinguishable and do not revoke all sessions when signing out of the current browser.
```

## Prompt 5 — Friends, bans, and PM authorization

```text
Read AGENTS.md, docs/solution-blueprint.md, and docs/implementation-backlog.md.

Implement feature branch feat/friends-and-user-ban:
- friend request send/accept/decline/remove
- user-to-user ban
- policy that allows direct messaging only between confirmed friends when no ban exists in either direction
- frozen read-only direct history after a ban

Add tests around PM authorization and ban behavior.
```

## Prompt 6 — Rooms, membership, and moderation

```text
Read AGENTS.md, docs/solution-blueprint.md, docs/frontend-ux-spec.md, and docs/implementation-backlog.md.

Implement feature branch feat/rooms-membership-and-moderation:
- create public/private rooms with unique names
- public room catalog search
- private room invitations
- room membership rules
- owner/admin permissions
- room bans and unbans

Removing a member must be treated as a room ban. Keep owner behavior compliant with the spec.
```

## Prompt 7 — SignalR foundation

```text
Read AGENTS.md, docs/solution-blueprint.md, docs/architecture/realtime-sync.md, and docs/implementation-backlog.md.

Implement feature branch feat/realtime-signalr-foundation:
- SignalR hub or hubs
- authenticated realtime connections
- user groups and conversation groups
- connection lifecycle logging
- client-safe event contracts

Do not make SignalR the only write path. Keep REST as the primary command path.
```

## Prompt 8 — Presence heartbeats and hibernation

```text
Read AGENTS.md, docs/solution-blueprint.md, docs/architecture/realtime-sync.md, and docs/implementation-backlog.md.

Implement feature branch feat/presence-heartbeats-and-hibernation:
- Redis-backed per-tab heartbeat model
- online / AFK / offline computation
- frontend activity tracking with throttled pointer/key/click/focus/visibility signals
- immediate heartbeat on reconnect and visibility restore

Do not rely on explicit inactive signals. The server must infer state from heartbeat freshness and last interaction timestamps.
```

## Prompt 9 — Conversation watermarks and gap recovery

```text
Read AGENTS.md, docs/solution-blueprint.md, docs/architecture/realtime-sync.md, docs/adr/ADR-002-chat-watermarks-and-gap-recovery.md, and docs/implementation-backlog.md.

Implement feature branch feat/conversation-watermarks-and-gap-recovery:
- conversation watermark persistence
- message/event payloads carrying watermark
- sync endpoint for missing messages
- client-side gap detection
- integration tests for forced missed-event recovery

Do not implement an unbounded per-user undelivered message queue.
```

## Prompt 10 — Messaging core and long history

```text
Read AGENTS.md, docs/solution-blueprint.md, docs/frontend-ux-spec.md, docs/adr/ADR-004-history-pagination-and-virtualization.md, and docs/implementation-backlog.md.

Implement feature branch feat/messaging-core-and-history:
- room messages
- direct messages
- multiline text
- replies
- edit own message with edited indicator
- delete own message
- admin delete in room chats
- history pagination using stable ordering
- frontend virtualized message list

Make sure ordering is stable, watermark-aware, and suitable for 100K-message rooms.
```

## Prompt 11 — Attachments and secure downloads

```text
Read AGENTS.md, docs/solution-blueprint.md, docs/qa-runbook.md, and docs/implementation-backlog.md.

Implement feature branch feat/attachments-and-secure-downloads:
- upload image and generic files
- preserve original filename
- optional attachment comment
- secure metadata persistence
- authenticated download endpoint with re-checked access
- room deletion cleanup and loss-of-access enforcement

Do not expose raw file paths directly to the browser.
```

## Prompt 12 — Unread and chat navigation

```text
Read AGENTS.md, docs/solution-blueprint.md, docs/frontend-ux-spec.md, and docs/implementation-backlog.md.

Implement feature branch feat/unread-and-chat-navigation:
- unread counters
- conversation read watermarks
- room/contact notification pills
- chat summary refresh behavior
- clear unread on open/read rules

Keep the model compatible with watermarks and reconnect repair.
```

## Prompt 13 — Slack-like shell and core screens

```text
Read AGENTS.md, docs/frontend-ux-spec.md, and docs/implementation-backlog.md.

Implement feature branch feat/slack-like-shell-and-core-screens:
- polished main chat shell
- top navigation
- right-side rooms/contacts sidebar
- room members/context column
- message composer and message list polish
- reconnect and sync states

Follow the Slack-like visual language but keep the required competition layout.
```

## Prompt 14 — Admin modals and room management UI

```text
Read AGENTS.md, docs/frontend-ux-spec.md, and docs/implementation-backlog.md.

Implement feature branch feat/admin-modals-and-room-management-ui:
- manage room modal with members, admins, banned users, invitations, and settings tabs
- member search
- destructive action confirmations
- keyboard-accessible modal behavior

Match the admin flows to the backend rules already documented.
```

## Prompt 15 — QA hardening and load tests

```text
Read AGENTS.md, docs/qa-runbook.md, docs/qa/acceptance-and-load-tests.md, and docs/implementation-backlog.md.

Implement feature branch feat/qa-hardening-and-load-tests:
- automated smoke coverage for critical flows
- integration tests for access control and sync
- 100K-history validation scenario
- 100+ user realtime/load scenario
- final README run instructions
- seed/demo strategy if helpful

The final repo should be runnable and testable from Docker commands only.
```

## Prompt 16 — Optional XMPP phase 2

```text
Only start if the core application is already stable.

Read AGENTS.md, docs/solution-blueprint.md, and docs/implementation-backlog.md.

Implement feature branch feat/xmpp-phase-2:
- choose a .NET-compatible XMPP/Jabber integration path
- isolate it behind a dedicated module and compose profile
- add admin dashboard screens for connection health and federation traffic
- create a two-server demo and load test scenario

Do not destabilize the core stack when XMPP is disabled.
```
