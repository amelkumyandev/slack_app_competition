# Slack App Competition

This repository starts the competition entry as a **single monorepo** with a **modular monolith ASP.NET Core backend** and a **Next.js frontend**. The current branch provides the initial scaffold only: structure, naming, starter apps, and repo-level conventions.

## Current Status

- `feat/scaffold-monorepo` establishes the monorepo layout and app shells.
- Business features are intentionally not implemented yet.
- `docker compose up --build` will be added in `feat/docker-compose-bootstrap`.

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

## Starter Commands

The scaffold keeps the root entry points simple:

```bash
dotnet build
dotnet run --project apps/api
npm install
npm run dev:web
```

`docker compose up --build` is a documented target but is not part of this branch yet.

## Environment Contract

Copy `.env.example` to `.env` when you begin wiring local services. The variables are named to match the planned web, API, PostgreSQL, Redis, and uploads contracts.

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

## Notes

- The backend remains a single deployment unit with clear internal boundaries.
- SignalR, PostgreSQL, Redis, and filesystem storage are planned into the shape now, even though they are not wired yet.
- XMPP stays out of phase 1 work until the core scope is stable.
