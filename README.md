# Slack App Competition

This repository starts the competition entry as a **single monorepo** with a **modular monolith ASP.NET Core backend** and a **Next.js frontend**. The current state includes the scaffold plus the initial Docker bootstrap for local full-stack startup.

## Current Status

- `feat/scaffold-monorepo` established the monorepo layout and starter apps.
- `feat/docker-compose-bootstrap` adds Dockerfiles, Compose services, healthchecks, and startup docs.
- `feat/auth-and-account-core` adds cookie-backed registration, login, password management, and current-session logout foundations.
- Business features are intentionally not implemented yet.

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

## Environment Contract

Copy `.env.example` to `.env` if you want to override the defaults. The Compose file is written with safe fallbacks, so the stack can still start without a local `.env` file.

The main variables cover:

- API and web host ports
- PostgreSQL credentials
- Redis port
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

## Notes

- The backend remains a single deployment unit with clear internal boundaries.
- SignalR, PostgreSQL, Redis, and filesystem storage are planned into the shape now, even though the business flows are not wired yet.
- XMPP stays out of phase 1 work until the core scope is stable.
