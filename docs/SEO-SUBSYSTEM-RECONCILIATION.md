# PsyMetric — SEO Subsystem Reconciliation Report

**Date:** 2026-02-18
**Status:** Authoritative reconciliation — schema vs site-architecture vs SEO subsystem docs
**Schema Source:** `prisma/schema.prisma` (ground truth)

---

## I. Alignment Matrix

### 1. Concept Subtyping (model/comparison)

- **Schema:** `ConceptKind` enum with `standard`, `model`, `comparison` — ✅ present
- **Site-Arch (03):** Describes Model and Comparison as subtypes of Concept — ✅ aligned
- **SEO Docs:** Not referenced (correct — this is site-arch scope)
- **Alignment Status:** Aligned
- **Severity:** N/A
- **Required Action:** None

### 2. comparisonTargets Storage

- **Schema:** `comparisonTargets String[] @db.Uuid @default([])` on Entity — ✅ present
- **Site-Arch (03):** Documents `comparisonTargets: [conceptIdA, conceptIdB]` as authoritative for render order — ✅ aligned
- **SEO Docs:** Not referenced (correct)
- **Alignment Status:** Aligned
- **Severity:** N/A
- **Required Action:** None

### 3. Archived Lifecycle

- **Schema:** `EntityStatus` has `archived`, Entity has `archivedAt DateTime?` — ✅ present
- **Site-Arch (05):** Archived content returns 200, stays at canonical URL, excluded from sitemaps, shows banner — ✅ aligned with schema capabilities
- **SEO Docs:** Not referenced (correct — lifecycle is site-arch scope)
- **Alignment Status:** Aligned
- **Severity:** N/A
- **Required Action:** None

### 4. 404 vs 410 Logic

- **Schema:** No explicit deletion mechanism (no `deletedAt` on Entity). `EntityStatus` has no `deleted` value.
- **Site-Arch (05):** Specifies 410 for "deleted (exceptional case)" — presumes a deletion path that doesn't exist in schema
- **SEO Docs:** Not referenced
- **Alignment Status:** Doc Drift (minor)
- **Severity:** Low
- **Required Action:** Documentation update. Site-Arch 05 should clarify that entity deletion is not currently modeled in schema. The 410 rule is aspirational — if deletion is ever added, this is the behavior. Add a note: "Entity deletion is not currently supported. If implemented, deleted entities must return 410."

### 5. Schema.org Derivation Strategy

- **Schema:** `entityType` (ContentEntityType), `conceptKind`, `status`, `publishedAt`, `updatedAt` — all present. Sufficient to derive Schema.org type.
- **Site-Arch (06):** Maps `Article` to Concepts/Models/Comparisons, `HowTo` to Guides, `Article`+optional `SoftwareSourceCode` to Projects — ✅ derivable from DB state
- **SEO Docs:** Not referenced (correct)
- **Alignment Status:** Aligned
- **Severity:** N/A
- **Required Action:** None

### 6. SearchPerformance Entity Linkage

- **Schema:** SearchPerformance model does NOT exist yet
- **SEO-RECORDING-SPEC:** Defines SearchPerformance with `entityId String? @db.Uuid` FK to Entity (nullable)
- **SEO-SCHEMA-MIGRATION-PLAN:** Specifies same — reverse relation `searchPerformanceRecords` on Project
- **Alignment Status:** Schema Gap (expected — migration not yet applied)
- **Severity:** N/A (pre-migration)
- **Required Action:** Schema change (the planned migration). No doc change needed.
- **Note:** Migration plan specifies reverse relation on Project only, not on Entity. SEO-RECORDING-SPEC implies entity linkage but does not specify a reverse relation on Entity. **Recommendation:** Add `searchPerformanceRecords SearchPerformance[]` to Entity model as well, since queries like "show all search performance for entity X" are a primary use case.

### 7. QuotableBlock Entity Linkage

