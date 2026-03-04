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

## Current System State (Post SIL-9)

PsyMetric now includes:

- **SIL-1**: Observation Ledger
- **SIL-2**: SERP Deltas
- **SIL-3**: Keyword Volatility Scoring
- **SIL-4**: Project Volatility Summary
- **SIL-5**: Volatility Alerts (threshold-based)
- **SIL-6**: SERP History Surface
- **SIL-7**: Volatility Attribution Components
- **SIL-8**: Diagnostic Surfaces
  - A1 Volatility Breakdown
  - A2 Volatility Spikes
  - A3 Feature Transition Matrix
  - B1 Regime Classification
  - B2 Project Risk Index
- **SIL-9**: Deterministic Alert Engine
  - T1 Regime Transition
  - T2 Spike Detection
  - T3 Risk Concentration
  - T4 AI Churn Cluster (opt-in)
  - Magnitude-aware severity scoring
  - Suppression controls
  - Deterministic keyset pagination
  - Strict validation + isolation
  - 327 hammer tests passing
  - No schema changes
  - Compute-on-read architecture retained

---

## SIL-10 — Risk Attribution Summary Surface (Planned)

**Objective:**
Expose aggregate volatility cause distribution at the project level.

**Example output:**
- Rank-driven volatility: 58%
- AI-driven volatility: 31%
- Feature-driven volatility: 11%

**Derived from:**
- SIL-7 volatility components
- Weighted by sampleSize
- Window-bounded
- Deterministic
- No new math
- No schema changes

**Purpose:**
Transform alert stream into causal understanding. Shift system from reactive alerts to strategic diagnosis.

---

## Strategic Direction — From Alerts to Decision Intelligence

The SIL stack through SIL-9 establishes a complete reactive surface: ingest, score, classify, alert. The next evolution shifts emphasis from detection to interpretation. The goal is not more alerts — it is clearer causal signal and operator-actionable output.

This direction is grounded in existing architecture. All phases below remain compute-on-read unless explicitly noted otherwise. No background jobs. No schema changes without a formal roadmap amendment.

---

### Phase A — Attribution and Narrative Layer

The immediate priority after SIL-10 is extending causal depth at the project level.

- **Project-level cause dominance**: which of the four volatility signals (rank shift, AI churn, max spike, feature change) is the primary driver of composite score across the project and over time
- **Volatility persistence metrics**: how long a keyword remains above threshold after first breaching it; distinguishes transient spikes from structural instability
- **Regime stability duration**: for each regime classification (calm, shifting, unstable, chaotic), how many consecutive snapshot pairs a keyword has held that regime
- **AI influence weighting over time**: track the proportion of total project volatility attributable to `aiChurnScore` across rolling windows; surfaces long-term trends in AI Overview behavior without requiring new schema

All metrics are derived from existing snapshot data. All computations are pure functions of snapshot inputs. No new fields, no new tables.

---

### Phase B — Operator Surfaces

Structured API surfaces that make attribution and regime data consumable without custom aggregation by callers.

- **`/alerts/summary`**: project-level rollup of current alert state — active alert count by trigger type, severity distribution, top affected keywords, dominant causal signal. Single-request diagnostic view.
- **`/risk-profile`**: per-project risk posture derived from SIL-8 B2 and SIL-9 T3 signals. Returns concentration ratio, regime distribution, and persistence metrics for the current window.
- **Volatility heatmaps**: grid representation of keyword × time regime history, suitable for rendering in operator tooling. Fully derived from existing snapshot pairs.
- **Regime timeline**: ordered sequence of regime classifications per keyword over the configured window, with timestamps. Enables operators to identify when instability began, not just that it exists.

Implementation sequence and endpoint design will be specified per-surface before any work begins. Each surface must have a corresponding hammer test suite before merge.

---

### Phase C — Optional Storage Evolution (Conditional)

Storage architecture change is warranted only if a specific operational requirement cannot be met by compute-on-read.

The trigger condition is: **alert history becomes a hard requirement** — i.e., the system must answer "what alerts fired on day X" rather than "what alerts would fire now over window W."

If that requirement is confirmed:
- A materialized `AlertEvent` table may be introduced
- Schema migration requires explicit roadmap amendment and a full spec document
- Deterministic replay guarantees must be preserved: the same input snapshot set must produce the same alert output regardless of whether it was computed live or read from storage
- No materialization without a defined retention and compaction strategy
- The compute-on-read path must remain operational in parallel for validation

This phase does not begin speculatively. It begins only when the operational requirement is confirmed and specified.

---

### Phase D — Predictive Signals (Strictly Deterministic)

