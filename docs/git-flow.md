# Feature-Based Git Flow

## 1. Trunk strategy

Use **`main` as the only long-lived integration branch**.

Do **not** create a permanent `develop` branch. For this project, a simple trunk plus short-lived feature branches is faster, easier for Codex, and reduces merge drift.

## 2. Branch naming

Use names like:

- `feat/docs-and-adr-refresh`
- `feat/scaffold-monorepo`
- `feat/docker-compose-bootstrap`
- `feat/auth-and-account-core`
- `feat/session-management-screen`
- `feat/friends-and-user-ban`
- `feat/rooms-membership-and-moderation`
- `feat/realtime-signalr-foundation`
- `feat/presence-heartbeats-and-hibernation`
- `feat/conversation-watermarks-and-gap-recovery`
- `feat/messaging-core-and-history`
- `feat/attachments-and-secure-downloads`
- `feat/unread-and-chat-navigation`
- `feat/slack-like-shell-and-core-screens`
- `feat/admin-modals-and-room-management-ui`
- `feat/qa-hardening-and-load-tests`
- `feat/xmpp-phase-2`

Bugfix branches later can use:

- `fix/<area>-<slug>`

Documentation-only branches:

- `docs/<topic>`

## 3. Merge policy

- one branch = one coherent feature
- open a PR into `main`
- prefer **squash merge** for a clean history
- delete the feature branch after merge

## 4. Commit style

Use conventional-style messages where practical:

- `feat(auth): add registration and login endpoints`
- `feat(rooms): implement room invitations and ban list`
- `feat(sync): add conversation watermark gap recovery`
- `fix(presence): aggregate tab heartbeats correctly`
- `docs(qa): add 100k history validation scenarios`

## 5. Codex-friendly workflow

When using multiple Codex agents in parallel:

- give each agent its own branch
- use separate worktrees when available
- keep ownership boundaries clear
- avoid two agents editing the same migration or API contract at once

## 6. Merge ordering

Recommended sequence:

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
16. `feat/xmpp-phase-2` only if there is time

## 7. Pull request expectations

Each PR should include:

- summary of scope
- requirements covered
- migrations added or changed
- docker commands run
- tests run
- screenshots or short video for UI changes
- risks / follow-ups
- whether watermark, presence, or history behavior was affected

See `.github/pull_request_template.md`.

## 8. Rules that keep `main` healthy

- never merge broken Docker startup
- never merge failing tests on critical paths
- do not postpone access-control checks to a later branch if the feature exposes data
- rebase or merge `main` into your feature branch before final review if drift is meaningful
- do not merge watermark or history changes without at least one integration test
- do not merge presence changes without a multi-tab test plan

## 9. XMPP rule

Do not open `feat/xmpp-phase-2` until the required scope is already passing smoke tests.
