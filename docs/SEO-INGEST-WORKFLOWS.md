# PsyMetric — SEO Ingest Workflows

**Version:** 1.0
**Status:** Phase 0-SEO (parallel track within Phase 0)
**Depends on:** SEO-RECORDING-SPEC.md schema migration complete, DATAFORSEO-INTEGRATION-MAP.md approved
**Related:** `docs/SEO-RECORDING-SPEC.md`, `docs/DATAFORSEO-INTEGRATION-MAP.md`, `docs/ROADMAP.md`

---

## 1. Purpose

This document defines **how SEO data enters PsyMetric**, step by step. Each workflow specifies the trigger, data source, validation, storage target, and operator actions.

No workflow may store data without `projectId`. No workflow may mutate canonical entities without human approval.

---

## 2. Workflow Index

| ID | Workflow | Source | Storage Target | Phase |
|----|----------|--------|----------------|-------|
| W1 | GSC Opportunity Query Ingestion | GSC API | SearchPerformance | 0-SEO |
| W2 | Content Freshness Verification | Manual | Entity.lastVerifiedAt | 0-SEO |
| W3 | QuotableBlock Creation | Manual / LLM-draft | QuotableBlock | 0-SEO |
| W4 | Keyword Research | DataForSEO Keywords Data API | DraftArtifact | 0-SEO |
| W5 | SERP Snapshot | DataForSEO SERP API | DraftArtifact | 0-SEO |
| W6 | Content Brief Generation | Derived (W4 + W5 + Entity graph) | DraftArtifact | 0-SEO |
| W7 | AI Keyword Search Volume | DataForSEO AI Optimization API | MetricSnapshot | 0-SEO |
| W8 | LLM Mentions Check | DataForSEO AI Optimization API | DraftArtifact | 1-SEO |
| W9 | LLM Response Capture | DataForSEO AI Optimization API | DraftArtifact | 1-SEO |
| W10 | GA4 Metric Ingestion | GA4 API | MetricSnapshot | 1-SEO |
| W11 | YouTube Metric Ingestion | YouTube Studio / API | MetricSnapshot | 1-SEO |

---

## 3. Phase 0-SEO Workflows (Implement Now)

### W1 — GSC Opportunity Query Ingestion

**Trigger:** Manual (operator requests pull). Scheduled ingestion is deferred until signal density thresholds are met and a roadmap amendment explicitly enables automation.

**Source:** Google Search Console API — search analytics endpoint.

**Parameters:**
- projectId (required)
- dateStart, dateEnd (default: last 28 days)
- filters: impressions > threshold (default 10), CTR < threshold (default 0.05)
- dimensions: query, page

**Steps:**
1. Operator initiates GSC pull for a project.
2. Backend calls GSC API with OAuth credentials.
3. For each query×page result:
   a. Attempt to match `pageUrl` to an Entity via `canonicalUrl` field. Set `entityId` if matched.
   b. Validate `projectId` matches.
   c. Check composite uniqueness `(projectId, query, pageUrl, dateStart, dateEnd)`.
   d. If duplicate exists, update values. If new, insert.
4. All inserts/updates occur inside single `prisma.$transaction()`.

**Event Logging Convention (W1):**
SearchPerformance ingestion is logged as a **project-scoped summary event** to avoid per-row audit spam.

- `eventType`: `METRIC_SNAPSHOT_RECORDED`
- `entityType`: `project`
- `entityId`: `<projectId>`
- `details`:
  ```json
  {
    "model": "searchPerformance",
    "source": "gsc",
    "dateStart": "<ISO8601>",
    "dateEnd": "<ISO8601>",
    "rowCount": 123,
    "inserted": 100,
    "updated": 23
  }
  ```

**Validation:**
- `projectId` must exist
- `ctr` must be between 0.0 and 1.0
- `avgPosition` must be > 0
- `impressions` and `clicks` must be >= 0
- `clicks` must be <= `impressions`

**Output:** SearchPerformance rows. No DraftArtifact. This is canonical performance data.

**Error handling:** If GSC API returns error or rate limit, log in EventLog and surface to operator. No silent retry.

---

### W2 — Content Freshness Verification

**Trigger:** Manual. Operator marks content as verified after reviewing it.

**Source:** Human judgment.

**Steps:**
1. Operator selects an Entity in the VS Code extension (or via API).
2. Operator confirms: "I have verified this content is still accurate."
3. Backend sets `Entity.lastVerifiedAt = now()` inside `prisma.$transaction()`.
4. EventLog entry: `ENTITY_UPDATED` with details `{ field: "lastVerifiedAt", actor: "human" }`.