Signals that describe trajectory rather than current state. All remain compute-on-read. No probabilistic models. No external data dependencies.

- **Regime trajectory detection**: classify whether a keyword's regime sequence is worsening, recovering, or stable across the most recent N pairs. Purely a function of consecutive pair regimes.
- **Momentum persistence scoring**: quantify whether recent volatility is increasing, decreasing, or flat relative to earlier portions of the window. Derived from existing pairVolatilityScore sequences.
- **Volatility acceleration metrics**: rate of change in composite score across consecutive snapshot windows. Identifies keywords where volatility is compounding versus plateauing.
- **Churn burst detection**: extension of T4 logic toward identifying recurrence patterns — keywords that have experienced multiple distinct churn clusters within a longer window. No new schema required if implemented as a compute-on-read variant of the existing cluster detection function.

All Phase D signals must be deterministic: identical inputs produce identical outputs. No approximation, no sampling, no external model inference.

---

## Current System State Snapshot

> This section reflects the actual implemented state as of the last documentation reconciliation.
> It is the authoritative reference for what exists, what does not exist, and what is intentionally deferred.
> Hammer is the authority: 207 PASS, 0 FAIL, 0 SKIP on branch `feature/sil2-deltas-hammer`.
> SIL-9 (T1–T4, suppression, pagination, severity refinement) adds 327 additional passing tests.

### Architectural Characteristics

- Compute-on-read only — no materialized volatility tables, no background recomputation
- No background jobs, no cron, no LLM integration in any SIL layer
- No schema changes after SIL-1 initial migration — all SIL-2 through SIL-9 are pure read surfaces
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

**SIL-7 — Volatility Attribution Components (Complete)**

Exposes the four constituent volatility signals (rankShiftScore, maxShiftScore, aiChurnScore, featureVolScore) per snapshot pair, enabling callers to understand which signal is driving composite score. Pure compute-on-read extension of existing `computeVolatility` internals.

**SIL-8 — Diagnostic Surfaces (Complete)**

- **A1 Volatility Breakdown**: per-signal breakdown of composite score for a keyword over a window
- **A2 Volatility Spikes**: identifies snapshot pairs where any signal exceeded a spike threshold
- **A3 Feature Transition Matrix**: counts SERP feature type transitions (present→absent, absent→present) per pair
- **B1 Regime Classification**: classifies each snapshot pair into volatility regime (calm, shifting, unstable, chaotic)
- **B2 Project Risk Index**: concentration ratio of top-3 volatile keywords relative to project total; surfaces risk concentration

**SIL-9 — Deterministic Alert Engine (Complete)**

Endpoint: `GET /api/seo/alerts`

Trigger types:
- **T1 — Regime Transition**: fires when the volatility regime changes between the last two consecutive pairs for a keyword
- **T2 — Spike Threshold Exceedance**: fires for each pair where pairVolatilityScore exceeds the configured spike threshold
- **T3 — Risk Concentration**: fires when the top-3 keyword concentration ratio exceeds the configured concentration threshold
- **T4 — AI Churn Cluster** (opt-in): fires when a keyword accumulates a qualifying cluster of AI Overview status flips within a configurable window and gap constraint

Alert infrastructure:
- Magnitude-aware severity scoring: integer [0–100], formula differs per trigger type
- Suppression controls: `suppressionMode`, `t1Mode`, `t2Mode`, `t3Mode` — deterministic subset operations, no re-sort
- Deterministic keyset pagination: 5-key cursor (severityRank, toCapturedAt, triggerType, keywordTargetId, toSnapshotId)
- Filter params: `triggerTypes`, `keywordTargetId`, `minSeverityRank`, `minPairVolatilityScore`
- T4 activation gate: requires explicit `triggerTypes=T4` + `aiChurnMinFlips`; 400 if T4 requested without required params
- No writes, no EventLog, no schema changes
- Compute-on-read: all alert conditions are functions of loaded snapshot rows only
- 327 hammer tests passing across T1–T4, filtering, suppression, pagination, severity, and validation

### Shared Infrastructure

**`src/lib/seo/serp-extraction.ts`**

Exports `extractOrganicResults`, `ExtractedResult`, `ExtractionResult`. Used by both SIL-2 (`serp-deltas`) and SIL-6 (`serp-history`). Handles two payload strategies: DataForSEO `items[]` format and simple `results[]` test format. Duplicate URL dedup (first-wins), deterministic sort (rank asc, URL asc tie-breaker).

**Hammer Discipline**

