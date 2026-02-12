# Phase 1 — Controlled Slice Addendum: Distribution & Metrics Read APIs

## Status
OPEN — Controlled Execution

## Objective
Add **read/query APIs** for Phase 1 structural depth so operators (and future UI) can retrieve:

- DistributionEvent rows
- MetricSnapshot rows

This is read-only. It makes the new canonical spine usable without adding UI.

---

## Scope

### In scope
- `GET /api/distribution-events` (list + filters + pagination)
- `GET /api/metric-snapshots` (list + filters + pagination)

### Out of scope
- UI screens
- Public website
- Analytics/aggregation endpoints
- Background jobs
- Any schema changes

---

## Design principles
- Mirror existing list patterns (see `GET /api/entities`).
- Deterministic validation of query params.
- Return minimal, predictable shapes.
- Prefer boring filters over clever joins.

---

## API: GET /api/distribution-events

### Query params
- `platform` (Platform enum)
- `status` (EntityStatus enum)
- `primaryEntityId` (uuid string)
- `search` (substring match on `externalUrl`)
- `publishedAfter` (ISO date)
- `publishedBefore` (ISO date)
- Pagination:
  - `page` (default 1)
  - `limit` (default 20, max 100)

### Behavior
- Validate enums using existing validation helpers.
- Validate dates (ISO parseable).
- Build Prisma `where`:
  - `externalUrl` contains `search` (insensitive)
  - `publishedAt` range (gte/lte)
- Sort: `publishedAt desc`, then `createdAt desc`.
- Response: `listResponse(data, { page, limit, total })`

---

## API: GET /api/metric-snapshots

### Query params
- `platform` (Platform enum)
- `metricType` (MetricType enum)
- `entityId` (uuid string)
- `capturedAfter` (ISO date)
- `capturedBefore` (ISO date)
- Pagination:
  - `page` (default 1)
  - `limit` (default 20, max 100)

### Behavior
- Validate enums using existing helpers (`VALID_PLATFORMS`, `VALID_METRIC_TYPES`).
- Validate dates.
- Build Prisma `where`:
  - `capturedAt` range (gte/lte)
- Sort: `capturedAt desc`, then `createdAt desc`.
- Response: `listResponse(data, { page, limit, total })`

---

## Definition of Done
- Both GET endpoints implemented (in existing route.ts files).
- Query params validated with clear 400s.
- Pagination implemented using `parsePagination`.
- Build passes.
- No schema changes.
- No UI changes.

---

## Verification plan
- Create a DistributionEvent + MetricSnapshot using existing POST endpoints.
- Query with:
  - default GET list
  - filters (platform, metricType)
  - date ranges
- Confirm pagination fields returned.
