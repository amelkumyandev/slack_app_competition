# Frontend UX Spec

## 1. UX target

The product should feel like a **classic team chat application with Slack-like polish**, not like a social network. The goal is familiar navigation, strong message readability, clear unread indicators, obvious presence status, and fast room switching.

## 2. Important compliance note

The competition wireframes include a **top menu**, a **center message area**, a **right-side rooms/contacts sidebar**, and a **right-side room members/context panel**. Slack normally places navigation on the left, but this implementation should use a **Slack-inspired visual language** rather than copying Slack’s exact layout.

## 3. Design principles

- clean message hierarchy
- strong spacing and typography
- subtle surfaces and borders
- obvious presence indicators
- fast keyboard-friendly flows
- minimal visual noise
- excellent empty, loading, reconnect, syncing, and error states
- dark-mode-first visual design with accessible contrast

## 4. Primary screens

### Landing / auth

- split or centered auth card
- register and sign-in flows
- lightweight, professional branding
- persistent-login option
- forgot-password flow

### Main chat shell

- top navigation with sections: public rooms, private rooms, contacts, sessions, profile, sign out
- collapsible right sidebar for rooms and contacts
- center chat surface with channel/dialog header
- members/context panel on room views
- sticky composer at bottom

### Manage room modal

- tabs for members, admins, banned users, invitations, settings
- searchable member list
- obvious admin actions
- strong destructive-action confirmation

### Sessions screen

- list current and historical active sessions
- current session badge
- revoke button per session
- browser/IP/device details if available

## 5. Slack-like visual language

Use Slack-like cues carefully:

- compact but readable message rows
- subtle channel header
- presence dots next to names
- date separators in history
- hover actions on messages
- reply preview blocks
- unread badges on rooms and contacts
- restrained color accents
- modern composer with attachment and emoji actions

Do **not** overbuild secondary Slack features like threads, huddles, reactions, or multi-workspace mechanics unless there is spare time.

## 6. Layout behavior

### Main shell

- top bar remains fixed
- center panel scrolls independently
- right rooms/contacts sidebar can compact after entering a room
- room members/context column appears in room context

### Message list

- auto-scroll only if user is already near bottom
- if user is reading older content, preserve scroll position
- show a “new messages” jump affordance when appropriate
- support long histories with cursor or watermark pagination
- preserve scroll anchor when prepending older messages

## 7. Reconnect and sync states

The UI must handle missed realtime updates.

Recommended states:

- `reconnecting...`
- `syncing missing messages...`
- `connection restored`
- `messages may be out of date, retrying`

If a watermark gap is detected, the chat should request missing history and repair the visible window without forcing a full page reload.

## 8. Presence system in UI

Use a simple presence legend:

- solid green dot = online
- amber / half-tone = AFK
- gray = offline

Presence should appear in:

- contacts list
- room member list
- room headers where useful
- direct message list rows

Presence shown in the UI is always server-derived aggregated state, not local guesswork.

## 9. Conversations and sidebars

### Right sidebar sections

- search
- public rooms accordion
- private rooms accordion
- contacts section
- create room action

### Row behavior

Each room/contact row should support:

- active state
- unread count pill
- connection or muted state later if needed
- clear hover affordance

## 10. Message row design

Each message row can include:

- author avatar placeholder or initials
- display name
- timestamp
- message text
- edited label
- reply quote block if message is a reply
- attachment card if present
- delivery/sync state if a gap recovery is in progress

Actions on hover:

- reply
- edit (own messages only)
- delete (own messages, plus admin controls in rooms)

## 11. Composer design

The composer should feel modern and reliable:

- multiline text area
- attachment button
- emoji button
- reply context chip with dismiss action
- send button
- Enter to send, Shift+Enter for newline

For uploads:

- show pending upload state
- show file name and optional comment input
- validate max file size early

## 12. Long-history behavior

This UI must remain usable for very old rooms.

Requirements:

- virtualized message list
- progressive fetch of older history
- stable scroll position during prepend
- date separators rendered correctly even in windowed lists
- no full render of 100K message DOM trees
- recover cleanly after reconnect or missed messages

## 13. Room management UX

Room management actions should live in modal dialogs and controlled menus.

Required actions:

- invite user
- make/remove admin
- remove member
- ban/unban
- view who banned a user
- delete room
- change room name/description/visibility

## 14. Notifications and unread behavior

Unread indicators should appear next to:

- room rows
- contact/direct dialog rows

Clear unread when the corresponding chat is opened and viewed.

Optional niceties:

- small top-of-chat unread boundary line
- favicon badge if time permits

## 15. Accessibility

- fully visible focus rings
- keyboard access for all menus and modal actions
- semantic buttons and lists
- high color contrast
- aria labels on icon buttons
- file upload states announced clearly

## 16. Suggested frontend structure

```text
/apps/web/src
  /app
  /components
    /layout
    /rooms
    /contacts
    /messages
    /composer
    /sessions
    /modals
  /features
    /auth
    /rooms
    /contacts
    /presence
    /messaging
    /attachments
  /lib
    /api
    /signalr
    /stores
    /types
```

## 17. Definition of frontend done

A frontend feature is done when:

- it matches the intended flow
- loading, empty, reconnect, sync, and error states exist
- realtime updates are reflected without page refresh
- keyboard and mouse flows both work
- large histories remain smooth and readable
- the design remains visually coherent with the Slack-like target