- **Schema:** QuotableBlock model does NOT exist yet
- **SEO-RECORDING-SPEC:** Defines QuotableBlock with `entityId String @db.Uuid` FK to Entity (required, not nullable)
- **SEO-SCHEMA-MIGRATION-PLAN:** Specifies reverse relations on both Project and Entity — ✅ consistent
- **Alignment Status:** Schema Gap (expected — migration not yet applied)
- **Severity:** N/A (pre-migration)
- **Required Action:** Schema change (the planned migration)

### 8. EventLog Enum Coverage

- **Schema EventType:** Has `METRIC_SNAPSHOT_RECORDED`, `DRAFT_CREATED`, `DRAFT_EXPIRED`, `ENTITY_CREATED`, `ENTITY_UPDATED` — covers SEO workflow events
- **SEO-INGEST-WORKFLOWS:** References `METRIC_SNAPSHOT_RECORDED` (W1, W7, W10, W11), `DRAFT_CREATED` (W4-W9), `ENTITY_UPDATED` (W2), `ENTITY_CREATED` (W3)
- **Alignment Status:** Aligned
- **Severity:** N/A
- **Required Action:** None
- **Note:** W3 uses `ENTITY_CREATED` with `entityType: "quotableBlock"` — but `quotableBlock` is not a value in the `EntityType` enum. This needs resolution. See Real Structural Risks.

### 9. DraftArtifact content Type

- **Schema:** `content String` — plain String, not Json
- **SEO-RECORDING-SPEC:** Refers to "structured JSON" in DraftArtifact.content, `schemaVersion` for versioned contracts
- **SEO-INGEST-WORKFLOWS:** Stores structured JSON in DraftArtifact.content
- **DATAFORSEO-INTEGRATION-MAP:** Same
- **Alignment Status:** Design Tension
- **Severity:** Medium
- **Required Action:** None (acceptable). String type is correct — storing JSON as String is a deliberate choice allowing schema-agnostic storage. The `schemaVersion` field provides the contract layer. Parsing happens at read time. This is NOT sludge — it's intentional flexibility for non-canonical research artifacts. **Do not change to Json type.** The schemaVersion + source fields provide sufficient typing without coupling Prisma to JSON schema validation.

### 10. Deduplication Enforcement

- **Schema:** DraftArtifact has no `contentHash` field yet
- **SEO-SCHEMA-MIGRATION-PLAN:** Adds `contentHash String?` with `@@index([contentHash])`
- **SEO-INGEST-WORKFLOWS:** Dedup logic queries by `contentHash` + `kind` within expiration window
- **Alignment Status:** Schema Gap (expected — migration not yet applied)
- **Severity:** N/A (pre-migration)
- **Required Action:** Schema change (the planned migration)
- **Concurrency note:** See Real Structural Risks.

### 11. Per-Project Spend Caps vs SystemConfig

- **Schema:** SystemConfig is global (`key String @unique`, `value Json`), NOT project-scoped
- **SEO-RECORDING-SPEC (Rule 6.1):** "Per-project daily spend cap stored in SystemConfig"
- **DATAFORSEO-INTEGRATION-MAP (Section 8):** "Per-project daily spend cap" references `dataforseo_daily_budget_usd`
- **Alignment Status:** Design Tension
- **Severity:** Medium
- **Required Action:** Documentation update. SystemConfig is global by design (and documented as such in schema comments). Per-project spend caps require either: (a) a naming convention like `dataforseo_daily_budget_usd:{projectId}` with JSON value, or (b) a project-scoped config table. Option (a) works within current schema. SEO docs should specify the key-naming convention explicitly rather than implying SystemConfig is project-scoped.

### 12. MetricSnapshot.value Float Requirement

- **Schema:** `value Int` — currently Int
- **SEO-RECORDING-SPEC:** Requires Float for CTR, position, GEO scores, AI search volume
- **SEO-SCHEMA-MIGRATION-PLAN:** Specifies `Int → Float` change
- **Alignment Status:** Schema Gap (expected — migration not yet applied)
- **Severity:** N/A (pre-migration)
- **Required Action:** Schema change (the planned migration)

