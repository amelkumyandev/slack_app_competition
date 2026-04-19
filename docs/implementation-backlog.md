# Implementation Backlog

This backlog is organized as **feature branches**, not by technical layer only. Each branch should land in `main` only after its acceptance criteria are met.

## Phase order

0. Docs and architecture guardrails
1. Scaffold and infrastructure
2. Auth and account lifecycle
3. Rooms, contacts, and moderation model
4. Realtime foundation and presence
5. Watermarks, messaging, and long history
6. Attachments and secure file access
7. Frontend polish and admin flows
8. QA hardening, load tests, and docs
9. Optional XMPP / federation

## Parallelization rule

At most **4 active core feature branches** at once. Keep the optional fifth lane parked for XMPP only after the core app is stable.

---

## F00 — `feat/docs-and-adr-refresh`

**Owner lane:** Architect

**Scope**
- refresh root docs
- add ADRs
- add realtime sync doc
- add repo file map
- align prompts and backlog with watermarks and hibernation behavior

**Acceptance**
- all docs point to the same branch plan and architecture
- project file locations are unambiguous
- Codex prompts are safe to start from immediately

---

## F01 — `feat/scaffold-monorepo`

**Owner lane:** Architect + DevOps

**Scope**
- create repo structure
- add backend and frontend app shells
- add root README skeleton
- add `.env.example`
- add base docs folders already referenced in docs

**Acceptance**
- repo layout matches blueprint
- placeholder apps build or boot minimally
- docs exist in expected locations

---

## F02 — `feat/docker-compose-bootstrap`

**Owner lane:** DevOps

**Scope**
- create Dockerfiles for `api` and `web`
- create root `docker-compose.yml`
- add `postgres` and `redis`
- add named volumes and healthchecks
- document startup, reset, and troubleshooting commands

**Acceptance**
- `docker compose up --build` starts the baseline stack
- healthchecks pass
- QA can reach the web app through a documented URL

---

## F03 — `feat/auth-and-account-core`

**Owner lane:** .NET Backend

**Scope**
- registration
- login
- persistent login
- logout current session
- change password
- password reset flow scaffolding
- delete account service shell

**Acceptance**
- unique email and username enforced
- passwords stored securely
- login persists across browser restart
- current-session logout does not kill other sessions

---

## F04 — `feat/session-management-screen`

**Owner lane:** .NET Backend + Frontend

**Scope**
- `user_sessions` persistence
- sessions list API
- revoke selected session
- sessions screen in UI

**Acceptance**
- session list shows current and other sessions
- revoking another session invalidates only that session
- current session is clearly labeled

---

## F05 — `feat/friends-and-user-ban`

**Owner lane:** .NET Backend

**Scope**
- friend requests
- accept/decline
- remove friend
- user-to-user ban
- PM authorization policy

**Acceptance**
- users can send friend requests by username and room list context later
- PM is blocked unless friendship is confirmed
- PM freezes after a user ban

---

## F06 — `feat/rooms-membership-and-moderation`

**Owner lane:** .NET Backend

**Scope**
- create public/private rooms
- unique room names
- join public room
- invite to private room
- leave room rules
- admin/owner permissions
- room ban list model

**Acceptance**
- owner cannot leave own room
- remove member acts as ban
- banned users cannot rejoin until unbanned
- public catalog search works

---

## F07 — `feat/realtime-signalr-foundation`

**Owner lane:** Realtime Backend

**Scope**
- SignalR hub or hubs
- authenticated realtime connections
- user groups and conversation groups
- base live-event contracts
- connection lifecycle logging
- reconnect-friendly client contract

**Acceptance**
- live connections are stable
- relevant events route to the right users/conversations
- hub contracts are documented

---

## F08 — `feat/presence-heartbeats-and-hibernation`

**Owner lane:** Realtime Backend + Frontend

**Scope**
- per-tab heartbeat design
- Redis-backed presence computation
- aggregated online / AFK / offline state
- frontend activity capture
- browser hibernation tolerance

