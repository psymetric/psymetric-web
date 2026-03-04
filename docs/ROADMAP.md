# PsyMetric Roadmap (Binding)

This roadmap is the **single source of truth for scope**.

Rules:
- If it's not in the current active phase, it is out of scope.
- Any scope change requires an explicit roadmap edit.
- System invariants are non-negotiable: **project isolation**, **transactional mutations + event logging**, **determinism**, **API-only assistants**.

Related specs:
- `docs/BYDA-S-SPEC.md`
- `docs/VSCODE-EXTENSION-SPEC.md`
- `docs/04-LLM-OPERATING-RULES.md`
- `docs/07-RELATIONSHIP-AND-EVENT-VOCABULARY.md`
- `docs/specs/SIL-1-OBSERVATION-LEDGER.md`

---

## Current System State Snapshot

> This section reflects the actual implemented state as of the last documentation reconciliation.
> It is the authoritative reference for what exists, what does not exist, and what is intentionally deferred.
> Hammer is the authority: 207 PASS, 0 FAIL, 0 SKIP on branch `feature/sil2-deltas-hammer`.

### Architectural Characteristics

- Compute-on-read only — no materialized volatility tables, no background recomputation
- No background jobs, no cron, no LLM integration in any SIL layer
- No schema changes after SIL-1 initial migration — all SIL-2 through SIL-6 are pure read surfaces
- All volatility math is pure functions: deterministic for any given input set
- Snapshot batch loading: O(K × S) where K = keyword count, S = snapshot count in window
- Deterministic keyset pagination on all paginated surfaces
- Shared extraction logic lives in `src/lib/seo/serp-extraction.ts`
- Project isolation enforced on every endpoint via `resolveProjectId(request)` (headers only)
- Cross-project access on resource endpoints returns 404 non-disclosure, not 403

### What Exists

**Core Architecture**
- Multi-project isolation via `resolveProjectId()` header scoping
- `projectId` on all domain tables
- Cross-project non-disclosure (404)
- `prisma.$transaction()` wrapping every mutation with co-located EventLog entry
- Deterministic ordering enforced in all read endpoints
- Enum vocabularies canonicalized in Prisma schema and validation layer
- UUID conventions throughout (`@default(uuid()) @db.Uuid`)

**Zod Migration — Phases 1–5 (Complete)**

All write endpoints migrated to Zod with `safeParse()`, `.strict()` where appropriate, flattened error mapping, malformed JSON guards, and enum-safe typing:
- `POST /api/entities`
- `POST /api/source-items/capture`
- `PUT /api/source-items/[id]/status`
- `POST /api/relationships`
- `POST /api/draft-artifacts`

**SIL-1 — Observation Ledger (Complete)**

Prisma models:
- `KeywordTarget` — governance record per (projectId, query, locale, device)
- `SERPSnapshot` — immutable append-only observation record

Schema characteristics:
- Compound unique index on `(projectId, query, locale, device, capturedAt)` — enforces one snapshot per capture event
- `aiOverviewStatus` as application-validated tri-state string (`"present"` | `"absent"` | `"parse_error"`)
- Nullable `validAt` for bitemporal support
- `payloadSchemaVersion` on `SERPSnapshot`
- `EntityType` and `EventType` enums extended with `keywordTarget`, `serpSnapshot`, `KEYWORD_TARGET_CREATED`, `SERP_SNAPSHOT_RECORDED`

Endpoints:
- `POST /api/seo/keyword-targets` — query normalization, uniqueness enforcement, EventLog
- `POST /api/seo/serp-snapshots` — idempotent replay (200 on duplicate), strict Zod validation, EventLog
- `POST /api/seo/keyword-research` — batch keyword creation convenience endpoint
- Deterministic list/read surfaces for KeywordTargets and SERPSnapshots

**SIL-2 — SERP Deltas (Complete)**

Endpoint: `GET /api/seo/serp-deltas`

Capabilities:
- Rank change detection across two SERPSnapshots (explicit pair or auto-select latest two)
- Classifies results as entered, exited, or moved with rank_delta per URL
- AI Overview change detection (present ↔ absent flip surfaced in response)
- `payload_parse_warning` propagated when rawPayload structure is unrecognized
- Duplicate URL first-wins rule (results pre-sorted rank asc, lowest rank wins)
- Deterministic pair selection (capturedAt desc, id desc tie-breaker)
- Cross-project snapshot access → 404 non-disclosure
- `insufficient_snapshots` flag when fewer than 2 snapshots exist

**SIL-3 — Keyword Volatility (Complete)**

Endpoint: `GET /api/seo/keyword-targets/:id/volatility`

Capabilities:
- `volatilityScore` [0–100] — weighted composite of four normalized signals:
  - rankShiftScore (40%): mean absolute rank movement across consecutive pairs
  - maxShiftScore (25%): single-event spike detection
  - aiChurnScore (20%): AI Overview presence/absence flip ratio
  - featureVolScore (15%): SERP feature type change count
