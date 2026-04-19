# Slack App Competition

A competition-ready classic web chat application built as a **single monorepo** with a **modular monolith ASP.NET Core backend** and a **Slack-inspired Next.js frontend**.

## Planned stack

- **Backend:** ASP.NET Core / .NET 10
- **Frontend:** Next.js / React
- **Realtime:** SignalR
- **Database:** PostgreSQL
- **Ephemeral state / cache:** Redis
- **Files:** local filesystem volume
- **Runtime:** Docker Compose from repo root

## What this architecture optimizes for

- fast end-to-end delivery
- correct access-control rules
- multi-tab presence
- durable history
- Slack-like UX without breaking the competition layout
- Docker-only startup for QA
- Codex-friendly parallel feature work

## Core design decisions

- one **public monorepo**
- one **backend deployment unit**
- strong internal module boundaries
- **hybrid REST + SignalR** model
- **conversation watermarks** for message integrity and gap recovery
- **heartbeat-based presence** that survives tab hibernation rules
- **virtualized long-history chat UI** for rooms with 100K+ messages
- XMPP/Jabber kept behind an optional phase 2 boundary

## Start here

Read these in order:

1. `README_FIRST.md`
2. `AGENTS.md`
3. `docs/solution-blueprint.md`
4. `docs/implementation-backlog.md`
5. `docs/codex/first-prompts.md`

## Repo file map

See `docs/repo-file-map.md`.

## First feature branches

Recommended initial merge order:

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
11. `feat/attachments-and-secure-downloads`
12. `feat/unread-and-chat-navigation`
13. `feat/slack-like-shell-and-core-screens`
14. `feat/admin-modals-and-room-management-ui`
15. `feat/qa-hardening-and-load-tests`
16. `feat/xmpp-phase-2` only if core scope is green

## Intended runtime topology

```text
Browser
  -> Next.js web
  -> ASP.NET Core API + SignalR
      -> PostgreSQL
      -> Redis
      -> uploads volume
```

## Quick start target

When the project is implemented, the official startup contract is:

```bash
docker compose up --build
```

## Documents

- `AGENTS.md` — root operating instructions
- `docs/solution-blueprint.md` — architecture and core technical decisions
- `docs/frontend-ux-spec.md` — Slack-like frontend guidance
- `docs/git-flow.md` — feature-branch workflow
- `docs/implementation-backlog.md` — feature slices and acceptance criteria
- `docs/qa-runbook.md` — Docker-only QA expectations
- `docs/architecture/realtime-sync.md` — REST + SignalR + watermark model
- `docs/adr/*` — architecture decision records
- `docs/qa/acceptance-and-load-tests.md` — advanced validation scenarios
- `docs/codex/agent-pack.md` — tuned Codex lane assignments
- `docs/codex/first-prompts.md` — ready-to-paste prompts for Codex

## Phase 2 note

XMPP/Jabber federation is optional and must not destabilize the core stack when disabled.