### 13. DraftArtifactKind Enum — Current vs Required

- **Schema:** `DraftArtifactKind` has only `x_reply`
- **SEO-SCHEMA-MIGRATION-PLAN:** Adds 7 values: `seo_keyword_research`, `seo_serp_snapshot`, `seo_content_brief`, `seo_competitor_notes`, `seo_llm_mentions`, `seo_llm_response`, `byda_s_audit`
- **Alignment Status:** Schema Gap (expected — migration not yet applied)
- **Required Action:** Schema change (the planned migration)

### 14. MetricType Enum — Current vs Required

- **Schema:** Has only X/Twitter metrics (5 values)
- **SEO-SCHEMA-MIGRATION-PLAN:** Adds 12 values for GSC, GA4, YouTube, GEO, AI search
- **Alignment Status:** Schema Gap (expected — migration not yet applied)
- **Required Action:** Schema change (the planned migration)

### 15. Platform Enum — Current vs Required

- **Schema:** `website`, `x`, `youtube`, `github`, `other`
- **SEO-SCHEMA-MIGRATION-PLAN:** Adds `reddit`, `hackernews`, `substack`, `linkedin`, `discord`
- **Alignment Status:** Schema Gap (expected — migration not yet applied)
- **Required Action:** Schema change (the planned migration)

### 16. Entity.lastVerifiedAt

- **Schema:** Not present
- **SEO-SCHEMA-MIGRATION-PLAN:** Adds `lastVerifiedAt DateTime?`
- **Alignment Status:** Schema Gap (expected — migration not yet applied)
- **Required Action:** Schema change (the planned migration)

### 17. DraftArtifact New Fields (schemaVersion, source, contentHash)

- **Schema:** Not present
- **SEO-SCHEMA-MIGRATION-PLAN:** Adds all three as nullable Strings
- **Alignment Status:** Schema Gap (expected — migration not yet applied)
- **Required Action:** Schema change (the planned migration)

---

## II. False Conflicts Identified

### FC-1: "DraftArtifact.content should be Json type"

**Prior concern:** DraftArtifact stores JSON but has String type.

**Verdict: False conflict.** String storage of JSON is deliberate. The `schemaVersion` field (incoming migration) provides contract enforcement. Prisma's `Json` type would add validation overhead with no benefit for non-canonical research artifacts. No change needed.

### FC-2: "SystemConfig cannot support per-project spend caps"

**Prior concern:** SystemConfig is global, so per-project caps are architecturally blocked.

**Verdict: False conflict.** SystemConfig stores `value Json`. A key like `dataforseo_daily_budget_usd` with value `{"default": 2.00, "project:{uuid}": 1.50}` works within the current schema. Alternatively, convention-based keys (`dataforseo_daily_budget_usd:project:{uuid}`) work. No schema change required — only a documentation clarification of the key-naming convention.

### FC-3: "SearchPerformance conflicts with MetricSnapshot"

**Prior concern:** Two models storing search data creates confusion.

**Verdict: False conflict.** The SEO-RECORDING-SPEC explicitly distinguishes these: MetricSnapshot = entity-scoped single numeric values. SearchPerformance = query×page multi-dimensional data from GSC. These are fundamentally different data shapes. No overlap. No sludge.

### FC-4: "QuotableBlock duplicates DraftArtifact"

**Prior concern:** Both store text content.

**Verdict: False conflict.** DraftArtifact is non-canonical (proposals, research). QuotableBlock is canonical (verified citation units). The SEO-INGEST-WORKFLOWS (W3) explicitly defines the flow: LLM output → DraftArtifact → human approval → QuotableBlock. They serve different lifecycle stages.

### FC-5: "Schema.org derivation requires new fields"

