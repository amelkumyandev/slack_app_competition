# Codex Agent Pack

## Recommended agent count

Use **6 specialist agents** for the core project and keep an **optional 7th agent** reserved for XMPP after the core app is green.

## Agent model

### Agent A — Architect / Contracts / Integrator

**Owns**
- `AGENTS.md`
- architecture docs and ADRs
- API contracts and event naming
- repo structure decisions
- acceptance criteria updates
- final integration decisions

**Should avoid**
- deep feature implementation unless unblocking another lane

### Agent B — .NET Backend Expert

**Owns**
- auth and account lifecycle
- sessions persistence
- contacts / friendship / bans
- rooms / invites / moderation
- access control policy layer
- service and module boundaries

**Should avoid**
- large frontend edits
- SignalR event fan-out internals unless coordinated

### Agent C — DB Architect / Realtime Backend Expert

**Owns**
- schema design for conversations
- migrations in coordination with Agent B
- conversation watermarks
- history queries and indexes
- SignalR hubs
- sync endpoints
- unread fan-out internals

**Should avoid**
- broad frontend work
- schema drift without documenting migrations

### Agent D — React / Next.js Expert

**Owns**
- Next.js shell and Slack-like UI polish
- auth pages
- chat shell
- room management modal
- sessions screen
- history virtualization
- reconnect and gap-repair UX

**Should avoid**
- inventing backend behavior that is not in contracts

### Agent E — DevOps Expert

**Owns**
- Dockerfiles
- Docker Compose
- health checks
- env contracts
- startup and reset scripts
- container naming and observability basics

**Should avoid**
- business logic changes unrelated to delivery or runtime

### Agent F — QA Expert

**Owns**
- e2e and smoke coverage
- gap recovery tests
- multi-tab presence tests
- browser hibernation tests
- 100K history tests
- moderate-scale realtime/load scenarios

**Should avoid**
- large architecture changes without Agent A approval

### Agent G — XMPP / Federation Expert (optional)

**Owns**
- Jabber/XMPP integration after core scope is stable
- second-server compose profile
- federation stats/admin screens
- load test scenario for A↔B traffic

**Must stay parked** until phase 1 is accepted.

## Coordination rules

### Rule 1 — One owner for migrations

Only the backend and DB lanes should author or approve DB migrations.

### Rule 2 — Contracts before implementation drift

If API shapes or event names are still moving, Agent A must lock them before Agents C and D spread assumptions across the codebase.

### Rule 3 — Small, mergeable slices

Do not create giant month-long branches. Keep branches reviewable and feature-scoped.

### Rule 4 — Worktree discipline

Use one worktree per active feature branch where possible. This reduces file collision and makes parallel Codex work safer.

### Rule 5 — Watermark discipline

No agent may add live message delivery without conversation watermark support or a documented temporary compatibility plan.

## Suggested core assignments

- Agent A: F00, review all, final merge gate
- Agent B: F03, F05, F06, F11
- Agent C: F07, F08, F09, F10
- Agent D: F04, F10, F12, F13, F14
- Agent E: F01, F02, support F15
- Agent F: F15 throughout as shadow reviewer
- Agent G: F16 only after core acceptance

## Handoff format between agents

When one lane finishes a feature, leave a short handoff note including:

- what changed
- commands run
- migrations added
- contracts introduced or modified
- known gaps
- exact files another lane should read next

## Conflict hotspots to avoid

- root Dockerfiles and `docker-compose.yml`
- shared API contract types
- EF Core migrations
- auth/session middleware
- frontend global layout and routing files
- conversation history and unread store code

## Golden rule

The fastest team is not the team with the most agents. It is the team with the clearest ownership, the best contracts, and the fewest conflicting edits.
