# Repo File Map

This document shows the **exact location** of each planning file inside the repository.

## Repo root

```text
slack_app_competition/
```

This root folder must contain:

- `AGENTS.md`
- `README.md`
- `README_FIRST.md`

## Docs folder

These files go under `docs/`:

```text
docs/
  repo-file-map.md
  changes-from-v1.md
  solution-blueprint.md
  frontend-ux-spec.md
  git-flow.md
  implementation-backlog.md
  qa-runbook.md
```

## Architecture docs

These files go under `docs/architecture/`:

```text
docs/architecture/
  realtime-sync.md
```

## ADRs

These files go under `docs/adr/`:

```text
docs/adr/
  ADR-001-hybrid-rest-plus-signalr.md
  ADR-002-chat-watermarks-and-gap-recovery.md
  ADR-003-presence-heartbeats-and-tab-hibernation.md
  ADR-004-history-pagination-and-virtualization.md
```

## QA docs

These files go under `docs/qa/`:

```text
docs/qa/
  acceptance-and-load-tests.md
```

## Codex docs

These files go under `docs/codex/`:

```text
docs/codex/
  agent-pack.md
  first-prompts.md
```

## GitHub files

These files go under `.github/`:

```text
.github/
  pull_request_template.md
```

## Practical check

If your repository tree looks roughly like this, you are in the right place:

```text
slack_app_competition/
  .git/
  AGENTS.md
  README.md
  README_FIRST.md
  docs/
  .github/
```
