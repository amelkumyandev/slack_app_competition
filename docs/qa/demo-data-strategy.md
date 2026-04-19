# Demo Data Strategy

The repository currently uses an **ephemeral QA-data strategy** instead of fixed shared demo accounts.

## Why

- it avoids brittle test credentials committed into the repo
- repeated smoke and load runs do not fight over the same usernames
- a clean Docker reset is enough to restore a known-good starting point

## Current approach

- `npm run qa:smoke` creates fresh temporary users and rooms every run
- `npm run qa:load:history` creates a dedicated owner, dormant member, and room before seeding message volume
- `npm run qa:load:fanout` creates a dedicated room and unique users for realtime fan-out validation

## Reset model

To return to an empty local state:

```bash
docker compose down --volumes
docker compose up --build
```

## Future upgrade path

If the competition later needs fixed demo personas, they should be added as an explicit seed step with documented credentials rather than mixed into the smoke scripts silently.