- `sampleSize` (N-1 consecutive pairs from N snapshots)
- `averageRankShift`, `maxRankShift`, `featureVolatility`, `aiOverviewChurn`
- `windowDays` filter (1–365): applied at DB layer via capturedAt index
- `alertThreshold` (0–100, default 60): `exceedsThreshold` boolean in response
- Maturity classification: `preliminary` (0–4 pairs) / `developing` (5–19) / `stable` (≥20)
- Fully deterministic — same snapshot set always produces identical score
- No materialization: compute-on-read every call

**SIL-4 — Project Volatility Summary (Complete)**

Endpoint: `GET /api/seo/volatility-summary`

Capabilities:
- Single snapshot batch query for the whole project (O(1) DB queries, O(K×S) compute)
- Volatility bucket counts: `highVolatilityCount`, `mediumVolatilityCount`, `lowVolatilityCount`, `stableCount`
- `activeKeywordCount` (sampleSize >= 1), `keywordCount` (all)
- `averageVolatility`, `maxVolatility`
- Maturity distribution: `preliminaryCount`, `developingCount`, `stableCountByMaturity`
- `alertKeywordCount` and `alertRatio` (fraction exceeding alertThreshold)
- `windowDays` filter applied consistently with SIL-3
- Deterministic aggregation: two sequential calls with same params return identical values

**SIL-5 — Volatility Alerts (Complete)**

Endpoint: `GET /api/seo/volatility-alerts`

Capabilities:
- Returns only KeywordTargets where `volatilityScore >= alertThreshold` AND `maturity >= minMaturity` AND `sampleSize >= 1`
- Sorted deterministically: `volatilityScore DESC`, `query ASC`, `keywordTargetId ASC`
- Keyset cursor pagination: cursor encodes `(paddedScore:query:id)` as base64url
- Query params: `windowDays`, `alertThreshold` (default 60), `minMaturity` (default `developing`), `limit` (1–50, default 20), `cursor`
- `exceedsThreshold` is structurally always `true` on returned items (filter-first, not flag-all)
- Project-scoped list: OtherHeaders returns OtherProject's alerts, not 404

**SIL-6 — SERP History Time Series (Complete)**

Endpoint: `GET /api/seo/keyword-targets/:id/serp-history`

Capabilities:
- Paginated time series of SERPSnapshot observations for a single KeywordTarget
- Ordering: `capturedAt DESC, id DESC` (most recent first, deterministic tie-breaker)
- Per-item extraction using shared `extractOrganicResults` from `src/lib/seo/serp-extraction.ts`
- `topResults`: top-N organic URLs per snapshot after dedup (first-wins, rank asc order)
- `payloadParseWarning` per item, consistent with SIL-2 behavior
- `includePayload` (boolean, default false): exposes rawPayload for debugging when true
- Keyset cursor: encodes `(capturedAt ISO|id)` as base64url; DB WHERE applies tuple comparison
- Query params: `windowDays`, `limit` (1–200, default 50), `topN` (1–20, default 10), `includePayload`, `cursor`
- Cross-project → 404 non-disclosure

### Shared Infrastructure

**`src/lib/seo/serp-extraction.ts`**

Exports `extractOrganicResults`, `ExtractedResult`, `ExtractionResult`. Used by both SIL-2 (`serp-deltas`) and SIL-6 (`serp-history`). Handles two payload strategies: DataForSEO `items[]` format and simple `results[]` test format. Duplicate URL dedup (first-wins), deterministic sort (rank asc, URL asc tie-breaker).

**Hammer Discipline**

Modular hammer harness: `hammer-lib.ps1`, `hammer-core.ps1`, `hammer-seo.ps1`, `hammer-sil2.ps1` through `hammer-sil6.ps1`, coordinated by `api-hammer.ps1`. Parse-check guardrail catches syntax errors before execution. Coordinator runs all modules in sequence; counters accumulate across modules.

Current status: **207 PASS, 0 FAIL, 0 SKIP**

### What Does Not Exist

- No materialized volatility scores — compute-on-read only
- No background ingestion jobs or cron-based processing
- No LLM integration in any SIL layer
- No SIL-7 or above — not started
- No schema changes beyond SIL-1 initial migration
- No autonomous publishing
- No VS Code extension implementation (deferred)
- W4–W7 (pre-SIL DraftArtifact-based SEO endpoints) — formally superseded

### What Is Intentionally Deferred

- Materialized volatility tables with recompute triggers (warranted only if per-keyword snapshot counts exceed ~500)
- Keyword clustering / entity-level aggregation
- AI citation extraction beyond status flags
- GraphRAG and advanced retrieval
- LLM broker integration
- Dashboard UI

---

## Phase -1 — Multi-Project Hardening Milestone (DONE)

Status: ✅ complete

---

## Phase 0 — AI News + Manual SEO Instrumentation (DONE)

Status: ✅ complete

---