**Prior concern:** Schema.org types can't be derived without additional schema fields.

**Verdict: False conflict.** `entityType` + `conceptKind` fully determines Schema.org type. `status` + `publishedAt` + `updatedAt` provide all temporal fields. No additional schema fields needed for Schema.org derivation.

---

## III. Real Structural Risks

### R-1: EntityType Enum Does Not Include quotableBlock

**Risk:** SEO-INGEST-WORKFLOWS W3 specifies EventLog entry with `entityType: "quotableBlock"`, but `quotableBlock` is not in the `EntityType` enum.

**Impact:** EventLog insert will fail at runtime for W3.

**Severity:** High

**Resolution options:**
- (A) Add `quotableBlock` to `EntityType` enum — this is the correct fix since EventLog.entityType needs to reference any entity type that generates events.
- (B) Reuse an existing value — incorrect, would produce misleading audit data.

**Recommended:** Option A. Add `quotableBlock` to `EntityType` enum in the migration batch.

### R-2: SearchPerformance Has No Reverse Relation on Entity

**Risk:** SEO-SCHEMA-MIGRATION-PLAN adds reverse relation on Project but not Entity. Querying "all search performance for entity X" requires raw SQL or manual filtering.

**Impact:** Medium — query ergonomics, not correctness.

**Severity:** Medium

**Resolution:** Add `searchPerformanceRecords SearchPerformance[]` to Entity model in the migration. The FK already exists (`entityId`); only the Prisma reverse relation declaration is missing.

### R-3: Deduplication Race Condition

**Risk:** SEO-INGEST-WORKFLOWS dedup strategy is: query by `contentHash` + `kind` → if no match, insert. Under concurrent requests, two identical requests could both pass the check and both insert.

**Impact:** Low at current scale (manual triggers, solo operator). Becomes real if cron jobs or multi-user access is added.

**Severity:** Low (current), Medium (future)

**Resolution:** No schema change needed now. When concurrency becomes real, add a unique constraint on `(contentHash, kind)` with conflict handling, or use advisory locks. Document this as a known limitation.

### R-4: QuotableBlock Has No EntityType Enum Reference

**Risk:** QuotableBlock is stored in its own table, not in the Entity table. But EventLog references `entityType` for audit tracking. If QuotableBlock events use `entityType: quotableBlock`, the EventLog.entityId field will contain a QuotableBlock UUID, not an Entity UUID. This breaks the implicit contract that `entityId` in EventLog references the Entity table.

**Impact:** Audit query confusion — EventLog.entityId sometimes points to Entity, sometimes to QuotableBlock, sometimes to DraftArtifact, etc.

**Severity:** Medium

**Resolution:** This is an existing architectural pattern — EventLog.entityId is already polymorphic (it stores IDs from Entity, Video, DistributionEvent, SourceItem, SourceFeed, MetricSnapshot, DraftArtifact). The `entityType` discriminator resolves which table to join. Adding `quotableBlock` to `EntityType` enum maintains this pattern. No structural change needed beyond the enum addition in R-1.

### R-5: Spend Cap Enforcement Has No DB Constraint

**Risk:** Cost control for DataForSEO relies entirely on application-level checks reading SystemConfig before each API call. No DB-level enforcement exists.

**Impact:** If application code has a bug or is bypassed, spend caps are not enforced.

**Severity:** Low (solo operator with manual triggers). Medium (if automated workflows activate).

**Resolution:** Acceptable at current phase. Document that spend caps are application-enforced, not DB-enforced. Consider a `DataForSeoUsageLog` table in Phase 2+ if automation is added.

### R-6: Phase Gating Is Documentation-Only

**Risk:** Signal density thresholds (≥50 entities, ≥10K impressions) are documented rules but have no schema or application enforcement. A developer could implement W8-W11 without checking thresholds.

**Impact:** Premature automation activation.

**Severity:** Low (solo developer, discipline enforced by process).