**No automation.** There is no scheduled verification. There is no LLM-based verification. The human is the authority on content accuracy.

**Refresh queue derivation:** A separate read query can surface entities where:
- `lastVerifiedAt` is null (never verified)
- `lastVerifiedAt` < 90 days ago (configurable threshold in SystemConfig)
- Entity has declining SearchPerformance impressions

This is a read-only view, not a workflow. It produces a list for operator review.

---

### W3 — QuotableBlock Creation

**Trigger:** Manual authoring or LLM-drafted with human approval.

**Source:** Human writes the block, or LLM generates candidate blocks from Entity content.

**Steps (manual):**
1. Operator selects an Entity.
2. Operator writes a self-contained statement (25–50 words).
3. Operator selects `claimType` (statistic | comparison | definition | howto_step).
4. Optionally sets `sourceCitation` and `verifiedUntil`.
5. Backend validates:
   a. `projectId` matches Entity's projectId.
   b. `claimType` is a valid enum value.
   c. `text` length is within bounds.
6. Insert inside `prisma.$transaction()`.

**Event Logging Convention (W3):**
QuotableBlock creation uses a dedicated EventType.

- `eventType`: `QUOTABLE_BLOCK_CREATED`
- `entityType`: `quotableBlock`
- `entityId`: `<QuotableBlock.id>`
- `details` (example):
  ```json
  {
    "parentEntityId": "<Entity.id>",
    "claimType": "definition",
    "verifiedUntil": "<ISO8601|null>"
  }
  ```

**Steps (LLM-assisted — Phase 3+ only):**
1. Operator requests LLM to generate candidate quotable blocks from Entity content.
2. LLM returns candidates as DraftArtifact (NOT directly as QuotableBlock records).
3. Operator reviews each candidate.
4. Operator approves individual blocks → backend creates QuotableBlock records.
5. Rejected candidates remain in DraftArtifact as record.

**Critical rule:** LLM never writes directly to QuotableBlock table. All LLM output goes through DraftArtifact → human approval → canonical write.

---

### W4 — Keyword Research (DataForSEO)

**Trigger:** Operator selects a topic/entity and requests keyword research.

**Source:** DataForSEO Keywords Data API and/or Labs API.

**Steps:**
1. Operator provides seed keyword(s) and selects projectId.
2. Backend checks rate limit: `dataforseo_keyword_daily_cap` in SystemConfig.
3. Backend checks daily spend: `dataforseo_daily_budget_usd` in SystemConfig.
4. Backend displays estimated cost to operator. Operator confirms.
5. Backend calls DataForSEO API (server-side only).
6. Backend computes `contentHash` = SHA256(`{provider: "dataforseo", endpoint: "keywords", query: seedKeywords, location, language, date}`).
7. Backend checks for existing DraftArtifact with same `contentHash` and `kind` within expiration window. If found, return existing artifact.
8. If no duplicate, create DraftArtifact:
   - `kind`: `seo_keyword_research`
   - `schemaVersion`: `seo.keyword_research.v1`
   - `source`: `dataforseo`
   - `contentHash`: computed above
   - `content`: JSON string payload (structured)
   - `entityId`: the seed entity (if applicable)
   - `projectId`: required
   - `expiresAt`: now + 30 days
   - `createdBy`: `system`
9. EventLog entry: `DRAFT_CREATED` with details `{ kind: "seo_keyword_research", source: "dataforseo" }`.

**Operator follow-up actions (all manual, all approval-gated):**
- Create new Concept entities for high-signal keywords
- Add EntityRelation links between concepts
- Tag existing entities with target queries

None of these happen automatically.

---

### W5 — SERP Snapshot (DataForSEO)

**Trigger:** Operator selects target queries (typically from W4 output) and requests SERP analysis.

**Source:** DataForSEO SERP API.

**Steps:**
1. Operator provides 1–3 queries. Backend enforces max 3 per topic per day.
2. Rate limit and spend checks (same as W4).
3. Estimated cost displayed. Operator confirms.
4. Backend calls DataForSEO SERP API.
5. Compute `contentHash`. Deduplicate against existing artifacts.
6. Create DraftArtifact:
   - `kind`: `seo_serp_snapshot`
   - `schemaVersion`: `seo.serp_snapshot.v1`
   - `source`: `dataforseo`
   - `contentHash`: computed
   - `content`: JSON string payload (structured) including:
     - Top 10–20 organic results (URL, title, snippet)
     - SERP features detected (featured snippet, PAA, video carousel, AI overview, etc.)
     - Dominant content type analysis
   - `expiresAt`: now + 14 days
7. EventLog entry: `DRAFT_CREATED`.