Modular hammer harness: `hammer-lib.ps1`, `hammer-core.ps1`, `hammer-seo.ps1`, `hammer-sil2.ps1` through `hammer-sil9.ps1`, coordinated by `api-hammer.ps1`. Parse-check guardrail catches syntax errors before execution. Coordinator runs all modules in sequence; counters accumulate across modules.

Current status: **327 PASS, 0 FAIL, 0 SKIP** (SIL-9 branch)

### What Does Not Exist

- No materialized volatility scores — compute-on-read only
- No background ingestion jobs or cron-based processing
- No LLM integration in any SIL layer
- No SIL-10 or above — not started
- No schema changes beyond SIL-1 initial migration
- No autonomous publishing
- No VS Code extension implementation (deferred)
- W4–W7 (pre-SIL DraftArtifact-based SEO endpoints) — formally superseded

### What Is Intentionally Deferred

- Materialized volatility tables with recompute triggers (warranted only if per-keyword snapshot counts exceed ~500)
- Materialized AlertEvent table (warranted only if alert history — not just current-window computation — becomes a hard operational requirement)
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

## Phase 0.2 — Search Intelligence Layer, SIL-7 through SIL-9 (DONE)

Status: ✅ complete

Delivered:
- SIL-7: Volatility Attribution Components
- SIL-8: Diagnostic Surfaces (A1, A2, A3, B1, B2)
- SIL-9: Deterministic Alert Engine (T1, T2, T3, T4)
  - Magnitude-aware severity scoring (SIL-9.3)
  - Suppression controls (SIL-9.2)
  - Deterministic keyset pagination (SIL-9.1)
  - AI Churn Cluster detection (SIL-9 T4)
- Hammer harness extended to 327 PASS across all SIL surfaces

---

## Current System Capabilities

The SIL stack (SIL-1 through SIL-9) provides a complete, compute-on-read search intelligence substrate:

- **Ingest**: deterministic capture of KeywordTargets and SERPSnapshots via POST endpoints with idempotency and EventLog compliance
- **Delta detection**: pairwise rank change analysis between any two snapshots for a keyword, with AI Overview change tracking and parse warning propagation
- **Volatility scoring**: rolling composite score (0–100) per keyword from consecutive snapshot pairs, with configurable window and maturity classification
- **Attribution**: per-pair decomposition of composite score into constituent signals (rank shift, spike, AI churn, feature volatility)
- **Diagnostics**: breakdown surfaces, spike identification, feature transition matrices, regime classification, and project risk concentration index
- **Project aggregation**: single-query volatility summary across all keywords in a project, with bucket distributions and alert ratios
- **Alert surface (legacy threshold-based)**: ranked, paginated list of keywords exceeding an alert threshold, filterable by maturity and window
- **Alert engine (SIL-9)**: deterministic, multi-type alert surface with severity scoring, suppression, keyset pagination, and opt-in AI churn cluster detection
- **History timeline**: paginated time series of SERP observations per keyword with per-snapshot top-N organic results

All surfaces are read-only beyond the ingest layer, deterministic, project-isolated, and covered by the modular hammer harness.

---

## Next Phase Candidates

These are candidate work items. None are started. No schema changes are implied unless explicitly specified in a future roadmap amendment.

### SIL-10 — Risk Attribution Summary Surface (Next Immediate Phase)

See full specification above under **SIL-10 — Risk Attribution Summary Surface (Planned)**.

### Performance Hardening (Candidate)

- Index review: confirm the compound index on `(projectId, query, locale, device, capturedAt)` is used efficiently for SIL-3/4/5/6 query patterns under realistic cardinality
- Snapshot cardinality stress tests: validate O(K×S) memory budget at 100 keywords × 500 snapshots per keyword
- Cursor stability under concurrent inserts: verify pagination cursors do not drift when new snapshots are inserted during a paginated scan

No schema changes required.

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
- SIL observation ledger operational (now satisfied through SIL-9)

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

- All surfaces: **327 PASS, 0 FAIL, 0 SKIP**
- Branch: SIL-9 feature branch (rebased on `feature/sil2-deltas-hammer`)
- Modules: `hammer-core`, `hammer-seo`, `hammer-sil2` through `hammer-sil9`
- Payload heterogeneity torture tests included in SIL-2 and SIL-3 suites
- Dual-project isolation verified on all applicable surfaces
- T4 activation gate, cluster detection, severity, suppression pass-through, and pagination all hammer-covered

---

**Roadmap authority note:**
The next authorized increment is SIL-10 (Risk Attribution Summary Surface). No SEO endpoint implementation occurs outside the SIL specification. W4–W7 are formally superseded and will not be implemented in their original DraftArtifact-based form. Storage architecture changes (materialized tables) require an explicit roadmap amendment before any implementation begins.
