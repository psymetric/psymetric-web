# SIL-1 Ingest Discipline (Binding Spec)

**Project:** PsyMetric / Veda

**Status:** Draft (authoritative for SIL-1 endpoint implementation)

**Related:**
- `docs/specs/SIL-1-OBSERVATION-LEDGER.md`
- `docs/specs/SEARCH-INTELLIGENCE-LAYER.md`
- `docs/ROADMAP.md` (Phase 0.1)

---

## 1. Objective

Define the **non-negotiable ingest rules** for SIL-1 so that when endpoints are implemented they:

- preserve project isolation
- remain deterministic
- stay auditable (event-logged)
- avoid silent fragmentation (query normalization)
- remain operator-driven (no automation)

This document is about **how data is recorded**, not which UI calls it.

---

## 2. Core Principles

### 2.1 Operator-Triggered Only

- No scheduled ingestion.
- No background jobs.
- Any ingest is initiated explicitly by an operator action.

### 2.2 Append-Only Observations

- `SERPSnapshot` rows are immutable.
- A new ingest creates a new snapshot row.
- Corrections are represented as later snapshots.

### 2.3 Governance vs Observation

- `KeywordTarget` is a governance/config record and may be updated.
- `SERPSnapshot` is an observation record and must not be updated.

---

## 3. Project Scoping & Non-Disclosure

All SIL-1 endpoints MUST:

- resolve `projectId` via `resolveProjectId()` (headers)
- scope every query by `projectId`
- return **404** for cross-project access (no existence leaks)

---

## 4. Deterministic Query Normalization (Binding)

Normalization MUST be applied at the API boundary for both `KeywordTarget` and `SERPSnapshot`.

### 4.1 Normalization Function

Implement a single canonical helper (e.g., `normalizeQuery()` in `src/lib/validation.ts`).

Rules:

1. `trim()` leading/trailing whitespace
2. collapse internal whitespace to single spaces
3. lowercase

Example:

- `"  Best   CRM  "` → `"best crm"`

### 4.2 Persistence Rule

Persist the **normalized** query string in the database.

- Do not store raw query variants.
- If the UI needs the original, it can store it outside SIL-1 (future). SIL-1 stores the canonical form.

### 4.3 Join Rule

All joins between targets and snapshots MUST use normalized query strings.

---

## 5. Timestamp Doctrine (Binding)

### 5.1 `capturedAt`

- `capturedAt` represents when PsyMetric captured the observation.
- Default behavior: server assigns `capturedAt = now()` at ingest time.

**Backfill allowance (optional, operator-only):**
- If supporting backfill, accept a client-provided `capturedAt` only from trusted operator tooling.
- Backfill must be explicitly flagged (e.g., `isBackfill` in request body) to avoid accidental misuse.

### 5.2 `validAt`

- If provider supplies a validity timestamp, store it.
- Otherwise, set `validAt = capturedAt`.

---

## 6. Idempotency & Duplicate Semantics

### 6.1 SERPSnapshot Uniqueness

`SERPSnapshot` unique constraint is:

- `(projectId, query, locale, device, capturedAt)`

Ingest behavior:

- If insert succeeds: return 201
- If unique constraint violation:
  - return 200 with the existing snapshot id (idempotent replay)
  - do **not** create a second event log entry

**Rationale:**
- Prevents accidental duplication while allowing safe retries.

### 6.2 KeywordTarget Uniqueness

`KeywordTarget` unique constraint is:

- `(projectId, query, locale, device)`

Ingest behavior:

- Create target: 201
- Create duplicate: return 409 conflict (or 200 idempotent create, choose one and be consistent)

**Recommendation:** use 409 for governance records (targets are intentional), use idempotent 200 only for observation replay.

---

## 7. Event Logging (Blocking Requirement)

All SIL-1 mutations MUST occur inside `prisma.$transaction()`.

### 7.1 Event Types

- `KEYWORD_TARGET_CREATED`
- `SERP_SNAPSHOT_RECORDED`

### 7.2 Entity Types

- `keywordTarget`
- `serpSnapshot`

### 7.3 Atomicity Rule

- The model write and the EventLog write must be in the same transaction.
- If one fails, both roll back.

### 7.4 Idempotency Rule

On idempotent replay (unique constraint hit and we return existing snapshot):

- Do **not** emit a new `SERP_SNAPSHOT_RECORDED` event.

Reason: events represent real state mutations.

---

## 8. Validation Rules (Zod)

SIL-1 endpoints must use Zod v4 schemas using the project standard pattern:

- `safeParse()`
- `.strict()`
- flattened errors mapped to existing 400 envelope

### 8.1 KeywordTarget Create Schema

Fields:
- `query` (string, non-empty)
- `locale` (string, non-empty)
- `device` (enum: `desktop` | `mobile` — enforce at API boundary even if DB stores string)
- `isPrimary?` (boolean)
- `intent?` (string)
- `notes?` (string)

### 8.2 SERPSnapshot Record Schema

Fields:
- `query` (string, non-empty)
- `locale` (string, non-empty)
- `device` (enum)
- `capturedAt?` (ISO datetime string) — only if backfill is explicitly enabled
- `validAt?` (ISO datetime string)
- `rawPayload` (object; stored as JSON)
- `payloadSchemaVersion?` (string)
- `aiOverviewStatus?` (enum: `present` | `absent` | `parse_error`)
- `aiOverviewText?` (string)
- `source` (string; validate against allowlist, e.g. `dataforseo`)
- `batchRef?` (string)

**Malformed JSON guard:** any JSON parse failure must return 400.

---

## 9. Deterministic Read Defaults (When Implemented)

### 9.1 KeywordTarget listing

- `orderBy: [{ createdAt: "desc" }, { id: "desc" }]`

### 9.2 SERPSnapshot listing

- `orderBy: [{ capturedAt: "desc" }, { id: "desc" }]`

Always include `id` tie-break.

---

## 10. Error Taxonomy (Binding)

- 400: validation / malformed JSON
- 404: cross-project non-disclosure, missing resources
- 409: true conflicts (e.g., duplicate KeywordTarget create)
- 201: created
- 200: idempotent replay (SERPSnapshot unique constraint hit)

Avoid leaking cross-project existence in error messages.

---

## 11. Implementation Checklist (For Endpoint Phase)

Before writing endpoints:

- Add `normalizeQuery()` helper
- Add Zod schemas:
  - `src/lib/schemas/keyword-target.ts`
  - `src/lib/schemas/serp-snapshot.ts`
- Confirm enums exist (already migrated)

For each endpoint:

- resolve projectId
- `safeParse()` strict
- normalize query
- `prisma.$transaction()`:
  - write
  - EventLog
- deterministic response envelope

Add hammer tests:

- create keyword target valid
- duplicate keyword target -> 409
- record SERP snapshot valid
- replay same snapshot -> 200 idempotent
- cross-project access -> 404
- malformed JSON -> 400

---

## 12. Explicit Non-Goals

SIL-1 ingest discipline does not include:

- volatility scoring
- clustering
- LLM calls
- GraphRAG
- embeddings
- background ingest

Those belong to later phases.