**Acceptance**
- online/AFK/offline updates propagate with low latency
- multi-tab behavior is correct
- server infers state from heartbeat expiry, not explicit inactive signals

---

## F09 — `feat/conversation-watermarks-and-gap-recovery`

**Owner lane:** DB + Realtime Backend

**Scope**
- conversation watermark model
- sync endpoint design
- event payload changes
- client gap detection
- gap repair workflow

**Acceptance**
- each message receives a conversation watermark
- missing watermarks are detectable
- client can recover from a forced missed event
- no unbounded per-user queue is introduced

---

## F10 — `feat/messaging-core-and-history`

**Owner lane:** .NET Backend + Realtime Backend + Frontend

**Scope**
- room messages
- direct messages
- multiline text
- replies
- edit own message
- delete own message
- room admin delete
- history pagination
- virtualized long-history rendering

**Acceptance**
- messages persist and reload correctly
- replies render clearly
- edited flag appears
- infinite scroll loads older history in order
- 100K-message room remains usable

---

## F11 — `feat/attachments-and-secure-downloads`

**Owner lane:** .NET Backend

**Scope**
- image/file upload
- original filename preservation
- optional attachment comment
- secure metadata persistence
- authenticated download endpoint with re-checked access
- room deletion cleanup and loss-of-access enforcement

**Acceptance**
- file size limits enforced
- users lose file access after losing room access
- room deletion removes attachments permanently

---

## F12 — `feat/unread-and-chat-navigation`

**Owner lane:** .NET Backend + Frontend

**Scope**
- unread counters
- read watermark updates
- room/contact notification pills
- chat list refresh behaviors
- chat summary updates

**Acceptance**
- unread indicators increment correctly
- opening the chat clears unread state appropriately
- UI updates without full refresh

---

## F13 — `feat/slack-like-shell-and-core-screens`

**Owner lane:** Frontend

**Scope**
- top nav shell
- right rooms/contacts sidebar
- center chat panel
- member/context column
- auth screens
- sessions screen shell
- reconnect and sync states

**Acceptance**
- shell matches UX spec
- layout is responsive enough for desktop use
- app feels cohesive and modern

---

## F14 — `feat/admin-modals-and-room-management-ui`

**Owner lane:** Frontend

**Scope**
- manage room modal
- member search
- admin tab
- banned users tab
- invitations tab
- room settings tab

**Acceptance**
- admin actions are discoverable and safe
- destructive actions require confirmation
- modal behavior is stable and keyboard accessible

---

## F15 — `feat/qa-hardening-and-load-tests`

**Owner lane:** QA + DevOps

**Scope**
- e2e smoke tests
- integration tests for sync and access control
- final README run instructions
- seed/demo data strategy
- 100K-history scenario
- 100+ connected-user scenario
- long-absent user scenario

**Acceptance**
- a fresh QA user can run the app from Docker only
- smoke suite is documented and runnable
- critical flows are covered in automated tests
- long-history and watermark repair behavior are validated

---

## F16 — `feat/xmpp-phase-2` (optional)

**Owner lane:** XMPP

**Scope**
- integrate Jabber-compatible library
- admin connection dashboard
- federation traffic/stats page
- second server compose profile
- load test between server A and server B

**Acceptance**
- only attempt after F00–F15 are green
- core app remains stable when XMPP profile is disabled
- federation demo is isolated and documented

## Merge gate checklist for every feature

Before merging a feature branch into `main`:

- requirements covered are named explicitly
- tests relevant to the feature pass
- Docker startup still works from root
- README or docs updated if commands/contracts changed
- screenshots or terminal evidence attached in PR
- migrations documented if present
- watermark, presence, and history behavior considered if affected

## Suggested ownership map

- Architect: F00, final gatekeeping
- DevOps: F01, F02, F15
- .NET Backend: F03, F05, F06, F11
- Realtime Backend / DB: F07, F08, F09, F10
- Frontend: F04, F10, F12, F13, F14
- QA: F15
- Optional XMPP: F16
