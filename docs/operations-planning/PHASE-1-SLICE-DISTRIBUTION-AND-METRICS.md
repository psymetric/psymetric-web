# Phase 1 — Controlled Slice: Distribution & Metrics (Structural Depth)

## Status
OPEN — Controlled Execution

## Objective
Implement the missing **database spine** components required by Phase 1:

- `DistributionEvent` model
- `MetricSnapshot` model

…and the minimal backend endpoints needed to **record** distribution actions and metrics snapshots.

This slice is about **structural depth** (traceability + storage), not about UI or automation.

---

## Scope

### In scope
- Prisma schema additions for:
  - `DistributionEvent`
  - `MetricSnapshot`
- Minimal API routes to record:
  - distribution events (human-gated, manual workflow)
  - metric snapshots (time-based)
- EventLog emissions:
  - `DISTRIBUTION_CREATED` and/or `DISTRIBUTION_PUBLISHED` (per action)
  - `METRIC_SNAPSHOT_RECORDED`

### Out of scope
- Public website
- Dashboard screens
- Any autonomous posting
- Any external API integrations
- Analytics dashboards
- Phase 2+ systems

---

## Design principles
- **Database is canonical truth.**
- Distribution is logged as **events + rows**, not inferred.
- Metrics are **snapshots, not conclusions**.
- No silent mutation.
- Every meaningful action emits exactly one EventLog entry.

---

## Model requirements

### DistributionEvent
A record of a distribution action (e.g., a human posting a link to X).

Minimum required fields (Phase 1):
- `id` (uuid)
- `platform` (Platform enum; primarily `x`)
- `externalUrl` (string; the URL of the post/tweet)
- `status` (EntityStatus; draft|publish_requested|published|archived)
- `publishedAt` (datetime?)
- `archivedAt` (datetime?)
- `primaryEntityType` (ContentEntityType)
- `primaryEntityId` (uuid of Entity)
- `createdAt`, `updatedAt`

Indexes:
- `(primaryEntityType, primaryEntityId)`
- `(status)`
- `(platform)`

Notes:
- DistributionEvent is **not** the same as DraftArtifact.
- DistributionEvent is **canonical trace** of distribution, not a suggestion.

### MetricSnapshot
A time-series snapshot of a metric.

Minimum required fields (Phase 1):
- `id` (uuid)
- `metricType` (enum; enforced vocabulary)
- `value` (int)
- `platform` (Platform enum)
- `capturedAt` (datetime)
- `entityType` (ContentEntityType)
- `entityId` (uuid)
- `notes` (string?)
- `createdAt`

Indexes:
- `(metricType, capturedAt)`
- `(entityType, entityId, capturedAt)`

---

## API requirements (minimal)

### 1) Record distribution

POST /api/distribution-events

Body:
- `platform` ("x" for Phase 1)
- `primaryEntityId`
- `externalUrl`
- `publishedAt` (optional; default now)

Behavior:
- Create DistributionEvent row
- Emit EventLog:
  - `DISTRIBUTION_CREATED` (always)
  - optionally `DISTRIBUTION_PUBLISHED` if created directly as published

Response:
- created DistributionEvent

### 2) Record metric snapshot

POST /api/metric-snapshots

Body:
- `metricType`
- `value`
- `platform`
- `entityId`
- `capturedAt` (optional; default now)
- `notes` (optional)

Behavior:
- Create MetricSnapshot row
- Emit EventLog:
  - `METRIC_SNAPSHOT_RECORDED`

Response:
- created MetricSnapshot

---

## Verification plan

- Apply Prisma migration successfully (Neon)
- Build passes (Next 16)
- Create a published Entity
- Record a DistributionEvent for it
- Record a MetricSnapshot for it
- Verify EventLog entries exist and are correctly typed

---

## Definition of Done

- Schema includes DistributionEvent + MetricSnapshot
- Migrations applied in deploy
- Minimal POST endpoints exist and work
- Events emitted for each action
- No UI changes
- No autonomous posting
