# SIL-1 Observation Ledger (Binding Spec)

**Project:** PsyMetric / Veda

**Status:** Schema implemented. Create endpoints implemented. List endpoints pending.

**Implementation state as of last reconciliation:**
- `KeywordTarget` and `SERPSnapshot` models: ✅ in production schema
- `POST /api/seo/keyword-targets`: ✅ implemented
- `POST /api/seo/serp-snapshots`: ✅ implemented (idempotent replay)
- `GET` list endpoints: ⏳ not yet implemented
- Hammer coverage: ✅ included in 62 PASS run

**Schema drift flags (do not fix without explicit instruction):**
- Spec Section 5.2 shows `aiOverviewStatus @default("absent")` — production schema omits the default; value is application-validated at ingest boundary.
- Spec Section 5.2 shows `validAt DateTime` (required) — production schema has `validAt DateTime?` (nullable); fallback rule (set `validAt = capturedAt` when provider omits it) is enforced at API boundary, not at schema level.
- Spec Section 4.2 uniqueness constraint includes `source` — production schema `@@unique` omits `source`: `@@unique([projectId, query, locale, device, capturedAt])`. This is a known divergence; idempotency is enforced on this 5-field key.

**Related:**
- `docs/specs/SEARCH-INTELLIGENCE-LAYER.md` (SIL overview)
- `docs/ROADMAP.md` (phase commitments)

---

## 1. Objective

SIL-1 establishes a **minimum viable, deterministic, immutable observation ledger** for search reality.

SIL-1's purpose is to store what we saw on the SERP (and the intent to track keywords) with sufficient provenance and determinism so that:

- Rule-based insights (SIL-2) can compute deltas reliably.
- LLM planning (Phase 3) can reason over stable, queryable observations.
- Future GraphRAG/vector retrieval (Phase 7) can traverse stable node IDs with provenance.

SIL-1 explicitly does **not** attempt to score volatility, cluster keywords, or generate recommendations.

---

## 2. Non-Negotiable Invariants

SIL-1 must comply with existing platform invariants:

1. **Multi-project isolation**
   - Every record is scoped by `projectId`.
   - Cross-project access returns **404 non-disclosure**.
   - DB constraints/triggers prevent cross-project contamination.

2. **Strict event logging**
   - Any mutation must occur inside `prisma.$transaction()`.
   - No mutation without a corresponding `EventLog` entry.

3. **Determinism**
   - All list queries require explicit `orderBy` with `id` tie-break.
   - No implicit DB ordering.

4. **No background automation**
   - Operator-triggered actions only.
   - No cron/scheduled ingest.
   - No autonomous publishing.

5. **No speculative engineering**
   - Add only what SIL-1 requires.
   - Do not introduce unused schema.

---

## 3. Doctrine

### 3.1 Observations are Immutable

SIL-1 observation records are append-only.

- No `UPDATE` of observation rows.
- Corrections or re-runs create new observations.
- Unwanted data is handled via operational suppression (future) or batch invalidation (future).

**Important:** `KeywordTarget` is **not** an observation row. It is a governance/config record and may be updated (e.g. `isPrimary`, `intent`, `notes`). Observation immutability applies to `SERPSnapshot`.

### 3.2 Query Normalization (Required)

`query` must be normalized at the API boundary for both `KeywordTarget` and `SERPSnapshot` writes.

Minimum normalization rule (binding for SIL-1):

- Trim leading/trailing whitespace
- Collapse internal whitespace to single spaces
- Lowercase

This prevents silent fragmentation ("Best CRM" vs "best crm") and ensures soft-joins remain reliable.

### 3.3 Bitemporal Timestamps

SERP observations must capture two time semantics:

- `capturedAt`: when PsyMetric captured the observation.
- `validAt`: the timestamp the provider asserts the data is valid for.

**Fallback rule (binding for SIL-1):** if the provider does not supply `validAt`, set `validAt = capturedAt` at the API boundary. `validAt` is nullable in the schema; the fallback is enforced in application code, not at the DB level.

This prevents replay confusion and enables accurate delta detection when ingest is delayed.

### 3.4 Loose Coupling Between Targets and Observations

SERP observations do not require an FK to `KeywordTarget`.

Rationale:
- We may ingest snapshots for exploratory keywords not yet promoted to a target.
- Coupling would create ordering/creation constraints that do not reflect the real world.

---

## 4. Data Model (SIL-1)

SIL-1 introduces exactly two models.

### 4.1 `KeywordTarget`

Purpose: define "we care about this keyword in this locale/device."

**Required fields**
- `projectId`
- `query` (normalized)
- `locale` (e.g. `en-US`)
- `device` (e.g. `desktop` | `mobile`)

**Optional fields**
- `intent`
- `notes`

**Governance fields**
- `isPrimary` (default false)

**Constraints**
- Uniqueness: one target per `(projectId, query, locale, device)`.

### 4.2 `SERPSnapshot`

Purpose: immutable record of a SERP observation.