## Phase 0.1 — Search Intelligence Layer, SIL-1 through SIL-6 (DONE)

Status: ✅ complete

Delivered:
- SIL-1: Observation Ledger (schema + ingest endpoints)
- SIL-2: SERP Deltas
- SIL-3: Keyword Volatility
- SIL-4: Project Volatility Summary
- SIL-5: Volatility Alerts
- SIL-6: SERP History Time Series
- Shared extraction lib (`src/lib/seo/serp-extraction.ts`)
- Modular hammer harness with 207 PASS across all surfaces

---

## Current System Capabilities

The SIL stack (SIL-1 through SIL-6) provides a complete, compute-on-read search intelligence substrate:

- **Ingest**: deterministic capture of KeywordTargets and SERPSnapshots via POST endpoints with idempotency and EventLog compliance
- **Delta detection**: pairwise rank change analysis between any two snapshots for a keyword, with AI Overview change tracking and parse warning propagation
- **Volatility scoring**: rolling composite score (0–100) per keyword from consecutive snapshot pairs, with configurable window and maturity classification
- **Project aggregation**: single-query volatility summary across all keywords in a project, with bucket distributions and alert ratios
- **Alert surface**: ranked, paginated list of keywords exceeding an alert threshold, filterable by maturity and window
- **History timeline**: paginated time series of SERP observations per keyword with per-snapshot top-N organic results

All surfaces are read-only beyond the ingest layer, deterministic, project-isolated, and covered by the modular hammer harness.

---

## Next Phase Candidates

These are candidate work items. None are started. No schema changes are implied unless explicitly specified in a future roadmap amendment.

### SIL-7 — Volatility Attribution Surface (Candidate)

Expose the internal score components that feed `volatilityScore` on a per-snapshot-pair basis. Currently the weighted composite is returned but the four constituent signals (rankShiftScore, maxShiftScore, aiChurnScore, featureVolScore) are not surfaced in the API.

Candidate endpoint: `GET /api/seo/keyword-targets/:id/volatility-attribution`

Would return per-pair deltas with normalized component scores, enabling operators to understand which signal is driving the composite. No schema changes required — pure compute-on-read extension of existing `computeVolatility` internals.

### Performance Hardening (Candidate)

- Index review: confirm the compound index on `(projectId, query, locale, device, capturedAt)` is used efficiently for SIL-3/4/5/6 query patterns under realistic cardinality
- Snapshot cardinality stress tests: validate O(K×S) memory budget at 100 keywords × 500 snapshots per keyword
- Cursor stability under concurrent inserts: verify pagination cursors do not drift when new snapshots are inserted during a paginated scan

No schema changes required.

### SIL-8 — Cluster / Entity-Level Aggregation (Future Concept)

Aggregate volatility signals across groups of KeywordTargets (e.g., by topic cluster, by entity, by intent type). Requires a clustering or grouping mechanism that does not currently exist. Schema implications are non-trivial and must be specified before any implementation begins. Do not start without an explicit roadmap amendment and spec document.

---

## Phase 1 — VS Code Operator Surface + MCP Read-Only Bridge (DONE)

Status: ✅ complete

---

## Phase 2 — BYDA-S Phase 3-A (S0) With Zero LLM (DONE)

Status: ✅ complete

---

## Phase 3 — LLM Broker Integration for BYDA-S (Read + Propose Only)

Status: ⏳ future

---

## Phase 4 — Patch Apply Expansion (Still Human-Gated)

Status: ⏳ future

---

## Phase 5 — Structured Education Layer (Concepts / Guides / Wiki)

Status: ⏳ future

---

## Phase 6 — Experiments Layer

Status: ⏳ future

---

## Phase 7 — GraphRAG / Advanced Retrieval (FUTURE)

Preconditions:
- Mature entity graph
- Consistent evidence ingestion
- Stable audit and apply flows
- SIL observation ledger operational (now satisfied through SIL-6)

Constraints:
- Retrieval assists drafting and audit; it does not bypass human approval.

---

## Phase 8 — OpenClaw Assistant / Agent Orchestration (FUTURE)

Preconditions:
- All assistants operate via API only
- Mature dataset + strong invariants
- Proven safe apply workflow

Constraints:
- No autonomous publishing
- No uncontrolled state mutation

---

## Hammer Status

- All surfaces: **207 PASS, 0 FAIL, 0 SKIP**
- Branch: `feature/sil2-deltas-hammer`
- Modules: `hammer-core`, `hammer-seo`, `hammer-sil2` through `hammer-sil6`
- Payload heterogeneity torture tests included in SIL-2 and SIL-3 suites
- Dual-project isolation verified on all applicable surfaces

---

**Roadmap authority note:**
The next authorized increment is SIL-7 (Volatility Attribution Surface) if prioritized, or performance hardening. No SEO endpoint implementation occurs outside the SIL specification. W4–W7 are formally superseded and will not be implemented in their original DraftArtifact-based form.
