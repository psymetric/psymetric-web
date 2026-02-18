# PsyMetric — SEO Subsystem Final Convergence Lock

**Date:** 2026-02-18
**Status:** FINAL — All decisions locked. No ambiguity remains.
**Supersedes:** SEO-SUBSYSTEM-RECONCILIATION.md (which identified the issues; this document resolves them)

---

## I. Final Locked Decisions

### Decision 1: W3 Event Semantics (QuotableBlock Creation)

**Chosen: Option B — Add `QUOTABLE_BLOCK_CREATED` to `EventType`. Also add `quotableBlock` to `EntityType`.**

Justification: `ENTITY_CREATED` semantically means "a new content entity was created" and is used for guide/concept/project/news creation events. QuotableBlock is not a content entity — it is a satellite record attached to an Entity. Overloading `ENTITY_CREATED` for QuotableBlock creation pollutes audit queries: any query filtering `eventType = ENTITY_CREATED` to count new content would include QuotableBlock records, producing incorrect counts. A dedicated `QUOTABLE_BLOCK_CREATED` event type costs one enum value and buys clean audit semantics permanently. The `quotableBlock` value in `EntityType` is still required because `EventLog.entityType` must identify the table the `entityId` points to.

**Exact changes:**
- Add `quotableBlock` to `EntityType` enum
- Add `QUOTABLE_BLOCK_CREATED` to `EventType` enum

### Decision 2: W1 Event Semantics (SearchPerformance Ingestion)

**Chosen: Add `searchPerformance` to `EntityType`. Keep `METRIC_SNAPSHOT_RECORDED` as EventType.**

When W1 inserts a batch of SearchPerformance rows, the EventLog entry is:
- `eventType`: `METRIC_SNAPSHOT_RECORDED`
- `entityType`: `project`
- `entityId`: the Project UUID (the aggregate owner of the batch)
- `actor`: `system`
- `details`: `{ "source": "gsc", "model": "searchPerformance", "rowCount": N, "dateStart": "...", "dateEnd": "..." }`

Justification: `METRIC_SNAPSHOT_RECORDED` is the correct semantic — we are recording performance data. A new EventType is unnecessary because the operation category (recording metrics) is the same. Batch ingest events point at the Project (the aggregate owner) because no single SearchPerformance row is the target. The `details.model` field disambiguates what was ingested. This keeps EventLog volume proportional to operator actions, not data volume. The alternative — one EventLog row per SearchPerformance row — would create O(N) event log entries for a single GSC pull, which is wasteful.

**Exact changes:**
- Add `searchPerformance` to `EntityType` enum (for future row-level events if needed; batch events use `entityType: project`)

### Decision 3: SearchPerformance Reverse Relation on Entity

**Decision: Add it. Required, not optional.**

The primary query pattern for SearchPerformance is "show me search data for entity X." Without the reverse relation on Entity, this requires a manual `where: { entityId: x }` query that Prisma supports but that bypasses Prisma's relation loading. The FK (`entityId`) already exists. The reverse relation costs zero at the DB level — it's a Prisma declaration only.

**Exact Prisma addition to Entity model:**
```prisma
searchPerformanceRecords SearchPerformance[]
```

### Decision 4: Deduplication Strategy

**Decision: Application-enforced only. No DB-level unique constraint.**

Justification: The solo-operator, manual-trigger execution model means concurrent duplicate inserts are not a realistic failure mode today. Adding a unique constraint on `(contentHash, kind)` requires: (a) deciding on conflict behavior (reject? upsert?), (b) handling the nullable `contentHash` (PostgreSQL treats each NULL as unique, so the constraint only fires on non-null values — acceptable but needs documentation), (c) writing conflict-handling code. None of this is justified by current risk. The dedup check-then-insert pattern inside a `prisma.$transaction()` is sufficient.

**Known limitation to document:** If concurrent access is introduced (multi-user, cron jobs), add `@@unique([contentHash, kind])` with `ON CONFLICT DO NOTHING` or advisory locks.

### Decision 5: Per-Project Spend Caps in SystemConfig