**Required fields**
- `projectId`
- `query` (normalized)
- `locale`
- `device`
- `capturedAt`
- `validAt` (nullable in schema; API boundary enforces fallback to `capturedAt`)
- `rawPayload` (JSON)
- `source` (e.g. `dataforseo`)
- `aiOverviewStatus` (application-validated: `"present"` | `"absent"` | `"parse_error"`)

**Optional fields**
- `batchRef` (string grouping identifier; does not require a separate table in SIL-1)
- `payloadSchemaVersion` (provider payload format identifier)
- `aiOverviewText` (nullable)

**Constraints**
- Uniqueness (production): `(projectId, query, locale, device, capturedAt)`.
  - Note: `source` is excluded from the production unique key (diverges from original spec). See drift flags at top of document.

Notes:
- `rawPayload` stores provider-specific JSON for replay and future extraction.
- `payloadSchemaVersion` enables future extraction code to branch safely as provider schemas evolve.
- `aiOverviewStatus` distinguishes confirmed absence from parse failure. No DB default; enforced at API boundary.

---

## 5. Implemented Prisma Schema

> This is the production shape as implemented in `prisma/schema.prisma`.

### 5.1 KeywordTarget

```prisma
model KeywordTarget {
  id         String   @id @default(uuid()) @db.Uuid

  projectId  String   @db.Uuid
  project    Project  @relation(fields: [projectId], references: [id], onDelete: Restrict)

  query      String
  locale     String
  device     String

  isPrimary  Boolean  @default(false)

  intent     String?
  notes      String?

  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@unique([projectId, query, locale, device])
  @@index([projectId])
}
```

### 5.2 SERPSnapshot

```prisma
model SERPSnapshot {
  id                   String   @id @default(uuid()) @db.Uuid

  projectId            String   @db.Uuid
  project              Project  @relation(fields: [projectId], references: [id], onDelete: Restrict)

  query                String
  locale               String
  device               String

  capturedAt           DateTime
  validAt              DateTime?

  rawPayload           Json
  payloadSchemaVersion String?

  aiOverviewStatus     String   // Application-validated: "present" | "absent" | "parse_error"
  aiOverviewText       String?

  source               String
  batchRef             String?

  createdAt            DateTime @default(now())

  @@unique([projectId, query, locale, device, capturedAt])
  @@index([projectId, query, locale, device, capturedAt])
  @@index([projectId])
}
```

---

## 6. Event Logging Requirements

SIL-1 uses the following event types (implemented in production schema):

- `KEYWORD_TARGET_CREATED` — emitted in the same transaction as `KeywordTarget` creation
- `SERP_SNAPSHOT_RECORDED` — emitted in the same transaction as `SERPSnapshot` creation

Corresponding `EntityType` values (implemented):
- `keywordTarget`
- `serpSnapshot`

---

## 7. API Surface

### Implemented

- `POST /api/seo/keyword-targets` — create target with query normalization, uniqueness enforcement, EventLog entry
- `POST /api/seo/serp-snapshots` — record snapshot with idempotent replay (200 on duplicate), strict Zod validation, EventLog entry

### Not Yet Implemented

- `GET /api/seo/keyword-targets` — list targets (next authorized increment)
- `GET /api/seo/serp-snapshots` — list snapshots (next authorized increment)

No update or delete endpoints are in scope for SIL-1.

---

## 8. Deterministic Querying

All list endpoints (when implemented) must:

- Filter by `projectId`.
- Use explicit ordering:
  - `SERPSnapshot`: `orderBy: [{ capturedAt: "desc" }, { id: "desc" }]` (or asc, but must be explicit)
  - `KeywordTarget`: `orderBy: [{ createdAt: "desc" }, { id: "desc" }]`

No implicit ordering.

---

## 9. Out of Scope (Explicit)

Not included in SIL-1:

- Volatility scoring
- Keyword clustering
- Cluster authority models
- Competitor domain extraction
- AI citation extraction beyond simple flags
- IngestBatch table (batchRef string is sufficient for SIL-1)
- EntityLocale publish primitive
- Embeddings / vector DB
- GraphRAG
- Any autonomous behavior

---

## 10. Resolved Implementation Decisions

The following open questions from the original spec have been resolved in the implementation:

1. **Device vocabulary:** Enforced at API boundary only (string validation), not as a DB enum.
2. **Locale format validation:** Enforced at API boundary only.
3. **`capturedAt` ownership:** Server-assigned at ingest time. No client-supplied `capturedAt` in current implementation.
4. **`validAt` nullability:** Nullable in schema; API boundary applies fallback (`validAt = capturedAt`) when provider omits it.
5. **`source` in unique key:** Omitted from production unique constraint. Idempotency enforced on `(projectId, query, locale, device, capturedAt)`.

---

## 11. Next Steps

1. Implement `GET /api/seo/keyword-targets` with deterministic ordering and project-scoped filtering.
2. Implement `GET /api/seo/serp-snapshots` with deterministic ordering and project-scoped filtering.
3. Extend hammer with list endpoint coverage.
