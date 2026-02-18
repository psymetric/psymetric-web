# PsyMetric — SEO Recording Specification

**Version:** 1.0
**Status:** Phase 0-SEO

---

## 1. Purpose

Defines how SEO-related data is recorded while preserving:
- Project isolation
- Deterministic writes
- Strict event logging
- No automation without approval

All writes:
- Must include `projectId`
- Must run inside `prisma.$transaction()`
- Must emit EventLog entries in the same transaction

---

## 2. Data Classification

### Canonical Models
- Entity
- EntityRelation
- MetricSnapshot
- SearchPerformance
- QuotableBlock

### Research / Intermediate
- DraftArtifact

DataForSEO never writes directly to canonical Entity content.

---

## 3. EventLog Polymorphism Contract

`EventLog.entityType` identifies the table referenced by `entityId`.

Mappings:

- DraftArtifact events (`DRAFT_CREATED`, `DRAFT_EXPIRED`)
  - entityType: `draftArtifact`
  - entityId: DraftArtifact.id

- QuotableBlock creation
  - eventType: `QUOTABLE_BLOCK_CREATED`
  - entityType: `quotableBlock`
  - entityId: QuotableBlock.id

- SearchPerformance ingestion summary
  - entityType: `project`
  - entityId: Project.id
  - details.model = "searchPerformance"

No cross-table ambiguity permitted.

---

## 4. DraftArtifact Requirements

Required for DataForSEO artifacts:
- kind (enum)
- schemaVersion
- source
- contentHash
- expiresAt
- projectId

**Important:** `DraftArtifact.content` stores JSON as a STRING payload. Contract enforcement is handled via `schemaVersion` and `source`. Prisma `Json` type is intentionally not used.

Deduplication rule:
- Unique on `(projectId, contentHash, kind)`

---

## 5. Spend Control (SystemConfig)

SystemConfig is global. Per-project overrides use JSON.

Key: `dataforseo_daily_budget_usd`

Format:

```
{
  "default": 2.00,
  "overrides": {
    "<projectId>": 1.50
  }
}
```

Spend checks occur before external API calls.

---

## 6. Validation Rules

- projectId must match referenced entity
- All foreign keys must belong to same project
- ctr between 0 and 1
- clicks <= impressions
- value in MetricSnapshot is Float

---

End of document.