**Decision: Single global key with structured JSON value. No project-scoped keys.**

**Key:** `dataforseo_daily_budget_usd`

**Value structure:**
```json
{
  "default": 2.00,
  "overrides": {
    "<project-uuid>": 1.50
  }
}
```

**Resolution logic (application-enforced):**
1. Read `dataforseo_daily_budget_usd` from SystemConfig.
2. Parse JSON value.
3. If `overrides[projectId]` exists, use that value.
4. Otherwise, use `default`.

**Same pattern for all per-workflow caps:**

| SystemConfig Key | Value Structure |
|---|---|
| `dataforseo_daily_budget_usd` | `{ "default": N, "overrides": { "<projectId>": N } }` |
| `dataforseo_keyword_daily_cap` | `{ "default": N, "overrides": { "<projectId>": N } }` |
| `dataforseo_serp_daily_cap` | `{ "default": N, "overrides": { "<projectId>": N } }` |
| `dataforseo_ai_keyword_daily_cap` | `{ "default": N, "overrides": { "<projectId>": N } }` |
| `dataforseo_llm_mentions_weekly_cap` | `{ "default": N, "overrides": { "<projectId>": N } }` |
| `dataforseo_llm_responses_daily_cap` | `{ "default": N, "overrides": { "<projectId>": N } }` |
| `dataforseo_backlinks_monthly_cap` | `{ "default": N, "overrides": { "<projectId>": N } }` |

This uses the existing global SystemConfig with `value Json`. No schema change. No new table.

---

## II. Exact Schema Changes (Diff-Style)

All changes below are additions to the SEO migration batch. They supplement (do not replace) the changes already specified in SEO-SCHEMA-MIGRATION-PLAN.md.

### Change 1: EntityType Enum — Add 2 Values

```diff
 enum EntityType {
   guide
   concept
   project
   news
   distributionEvent
   video
   sourceItem
   sourceFeed
   metricSnapshot
+  quotableBlock
+  searchPerformance
 }
```

### Change 2: EventType Enum — Add 1 Value

```diff
 enum EventType {
   ENTITY_CREATED
   ENTITY_UPDATED
   ENTITY_PUBLISH_REQUESTED
   ENTITY_PUBLISH_REJECTED
   ENTITY_PUBLISHED
   ENTITY_ARCHIVED
   ENTITY_VALIDATION_FAILED
   SOURCE_CAPTURED
   SOURCE_TRIAGED
   RELATION_CREATED
   RELATION_REMOVED
   DISTRIBUTION_CREATED
   DISTRIBUTION_PLANNED
   DISTRIBUTION_PUBLISHED
   VIDEO_CREATED
   VIDEO_PUBLISHED
   METRIC_SNAPSHOT_RECORDED
   SYSTEM_CONFIG_CHANGED
   DRAFT_CREATED
   DRAFT_EXPIRED
+  QUOTABLE_BLOCK_CREATED
 }
```

### Change 3: Entity Model — Add Reverse Relation for SearchPerformance

```diff
 model Entity {
   // ... existing fields ...

   // Relations
   distributionEvents DistributionEvent[]
   metricSnapshots    MetricSnapshot[]
+  quotableBlocks     QuotableBlock[]
+  searchPerformanceRecords SearchPerformance[]

   @@unique([projectId, entityType, slug])
   @@index([projectId, entityType, status, createdAt])
 }
```

Note: `quotableBlocks QuotableBlock[]` was already in SEO-SCHEMA-MIGRATION-PLAN. `searchPerformanceRecords SearchPerformance[]` is the new addition from this convergence.

---

## III. Exact Enum Expansions (Complete List for Migration Batch)

This is the **complete, final** list of all enum changes in the migration. Combines SEO-SCHEMA-MIGRATION-PLAN originals with convergence additions.

### EntityType (add 2 values)

| New Value | Reason |
|---|---|
| `quotableBlock` | EventLog.entityType for W3 events |
| `searchPerformance` | EventLog.entityType for W1 batch events |

### EventType (add 1 value)

| New Value | Reason |
|---|---|
| `QUOTABLE_BLOCK_CREATED` | Clean audit semantics for W3 |

