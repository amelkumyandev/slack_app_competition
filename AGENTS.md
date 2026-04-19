# AGENTS.md

## Mission

Build a competition-ready classic web chat application in a **single monorepo** with these primary technologies:

- Backend: **ASP.NET Core / .NET 10**
- Frontend: **Next.js / React**
- Realtime: **SignalR**
- Main DB: **PostgreSQL**
- Cache / ephemeral state: **Redis**
- File storage: **local filesystem volume**
- Runtime: **Docker Compose from repository root**

The product should feel visually close to a modern Slack-style chat app, while still obeying the competition requirements around layout, moderation, presence, attachments, persistence, and access control.

## Project location

The **project root** is the local clone folder named:

```text
slack_app_competition/
```

That root folder is the one that contains `.git`, `README.md`, and this `AGENTS.md`.

Place files in these exact locations:

- `slack_app_competition/AGENTS.md`
- `slack_app_competition/README.md`
- `slack_app_competition/README_FIRST.md`
- `slack_app_competition/docs/...`
- `slack_app_competition/.github/pull_request_template.md`

If a file is not under `docs/` or `.github/`, it belongs in the repo root.

## Non-negotiable constraints

1. The full stack must be runnable with **`docker compose up --build`** from the repository root.
2. Do **not** split the backend into independently deployed microservices in phase 1.
3. Use **SignalR** for realtime presence and chat updates.
4. Use **PostgreSQL** as the persistent source of truth.
5. Use **Redis** for presence heartbeats, low-latency ephemeral state, and optional later scaling support.
6. Store uploaded files on the **local filesystem** inside a mounted volume.
7. Keep the backend architecture as a **modular monolith** with strong internal boundaries.
8. Do not start XMPP federation work until the required scope is functionally complete and stable.

## Architecture guardrails

- Prefer a **single backend process** with well-separated modules over many services.
- Keep domain rules on the server, not duplicated across frontend and hub code.
- Treat **REST/HTTP APIs** as the main command/query surface.
- Use **SignalR for realtime fan-out and presence updates**, not as the sole persistence path.
- Enforce room membership, bans, friend rules, PM rules, session scoping, and file access in one backend policy layer.
- Keep Docker images production-like, but small and predictable.

## Realtime and sync guardrails

- Do **not** implement unbounded per-user undelivered message queues.
- Persist messages to PostgreSQL and let clients catch up from durable history.
- Every conversation must have a monotonically increasing **watermark**.
- SignalR events must include the conversation watermark.
- Clients must detect watermark gaps and call a REST sync endpoint.
- Use **REST + SignalR together**:
  - REST for initial fetch, history pagination, sync repair, metadata, uploads, admin flows
  - SignalR for live events, unread changes, and presence
- Presence must be inferred from **heartbeat freshness and last activity**, not from explicit “inactive” signals.

## Frontend guardrails

- Visual language can be Slack-inspired.
- Do not copy Slack blindly.
- Respect the competition’s required page structure and behaviors.
- Optimize for readability, fast navigation, clear unread states, and strong realtime feedback.
- Build the UI so **100K-message histories** remain usable through virtualization and progressive loading.
- Include reconnect, syncing, empty, loading, and error states.

## Git and delivery guardrails

- `main` is the integration trunk.
- Work in **feature branches only**.
- Each branch should represent one coherent feature slice.
- Open one pull request per feature.
- Prefer **squash merge** into `main` after acceptance criteria pass.
- Never mix unrelated refactors into a feature branch.
- If a branch needs a DB migration, document it clearly in the PR.

See `docs/git-flow.md` for naming rules and branch conventions.

## Suggested monorepo structure

```text
/apps
  /web               # Next.js frontend
  /api               # ASP.NET Core host
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
    /XmppBridge      # optional phase 2
/tests
  /unit
  /integration
  /e2e
  /load
/docs
  /adr
  /architecture
  /codex
  /qa
/.github
/docker-compose.yml
/.env.example
/README.md
/README_FIRST.md
```

## Specialist agent lanes

### Agent A — Architect / Contracts / Integrator

Owns:

- `AGENTS.md`
- ADRs
- repo structure decisions
- API shape and event naming
- acceptance criteria
- merge sequencing
- final integration decisions

Must keep these stable for all other lanes.

### Agent B — .NET Backend Expert

Owns:

- auth and account lifecycle
- sessions persistence
- contacts / friendship / bans
- rooms / invites / moderation
- application services
- policy enforcement
- migrations in coordination with Agent C

### Agent C — DB Architect / Realtime Backend Expert

Owns:

- conversation schema
- conversation watermarks
- message history queries
- SignalR hubs
- gap recovery endpoints
- Redis presence model
- unread fan-out internals

### Agent D — React / Next.js Expert

Owns:

- auth screens
- Slack-like shell
- message list UX
- history virtualization
- reconnect and gap-repair UX
- admin modals
- sessions screen

### Agent E — DevOps Expert

Owns:

- Dockerfiles
- `docker-compose.yml`
- health checks
- volumes and startup scripts
- environment contracts
- local run and reset docs

### Agent F — QA Expert

Owns:

- smoke suite design
- gap recovery tests
- multi-tab and hibernation tests
- 100K history test scenario
- load test scenarios
- README validation for Docker-only QA

### Agent G — XMPP / Federation Expert (optional)

Owns:

- Jabber/XMPP integration
- second server profile
- federation dashboard
- traffic stats
- A↔B load tests

This lane stays parked until core scope is stable.

## Domain rules you must not break

- Public rooms are searchable and freely joinable unless room-banned.
- Private rooms are invite-only.
- Room owner cannot leave their own room; they delete it instead.
- Removing a user from a room is treated as a room ban.
- Personal messaging is allowed only when the users are friends and neither side has banned the other.
- Existing personal history remains visible but frozen after a user-to-user ban.
- Logging out the current browser must not kill other active sessions.
- Presence must aggregate across multiple tabs.
- If a user loses access to a room, they must also lose access to that room’s files and history through the UI and secured endpoints.
- If a room is deleted, its messages and attachments are deleted permanently.

## Quality gates for every feature

Before a feature PR is considered ready:

1. The solution builds.
2. Relevant tests pass.
3. `docker compose up --build` still works from the root.
4. The feature is represented in docs if contracts or flows changed.
5. Backend changes include access-control checks and error handling.
6. Frontend changes include empty, loading, error, reconnect, and realtime-update states.
7. PR notes explain what requirement(s) the feature covers.
8. Watermark integrity, presence behavior, and history loading are not regressed.

## Canonical commands to stabilize around

As the repo is implemented, keep these commands available and stable where possible:

```bash
docker compose up --build
dotnet build
dotnet test
npm run lint
npm run test
npm run build
```

## First implementation order

1. Read `README_FIRST.md`
2. Read `docs/repo-file-map.md`
3. Read `docs/solution-blueprint.md`
4. Read `docs/architecture/realtime-sync.md`
5. Read `docs/implementation-backlog.md`
6. Read `docs/codex/agent-pack.md`
7. Start with `docs/codex/first-prompts.md`
