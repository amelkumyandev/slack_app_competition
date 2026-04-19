# Changes From V1

This refresh updates the starter pack with the extra implementation hints and design caveats.

## Major upgrades

- added a formal **hybrid REST + SignalR** architecture
- added **conversation watermarks** as a non-negotiable sync primitive
- added **gap recovery** rules for missed message events
- removed any implied **unbounded per-user delivery queue** design
- added **presence heartbeats** that tolerate browser tab hibernation
- added **100K-message history** support requirements and test coverage
- expanded the Codex lanes into **specialist agent roles**
- added missing ADRs
- added advanced QA and load-test planning docs
- added a repo file map so placement is unambiguous

## New files

- `docs/repo-file-map.md`
- `docs/architecture/realtime-sync.md`
- `docs/adr/ADR-001-hybrid-rest-plus-signalr.md`
- `docs/adr/ADR-002-chat-watermarks-and-gap-recovery.md`
- `docs/adr/ADR-003-presence-heartbeats-and-tab-hibernation.md`
- `docs/adr/ADR-004-history-pagination-and-virtualization.md`
- `docs/qa/acceptance-and-load-tests.md`
- `.github/pull_request_template.md`

## Most important design change

The app should now be implemented as a **durable conversation log plus catch-up sync system**, not as a live-only push system and not as an ever-growing per-user queue system.
