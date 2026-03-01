# SIL-1 Observation Ledger (Binding Spec)

**Project:** PsyMetric / Veda

**Status:** Draft (SIL-1 scope definition; implementation not yet started)

**Related:**
- `docs/specs/SEARCH-INTELLIGENCE-LAYER.md` (SIL overview)
- `docs/ROADMAP.md` (phase commitments)

---

## 1. Objective

SIL-1 establishes a **minimum viable, deterministic, immutable observation ledger** for search reality.

SIL-1’s purpose is to store what we saw on the SERP (and the intent to track keywords) with sufficient provenance and determinism so that:

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

**Fallback rule (binding for SIL-1):** if the provider does not supply `validAt`, set `validAt = capturedAt`.

This prevents replay confusion and enables accurate delta detection when ingest is delayed.

### 3.4 Loose Coupling Between Targets and Observations

SERP observations should not require an FK to `KeywordTarget`.

Rationale:
- We may ingest snapshots for exploratory keywords not yet promoted to a target.
- Coupling would create ordering/creation constraints that do not reflect the real world.

---

## 4. Data Model (SIL-1)

SIL-1 introduces exactly two models.

### 4.1 `KeywordTarget`

Purpose: define “we care about this keyword in this locale/device.”

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
- `validAt`
- `rawPayload` (JSON)
- `source` (e.g. `dataforseo`)

**Optional fields**
- `batchRef` (string grouping identifier; does not require a separate table in SIL-1)
- `payloadSchemaVersion` (provider payload format identifier)
- `aiOverviewStatus` (tri-state)
- `aiOverviewText` (nullable)

**Constraints**
- Uniqueness: `(projectId, query, locale, device, capturedAt, source)`.

Notes:
- `rawPayload` stores provider-specific JSON for replay and future extraction.
- `payloadSchemaVersion` enables future extraction code to branch safely as provider schemas evolve.
- `aiOverviewStatus` distinguishes confirmed absence from parse failure.

---

## 5. Proposed Prisma Schema (Draft)

> This is the intended shape; final field types must match existing project conventions (UUID ids, `@db.Uuid` projectId).

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
  id                 String   @id @default(uuid()) @db.Uuid

  projectId          String   @db.Uuid
  project            Project  @relation(fields: [projectId], references: [id], onDelete: Restrict)

  query              String
  locale             String
  device             String

  capturedAt         DateTime
  validAt            DateTime

  rawPayload         Json

  // Provider payload format identifier (e.g. "dataforseo_serp_v3").
  payloadSchemaVersion String?

  // Tri-state: "present" | "absent" | "parse_error"
  aiOverviewStatus    String  @default("absent")
  aiOverviewText      String?

  source             String
  batchRef           String?

  createdAt          DateTime @default(now())

  @@unique([projectId, query, locale, device, capturedAt, source])
  @@index([projectId])
  // Primary access path: all snapshots for a keyword within a project over time.
  @@index([projectId, query, locale, device, capturedAt])
}
```

---

## 6. Event Logging Requirements

SIL-1 introduces two new event types (names tentative; must align with existing `EventType` enum conventions):

- `KEYWORD_TARGET_CREATED`
- `SERP_SNAPSHOT_RECORDED`

Rules:
- Creation of a `KeywordTarget` emits `KEYWORD_TARGET_CREATED` in the same transaction.
- Recording a `SERPSnapshot` emits `SERP_SNAPSHOT_RECORDED` in the same transaction.

No other SIL events are in scope for SIL-1.

**Blocking requirement:** because `EventLog.entityType` is an enum, SIL-1 also requires adding corresponding `EntityType` enum values (tentative):

- `keywordTarget`
- `serpSnapshot`

Without these, SIL-1 cannot satisfy the event logging invariant.

---

## 7. API Surface (Not Implemented Yet)

SIL-1 does not mandate endpoints today, but implementation will likely require:

- `POST /api/seo/keyword-targets` (create target)
- `GET /api/seo/keyword-targets` (list targets)
- `POST /api/seo/serp-snapshots` (record snapshot)
- `GET /api/seo/serp-snapshots` (list snapshots)

These endpoints are out of scope for this spec until explicitly approved.

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

## 10. Open Questions (To Resolve Before Implementation)

1. **Locale and device vocabularies:**
   - Do we enforce a strict enum for device (`desktop` | `mobile`) at schema level?
   - Do we enforce locale format validation at API boundary only?

2. **`capturedAt` ownership:**
   - Is `capturedAt` always server-assigned at ingest time?
   - If backfilling is required, do we allow client-supplied `capturedAt` only for trusted operator tooling?

3. **Raw payload size:**
   - Confirm typical DataForSEO snapshot size.
   - Ensure Postgres JSON storage is acceptable.

4. **Indexing:**
   - The compound index `@@index([projectId, query, locale, device, capturedAt])` is included because it matches the primary read path.
   - Additional indexes (e.g. on `aiOverviewStatus`) should be deferred until query patterns are proven.

---

## 11. Next Steps

1. Review this spec for alignment with invariants.
2. Update `docs/ROADMAP.md` to introduce SIL-1 as the next schema phase (if not already).
3. Only after approval:
   - implement Prisma models + migration
   - add minimal endpoints (manual ingest only)
   - add hammer coverage

**No implementation occurs until SIL-1 is approved in the roadmap.**