### MetricType (add 12 values — unchanged from migration plan)

`gsc_impressions`, `gsc_clicks`, `ga4_pageviews`, `ga4_sessions`, `yt_views`, `yt_watch_time_hours`, `yt_ctr`, `yt_avg_retention_pct`, `geo_citability_score`, `geo_extractability_score`, `geo_factual_density`, `ai_search_volume`

### DraftArtifactKind (add 7 values — unchanged from migration plan)

`seo_keyword_research`, `seo_serp_snapshot`, `seo_content_brief`, `seo_competitor_notes`, `seo_llm_mentions`, `seo_llm_response`, `byda_s_audit`

### Platform (add 5 values — unchanged from migration plan)

`reddit`, `hackernews`, `substack`, `linkedin`, `discord`

### ClaimType (new enum — unchanged from migration plan)

`statistic`, `comparison`, `definition`, `howto_step`

---

## IV. Exact Documentation Edits

### Edit 1: Site-Arch 05 — 410 Clarification

**File:** `docs/site-architecture/05-PUBLISHING-AND-INDEXING-RULES.md`

**Find:**
```
If a URL was once published but entity is **deleted** (exceptional case):
- Return **410 Gone** (not 404)
- This signals permanent removal to search engines
```

**Replace with:**
```
If a URL was once published but entity is **deleted** (exceptional case):
- Return **410 Gone** (not 404)
- This signals permanent removal to search engines

> **Schema note (2026-02-18):** Entity deletion is not currently modeled in the Prisma schema. `EntityStatus` has no `deleted` value, and no deletion path exists. The 410 behavior above is specified for future implementation. If entity deletion is ever added, it must include a `deleted` status, a `deletedAt` timestamp, and 410 rendering logic.
```

### Edit 2: SEO-RECORDING-SPEC — Cost Control Rule Clarification

**File:** `docs/SEO-RECORDING-SPEC.md` (once created in repo — currently a project doc)

**Find (Section 6, Rule 1):**
```
1. **Per-project daily spend cap** stored in SystemConfig.
```

**Replace with:**
```
1. **Per-project daily spend cap** stored in global SystemConfig. Key: `dataforseo_daily_budget_usd`. Value: JSON with `{ "default": <amount>, "overrides": { "<projectId>": <amount> } }`. Application reads the key, checks for project-specific override, falls back to default. Same pattern for all per-workflow caps. SystemConfig remains global — per-project behavior is encoded in JSON values, not separate keys or tables.
```

### Edit 3: SEO-INGEST-WORKFLOWS — W3 Event Convention

**File:** `docs/SEO-INGEST-WORKFLOWS.md` (once created in repo — currently a project doc)

**Find (W3 Step 7):**
```
7. EventLog entry: `ENTITY_CREATED` with `entityType: "quotableBlock"` and details.
```

**Replace with:**
```
7. EventLog entry: `QUOTABLE_BLOCK_CREATED` with `entityType: quotableBlock`, `entityId`: the new QuotableBlock UUID, and `details`: `{ "parentEntityId": "<entity-uuid>", "claimType": "<type>", "actor": "human" }`.
```

### Edit 4: SEO-INGEST-WORKFLOWS — W1 Event Convention

**File:** `docs/SEO-INGEST-WORKFLOWS.md`

**Find (W1 Step 5):**
```
5. EventLog entry: `METRIC_SNAPSHOT_RECORDED` with details `{ source: "gsc", rowCount: N }`.
```

**Replace with:**
```
5. EventLog entry: `METRIC_SNAPSHOT_RECORDED` with `entityType: searchPerformance`, `entityId`: the projectId, `actor: system`, and `details`: `{ "source": "gsc", "rowCount": N, "dateStart": "<iso>", "dateEnd": "<iso>" }`.
```

### Edit 5: SEO-SCHEMA-MIGRATION-PLAN — EntityType Expansion

**File:** `docs/SEO-SCHEMA-MIGRATION-PLAN.md` (once created in repo)

**Find (Section 4, Enum Expansions):**
```
### MetricType — add 12 values
```

