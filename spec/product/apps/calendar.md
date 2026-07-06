# nxus-calendar — schedule lens

Invalidated by: product decisions about scheduling nodes and external calendar sync.

Calendar (port 3003, base `/calendar`) is the **scheduling lens**: events and tasks are ordinary nodes in the graph ([../data-model.md](../data-model.md)) rendered on a calendar. There is no separate events store — deleting the calendar app loses zero data.

## Shape

- `apps/nxus-calendar` is a 6-file shell mounting `CalendarRoute` and adding Google OAuth wiring (`src/routes/index.tsx:13`, `oauth-callback.tsx`). All logic lives in `libs/nxus-calendar` (39 files): react-big-calendar UI (`src/route.tsx` — touch gestures, keyboard shortcuts, error boundary at `:294,307,444`), rrule recurrence, date utils.
- googleapis is Node-only and MUST stay isolated behind the server entry `libs/nxus-calendar/src/server.ts` (dynamic-import rule: [../../tech/architecture.md](../../tech/architecture.md)).

## Nodes-as-events contract

- An event is any node tagged `SYSTEM_SUPERTAGS.EVENT`; a task is any node tagged `SYSTEM_SUPERTAGS.TASK`. Date-range fetches are pure `QueryDefinition` builders over these supertags and `SYSTEM_FIELDS` date properties (`libs/nxus-calendar/src/lib/query-builder.ts:9-11,89-94`). The calendar MUST NOT bypass the query system for reads.
- Nodes created/edited in any other lens (editor, workbench) with the right supertag+dates MUST appear on the calendar without ceremony, and vice versa.

## Google Calendar sync

- OAuth: auth-url → callback → token exchange server fns (`libs/nxus-calendar/src/server/google-sync.server.ts:233,264`); status/disconnect/calendar-pick at `:295,495,519,565`. Tokens and sync bookkeeping are themselves node properties — system fields `field:gcal_access_token`, `field:gcal_refresh_token`, `field:gcal_event_id`, `field:gcal_synced_at`, etc. (`libs/nxus-db/src/schemas/node-schema.ts:252-260`).
- Push: `syncToGoogleCalendarServerFn` (`google-sync.server.ts:347`) pushes events needing sync — never synced (no `gcal_event_id`) or modified since `gcal_synced_at` (pending-sync query, `lib/query-builder.ts:345-381`) — creating/updating Google events via `lib/google-calendar.ts` (`createGoogleEvent:355`, `updateGoogleEvent:388`, `deleteGoogleEvent:432`).

DRIFT: sync is one-way (push), not two-way
- canonical: two-way sync — changes made in Google Calendar flow back into nodes.
- current: only nxus→Google push exists; the pull converter `fromGoogleCalendarEvent` (`lib/google-calendar.ts:323`) is exported but no server fn imports Google events into nodes.
- impact: edits made in Google are invisible in nxus; users treating Google as an equal surface silently diverge.
- closes: an import server fn (incremental `events.list` w/ syncToken) that upserts nodes keyed by `gcal_event_id`, with a conflict rule (`updated` timestamp wins).

DRIFT: OAuth tokens stored as plaintext node properties
- canonical: credentials live outside the queryable graph (OS keychain or env-scoped secret store).
- current: access/refresh tokens are node properties (`node-schema.ts:257-259`), hidden only by UI denylists in other lenses.
- impact: any node-dump, query surface, or export leaks live Google credentials.
- closes: a persistence decision — see [../../tech/persistence.md](../../tech/persistence.md).

## Health note

Cleanest lib in the repo (tests for query-builder/rrule/date-utils, no dead code) but untouched since 2026-02-11 while the facade API evolves — treat as regression-risk when the node API consolidation lands.