**Resolution:** Acceptable at current phase. The documentation is the enforcement mechanism for a solo developer. If team size grows, add a `WorkflowActivation` table or SystemConfig flags.

### R-7: SEO-INGEST-WORKFLOWS W3 Event Uses Wrong Pattern

**Risk:** W3 (QuotableBlock creation) logs `ENTITY_CREATED` with `entityType: "quotableBlock"`. But QuotableBlock is not an Entity — it's a satellite of Entity. Using `ENTITY_CREATED` semantically implies a new content entity was created, which is misleading.

**Impact:** Audit trail confusion. `ENTITY_CREATED` events would include both real entity creations and QuotableBlock creations.

**Severity:** Medium

**Resolution options:**
- (A) Add a new EventType like `QUOTABLE_BLOCK_CREATED` — cleanest but expands enum.
- (B) Use a different existing event — none fit well.
- (C) Keep `ENTITY_CREATED` but distinguish via `entityType` discriminator — functionally works but semantically muddy.

**Recommended:** Option A if you want clean audit semantics. Option C if you want minimal enum expansion. Decision is yours — document whichever you choose.

---

## IV. Minimal Correction Plan

### A. Required Schema Changes (Add to Migration Batch)

1. **Add `quotableBlock` to `EntityType` enum** — required for EventLog support of W3.
2. **Add `searchPerformanceRecords SearchPerformance[]` reverse relation on Entity** — required for query ergonomics. (Already planned for Project; extend to Entity.)
3. All other migration changes from SEO-SCHEMA-MIGRATION-PLAN remain correct as specified.

### B. Required Documentation Changes

1. **Site-Arch 05 (Publishing & Indexing Rules):** Add note to 410 section: "Entity deletion is not currently modeled in schema. The 410 behavior is specified for future implementation. Currently, no entity deletion path exists."

2. **SEO-RECORDING-SPEC, Section 5 (No Sludge Rules):** Clarify Rule 6.1 — per-project spend caps use a key-naming convention within global SystemConfig (e.g., `dataforseo_daily_budget_usd` with JSON value `{"default": 2.00, "project:<uuid>": <amount>}`), not a project-scoped config table.

3. **SEO-INGEST-WORKFLOWS, W3:** Either:
   - Change EventType to a new `QUOTABLE_BLOCK_CREATED` (if adding to enum), or
   - Document that `ENTITY_CREATED` with `entityType: quotableBlock` is the pattern used.

4. **SEO-SCHEMA-MIGRATION-PLAN, Section 5 (SearchPerformance):** Add reverse relation to Entity model: `searchPerformanceRecords SearchPerformance[]`.

5. **SEO-SCHEMA-MIGRATION-PLAN:** Add `quotableBlock` to `EntityType` enum expansion (currently not listed).

### C. Optional Improvements

1. **Add `QUOTABLE_BLOCK_CREATED` to EventType enum** — cleaner audit semantics than overloading `ENTITY_CREATED`. Also consider `QUOTABLE_BLOCK_UPDATED` for completeness.

2. **Document the deduplication race condition** (R-3) as a known limitation in SEO-INGEST-WORKFLOWS with a note: "At current scale (manual triggers, solo operator), this is acceptable. When concurrent access is introduced, add unique constraint on `(contentHash, kind)` or use advisory locks."

3. **Consider `searchPerformance` as an EntityType value** — if you want EventLog entries for SearchPerformance batch ingestion to reference the model by type. Currently W1 uses `METRIC_SNAPSHOT_RECORDED` which works but the entityType field would need a valid value.

### D. Changes That Should NOT Be Made

1. **Do NOT change DraftArtifact.content from String to Json.** The String type with `schemaVersion` contract is intentional and correct.

2. **Do NOT add a project-scoped config table.** SystemConfig with key conventions is sufficient.