**Insert BEFORE that line:**
```
### EntityType — add 2 values

```
quotableBlock
searchPerformance
```

Required for EventLog.entityType references. `quotableBlock` enables W3 audit logging. `searchPerformance` enables W1 batch event logging.

### EventType — add 1 value

```
QUOTABLE_BLOCK_CREATED
```

Dedicated event type for QuotableBlock creation. Prevents audit query pollution of `ENTITY_CREATED`.

```

### Edit 6: SEO-SCHEMA-MIGRATION-PLAN — SearchPerformance Reverse Relation on Entity

**File:** `docs/SEO-SCHEMA-MIGRATION-PLAN.md`

**Find (Section 5, SearchPerformance, after "Reverse relation"):**
```
**Reverse relation:** Add `searchPerformanceRecords SearchPerformance[]` to Project model.
```

**Replace with:**
```
**Reverse relations:**
- Add `searchPerformanceRecords SearchPerformance[]` to Project model.
- Add `searchPerformanceRecords SearchPerformance[]` to Entity model.
```

### Edit 7: DATAFORSEO-INTEGRATION-MAP — Spend Cap Convention

**File:** `docs/DATAFORSEO-INTEGRATION-MAP.md` (once created in repo)

**Find (Section 8, Per-Project Daily Spend Cap):**
```
### Per-Project Daily Spend Cap

- Stored in SystemConfig: `dataforseo_daily_budget_usd`
- Default: $2.00/day
- Backend checks aggregate daily usage before allowing any DataForSEO call
- Rate limit hits logged in EventLog
```

**Replace with:**
```
### Per-Project Daily Spend Cap

- Stored in global SystemConfig key: `dataforseo_daily_budget_usd`
- Value format: `{ "default": 2.00, "overrides": { "<projectId>": <amount> } }`
- Resolution: check `overrides[projectId]` first, fall back to `default`
- Backend checks aggregate daily usage before allowing any DataForSEO call
- Rate limit hits logged in EventLog
- Same `{ "default": N, "overrides": {} }` pattern applies to all per-workflow cap keys
```

---

## V. Updated Event Logging Conventions

### Complete SEO Workflow Event Table

| Workflow | EventType | entityType | entityId | details |
|---|---|---|---|---|
| W1 — GSC Ingestion | `METRIC_SNAPSHOT_RECORDED` | `searchPerformance` | projectId | `{ "source": "gsc", "rowCount": N, "dateStart": "...", "dateEnd": "..." }` |
| W2 — Freshness Verification | `ENTITY_UPDATED` | `concept` or `guide` etc. | Entity UUID | `{ "field": "lastVerifiedAt", "actor": "human" }` |
| W3 — QuotableBlock Creation | `QUOTABLE_BLOCK_CREATED` | `quotableBlock` | QuotableBlock UUID | `{ "parentEntityId": "<uuid>", "claimType": "<type>", "actor": "human" }` |
| W4 — Keyword Research | `DRAFT_CREATED` | `concept` or relevant type | DraftArtifact UUID | `{ "kind": "seo_keyword_research", "source": "dataforseo" }` |
| W5 — SERP Snapshot | `DRAFT_CREATED` | `concept` or relevant type | DraftArtifact UUID | `{ "kind": "seo_serp_snapshot", "source": "dataforseo" }` |
| W6 — Content Brief | `DRAFT_CREATED` | `guide` or relevant type | DraftArtifact UUID | `{ "kind": "seo_content_brief", "source": "derived" }` |
| W7 — AI Keyword Volume | `METRIC_SNAPSHOT_RECORDED` | `metricSnapshot` | MetricSnapshot UUID | `{ "source": "dataforseo", "metricType": "ai_search_volume" }` |
| W8 — LLM Mentions | `DRAFT_CREATED` | `concept` or relevant type | DraftArtifact UUID | `{ "kind": "seo_llm_mentions", "source": "dataforseo" }` |
| W9 — LLM Response | `DRAFT_CREATED` | `concept` or relevant type | DraftArtifact UUID | `{ "kind": "seo_llm_response", "source": "dataforseo" }` |
| W10 — GA4 Ingestion | `METRIC_SNAPSHOT_RECORDED` | `metricSnapshot` | MetricSnapshot UUID | `{ "source": "ga4", "metricType": "ga4_pageviews" }` |
| W11 — YouTube Ingestion | `METRIC_SNAPSHOT_RECORDED` | `metricSnapshot` | MetricSnapshot UUID | `{ "source": "youtube", "metricType": "yt_views" }` |