**No automated actions.** SERP data is reference material for the operator.

---

### W6 — Content Brief Generation

**Trigger:** Operator requests a brief for a specific entity, using data from W4 + W5.

**Source:** Derived from keyword research artifact + SERP snapshot artifact + Entity graph.

**Steps:**
1. Operator selects an Entity and references existing keyword research and SERP artifacts.
2. Backend (or LLM in Phase 3+) generates a content brief including:
   - Suggested title angles (informed by SERP snapshot)
   - Recommended H2 structure (informed by competitor analysis)
   - Internal link suggestions (queried from EntityRelation graph)
   - Quotable blocks to include (queried from QuotableBlock table)
   - Target word count (informed by SERP competitor word counts)
   - SERP feature targets (if PAA/snippet detected)
3. Store as DraftArtifact:
   - `kind`: `seo_content_brief`
   - `schemaVersion`: `seo.content_brief.v1`
   - `source`: `derived` (or `llm` in Phase 3+)
   - `content`: JSON string payload (structured)
   - `expiresAt`: now + 7 days
4. EventLog entry: `DRAFT_CREATED`.

**Staleness rule:** If the underlying Entity or its relationships change after the brief is generated, the brief is stale. In Phase 2+, the VS Code extension should show a staleness indicator based on Entity.updatedAt vs brief.createdAt. For now, the 7-day expiration is the safety net.

---

### W7 — AI Keyword Search Volume (DataForSEO)

**Trigger:** Operator requests AI search volume for a set of Concept entities.

**Source:** DataForSEO AI Optimization API — AI Keyword Search Volume endpoint.

**Steps:**
1. Operator selects Concept entities (or provides keyword list).
2. Rate limit and spend checks.
3. Backend calls AI Keyword Search Volume endpoint.
4. For each keyword that maps to a Concept entity:
   a. Create MetricSnapshot:
      - `metricType`: `ai_search_volume`
      - `value`: AI search volume (Float)
      - `platform`: `other`
      - `entityType`: `concept`
      - `entityId`: matched Concept entity
      - `projectId`: required
   b. Monthly trend data stored as separate MetricSnapshot entries per month, or as a DraftArtifact if you want the full 12-month array.
5. EventLog entry: `METRIC_SNAPSHOT_RECORDED`.

**Decision enabled:** Compare AI search volume vs Google search volume for the same concepts. Identify topics where AI demand is growing faster than Google demand.

---

## 4. Phase 1-SEO Workflows (Gated by Signal Density)

**Activation rule:** These workflows may not be activated unless at least one of the following is true:
- ≥ 50 indexed content entities in the project
- ≥ 10,000 monthly impressions in GSC
- Demonstrable query-level cannibalization
- Sustained technical issues affecting indexed pages

Until activation, manual ad-hoc use of DraftArtifact for research is permitted. Scheduled or automated ingestion is not.

(Workflows W8–W11 unchanged from prior draft.)

---

## 5. Validation Rules (All Workflows)

### Universal Requirements

| Rule | Enforcement |
|------|-------------|
| `projectId` present on every record | Backend validation before write |
| `capturedAt` or `createdAt` present | Prisma default or explicit set |
| `entityId` belongs to same project | Backend validates before write |
| All writes inside `prisma.$transaction()` | Backend code pattern |
| EventLog entry per mutation | Same transaction |
| Rate limits checked before external API call | Backend reads SystemConfig |
| Daily spend checked before external API call | Backend reads SystemConfig |

### DraftArtifact-Specific

| Rule | Enforcement |
|------|-------------|
| `kind` must be valid enum value | Prisma validation |
| `schemaVersion` must be set for DataForSEO artifacts | Backend validation |
| `source` must be set for DataForSEO artifacts | Backend validation |
| `contentHash` must be set for DataForSEO artifacts | Backend validation |
| `expiresAt` must be set | Backend validation with per-kind defaults |
| Deduplication checked before API call | Backend queries by `contentHash` + `kind` |

### MetricSnapshot-Specific

| Rule | Enforcement |
|------|-------------|
| `metricType` must be valid enum value | Prisma validation |
| `value` is Float | Schema type |
| `entityId` + `entityType` must match an existing entity | Backend validation |
| No multi-dimensional data in single record | Schema design (one value per row) |

### SearchPerformance-Specific

| Rule | Enforcement |
|------|-------------|
| Composite unique: `(projectId, query, pageUrl, dateStart, dateEnd)` | Database constraint |
| `ctr` between 0.0 and 1.0 | Backend validation |
| `avgPosition` > 0 | Backend validation |
| `clicks` <= `impressions` | Backend validation |

---

End of document.