3. **Do NOT add a `deleted` status to EntityStatus.** Deletion is not currently modeled and adding it opens a large surface area (cascade behavior, orphan cleanup, 410 rendering) without current need.

4. **Do NOT normalize SERP feature observations into a dedicated model yet.** DraftArtifact storage is correct per phase gating rules.

5. **Do NOT add backlink models.** Explicitly deferred per signal density thresholds.

6. **Do NOT make `contentHash` a unique constraint yet.** The race condition (R-3) is theoretical at current scale. Adding a unique constraint now would require conflict-handling code that doesn't exist.

7. **Do NOT change SearchPerformance source of truth.** GSC is performance truth. DataForSEO is research. This separation is correct and must not be relaxed.

---

## V. Optional Improvements (Not Required for Integrity)

1. Add `QUOTABLE_BLOCK_CREATED` / `QUOTABLE_BLOCK_UPDATED` to EventType enum for cleaner audit trails.
2. Document key-naming convention for per-project SystemConfig values.
3. Add inline code comment to migration noting the dedup race condition as a known limitation.
4. Consider `searchPerformance` as EntityType value for EventLog consistency in W1.

---

## VI. Changes to Reject

| Proposed Change | Reason for Rejection |
|---|---|
| DraftArtifact.content → Json type | Violates intentional design. schemaVersion provides contract layer. |
| Project-scoped SystemConfig table | Over-engineering. Key conventions suffice. |
| `deleted` EntityStatus value | No current deletion path. Opens large surface area with no need. |
| SERP feature normalization model | Premature. Violates phase gating. |
| Backlink model | Premature. Below signal density threshold. |
| Unique constraint on contentHash | Premature. Requires conflict-handling code not yet built. |
| Automation of W8-W11 | Below signal density threshold. |

---

## VII. Final Convergence Summary

### Prioritized Actions

**Must-do (migration batch):**
1. Add `quotableBlock` to `EntityType` enum
2. Add `searchPerformanceRecords SearchPerformance[]` reverse relation on Entity model
3. Execute all other changes from SEO-SCHEMA-MIGRATION-PLAN as specified

**Must-do (documentation):**
4. Update Site-Arch 05 with 410 clarification note
5. Update SEO-RECORDING-SPEC Rule 6.1 with SystemConfig key convention
6. Update SEO-SCHEMA-MIGRATION-PLAN to include EntityType enum expansion and Entity reverse relation
7. Resolve W3 EventType pattern (choose ENTITY_CREATED+discriminator or new enum value)

**Nice-to-have:**
8. Add QUOTABLE_BLOCK_CREATED to EventType enum
9. Document dedup race condition as known limitation

### Is the SEO Subsystem Fundamentally Sound?

**Yes.** The SEO subsystem design is architecturally sound. The data model separation (SearchPerformance vs MetricSnapshot vs DraftArtifact vs QuotableBlock) is clean and well-motivated. Phase gating is rigorous. Cost controls are documented. The "no sludge" doctrine is enforced consistently.

The only structural issues are:
- Missing `quotableBlock` in EntityType enum (blocks W3 at runtime)
- Missing Entity reverse relation for SearchPerformance (blocks ergonomic queries)

Both are trivially fixable in the migration batch.

### Remaining Architectural Ambiguities

1. **W3 EventType semantics:** Decision needed on whether to overload `ENTITY_CREATED` or add a dedicated `QUOTABLE_BLOCK_CREATED`. Both work; one is cleaner.

2. **Per-project spend caps key convention:** Needs explicit documentation. Current docs imply project-scoped config without specifying how it maps to global SystemConfig.

3. **W1 EventLog entityType:** When logging `METRIC_SNAPSHOT_RECORDED` for a SearchPerformance batch insert, what `entityType` value is used? `searchPerformance` doesn't exist in the enum. Needs clarification — likely use `metricSnapshot` as the closest match, or add `searchPerformance` to EntityType.

No other ambiguities identified.

---

End of document.