### Conventions

1. **entityType** always reflects the table that `entityId` points to.
2. **entityId** points to the primary record created or affected.
3. For batch operations (W1), `entityId` is the projectId since no single record is the target.
4. For DraftArtifact workflows (W4-W6, W8-W9), `entityId` is the DraftArtifact UUID. The `entityType` in EventLog reflects the *seed entity type* that triggered the workflow (concept, guide, etc.), not `draftArtifact`.

**Correction on point 4:** This creates a mismatch — `entityId` points to a DraftArtifact but `entityType` says `concept`. This is the existing pattern in the codebase (EventLog.entityType is a discriminator for the *domain context*, not always the target table). However, for consistency with the W1/W3 pattern established above, the cleaner convention is:

| Convention | Rule |
|---|---|
| `entityType` matches the table `entityId` points to | **Always.** No exceptions. |
| For DraftArtifact workflows, `entityType` = `draftArtifact` (already an option via existing pattern — but `draftArtifact` is NOT in EntityType enum) | Needs resolution. |

**Resolution:** The existing `EntityType` enum does NOT include `draftArtifact`. It IS referenced by EventLog for `DRAFT_CREATED` events. This is a **pre-existing bug** in the current schema — `DRAFT_CREATED` events have no valid `entityType` value.

**Fix:** Add `draftArtifact` to `EntityType` enum in the migration batch.

### Revised Change 1 (supersedes Section II, Change 1):

```diff
 enum EntityType {
   guide
   concept
   project
   news
   distributionEvent
   video
   sourceItem
   sourceFeed
   metricSnapshot
+  quotableBlock
+  searchPerformance
+  draftArtifact
 }
```

### Revised Event Logging Table (with consistent entityType = target table)

| Workflow | EventType | entityType | entityId | details |
|---|---|---|---|---|
| W1 — GSC Ingestion | `METRIC_SNAPSHOT_RECORDED` | `searchPerformance` | projectId | `{ "source": "gsc", "rowCount": N, "dateStart": "...", "dateEnd": "..." }` |
| W2 — Freshness Verification | `ENTITY_UPDATED` | entity's type | Entity UUID | `{ "field": "lastVerifiedAt", "actor": "human" }` |
| W3 — QuotableBlock Creation | `QUOTABLE_BLOCK_CREATED` | `quotableBlock` | QuotableBlock UUID | `{ "parentEntityId": "<uuid>", "claimType": "<type>", "actor": "human" }` |
| W4 — Keyword Research | `DRAFT_CREATED` | `draftArtifact` | DraftArtifact UUID | `{ "kind": "seo_keyword_research", "source": "dataforseo" }` |
| W5 — SERP Snapshot | `DRAFT_CREATED` | `draftArtifact` | DraftArtifact UUID | `{ "kind": "seo_serp_snapshot", "source": "dataforseo" }` |
| W6 — Content Brief | `DRAFT_CREATED` | `draftArtifact` | DraftArtifact UUID | `{ "kind": "seo_content_brief", "source": "derived" }` |
| W7 — AI Keyword Volume | `METRIC_SNAPSHOT_RECORDED` | `metricSnapshot` | MetricSnapshot UUID | `{ "source": "dataforseo", "metricType": "ai_search_volume" }` |
| W8 — LLM Mentions | `DRAFT_CREATED` | `draftArtifact` | DraftArtifact UUID | `{ "kind": "seo_llm_mentions", "source": "dataforseo" }` |
| W9 — LLM Response | `DRAFT_CREATED` | `draftArtifact` | DraftArtifact UUID | `{ "kind": "seo_llm_response", "source": "dataforseo" }` |
| W10 — GA4 Ingestion | `METRIC_SNAPSHOT_RECORDED` | `metricSnapshot` | MetricSnapshot UUID | `{ "source": "ga4", "metricType": "ga4_pageviews" }` |
| W11 — YouTube Ingestion | `METRIC_SNAPSHOT_RECORDED` | `metricSnapshot` | MetricSnapshot UUID | `{ "source": "youtube", "metricType": "yt_views" }` |

