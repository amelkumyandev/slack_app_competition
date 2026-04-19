# README_FIRST.md

This is the **start here** file for the repository.

## Exact project location

Your project location is the local git clone root:

```text
slack_app_competition/
```

That folder is the one that contains:

- `.git/`
- `README.md`
- `AGENTS.md`

Everything in this pack should be copied into that root.

## Exact file placement

Use this layout:

```text
slack_app_competition/
  AGENTS.md
  README.md
  README_FIRST.md
  docs/
    repo-file-map.md
    changes-from-v1.md
    solution-blueprint.md
    frontend-ux-spec.md
    git-flow.md
    implementation-backlog.md
    qa-runbook.md
    architecture/
      realtime-sync.md
    adr/
      ADR-001-hybrid-rest-plus-signalr.md
      ADR-002-chat-watermarks-and-gap-recovery.md
      ADR-003-presence-heartbeats-and-tab-hibernation.md
      ADR-004-history-pagination-and-virtualization.md
    qa/
      acceptance-and-load-tests.md
    codex/
      agent-pack.md
      first-prompts.md
  .github/
    pull_request_template.md
```

## First commit recommendation

After copying the files into the repo, make one clean planning commit:

```bash
git add .
git commit -m "docs: refresh Codex starter pack, ADRs, and implementation plan"
git push origin main
```

## Start order after the docs commit

1. Open `AGENTS.md`
2. Open `docs/solution-blueprint.md`
3. Open `docs/implementation-backlog.md`
4. Open `docs/codex/agent-pack.md`
5. Start with Prompt 1 from `docs/codex/first-prompts.md`

## Branches to start first

Recommended first three branches:

1. `feat/scaffold-monorepo`
2. `feat/docker-compose-bootstrap`
3. `feat/auth-and-account-core`

Do not start XMPP until the core flow is stable.