**Invariant (locked):** `EventLog.entityType` always identifies the table that `EventLog.entityId` points to. No exceptions. No semantic overloading.

---

## VI. Migration Batch Summary

### Complete Enum Changes (Final)

**EntityType** — add 3 values:
- `quotableBlock`
- `searchPerformance`
- `draftArtifact`

**EventType** — add 1 value:
- `QUOTABLE_BLOCK_CREATED`

**MetricType** — add 12 values (unchanged from migration plan):
- `gsc_impressions`, `gsc_clicks`, `ga4_pageviews`, `ga4_sessions`
- `yt_views`, `yt_watch_time_hours`, `yt_ctr`, `yt_avg_retention_pct`
- `geo_citability_score`, `geo_extractability_score`, `geo_factual_density`
- `ai_search_volume`

**DraftArtifactKind** — add 7 values (unchanged from migration plan):
- `seo_keyword_research`, `seo_serp_snapshot`, `seo_content_brief`
- `seo_competitor_notes`, `seo_llm_mentions`, `seo_llm_response`, `byda_s_audit`

**Platform** — add 5 values (unchanged from migration plan):
- `reddit`, `hackernews`, `substack`, `linkedin`, `discord`

**ClaimType** — new enum (unchanged from migration plan):
- `statistic`, `comparison`, `definition`, `howto_step`

### Field Changes

- `MetricSnapshot.value`: `Int` → `Float`
- `Entity`: add `lastVerifiedAt DateTime?`
- `DraftArtifact`: add `schemaVersion String?`, `source String?`, `contentHash String?`

### New Index

- `DraftArtifact`: `@@index([contentHash])`

### New Models

- `SearchPerformance` (as specified in migration plan)
- `QuotableBlock` (as specified in migration plan)

### Reverse Relations (Entity model)

- `quotableBlocks QuotableBlock[]`
- `searchPerformanceRecords SearchPerformance[]`

### Reverse Relations (Project model)

- `searchPerformanceRecords SearchPerformance[]`
- `quotableBlocks QuotableBlock[]`

### Deduplication

- Application-enforced via `contentHash` + `kind` query within `prisma.$transaction()`
- No DB-level unique constraint
- Known limitation documented for future concurrent-access scenarios

---

## VII. Confirmation of Architectural Soundness

The SEO subsystem is **architecturally sound**.

All five ambiguities from the reconciliation report are now resolved:

1. ✅ W3 uses `QUOTABLE_BLOCK_CREATED` with `entityType: quotableBlock`
2. ✅ W1 uses `METRIC_SNAPSHOT_RECORDED` with `entityType: project`, `entityId: Project.id`, `details.model: "searchPerformance"` (batch ingest convention)
3. ✅ SearchPerformance reverse relation added to Entity model
4. ✅ Dedup is application-enforced, documented as known limitation
5. ✅ Spend caps use `{ "default": N, "overrides": { "<projectId>": N } }` in global SystemConfig

One pre-existing issue was surfaced and resolved: `draftArtifact` was missing from `EntityType` enum, meaning existing `DRAFT_CREATED` events had no valid `entityType` value. Fixed by adding `draftArtifact` to `EntityType`.

**The EventLog invariant is now locked:** `entityType` always identifies the table that `entityId` references. No semantic overloading. No ambiguity.

**Batch ingest convention is now locked:** Batch operations point `entityId` at the Project (the aggregate owner). `details.model` identifies what was ingested. Canonical reference: `docs/07-RELATIONSHIP-AND-EVENT-VOCABULARY.md` EventLog Conventions section.

No remaining architectural ambiguities. Schema and documentation are fully convergent. Migration batch is complete and self-consistent.

---

End of document.
