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

## Current System State

PsyMetric now includes a complete Search Intelligence Layer (SIL-1 through SIL-14),
an expanded SERP sensor suite, operator reasoning + briefing system,
change classification, event timeline reconstruction, and deterministic event causality detection.

### Core SIL Layers (Complete)

- **SIL-1**: Observation Ledger
- **SIL-2**: SERP Deltas
- **SIL-3**: Keyword Volatility Scoring
- **SIL-4**: Project Volatility Summary
- **SIL-5**: Volatility Alerts (threshold-based)
- **SIL-6**: SERP History Time Series
- **SIL-7**: Volatility Attribution Components
- **SIL-8**: Diagnostic Surfaces
  - A1 Volatility Breakdown
  - A2 Volatility Spikes
  - A3 Feature Transition Matrix
  - B1 Regime Classification
  - B2 Project Risk Index
- **SIL-9**: Deterministic Alert Engine (T1–T4, suppression, pagination, severity)
- **SIL-10**: Temporal Risk Attribution Surface
- **SIL-11**: Operator Reasoning Layer (project-level deterministic heuristics)
- **SIL-11B**: Operator Briefing Packet (structured LLM-ready prompt generation)
- **SIL-12**: Change Classification (deterministic SERP event classification from sensor signals)
- **SIL-13**: SERP Event Timeline (chronological event stream with duplicate collapse)
- **SIL-14**: Event Causality Detection (deterministic adjacent transition pattern detection)

### SERP Sensor Systems (Complete)

Implemented as pure library functions + read-only endpoints + hammer coverage.

- **Feature Extraction Expansion** (`src/lib/seo/serp-extraction.ts`)
  - `extractFeatureSignals()` — structured feature presence per snapshot
  - `FeatureSignals` type with `rawTypesSorted`, `familiesSorted`, `flags`, `parseWarning`
  - `mapTypeToFamily()` — deterministic family normalization (17 known types → 12 families)

- **Feature History** (`GET /api/seo/keyword-targets/:id/feature-history`)
  - Paginated time series of per-snapshot `FeatureSignals`
  - Keyset pagination on (capturedAt ASC, id ASC)
  - Hammer: FH-A through FH-O (15 tests)

- **Feature Volatility Diagnostics** (`GET /api/seo/keyword-targets/:id/feature-volatility`)
  - Consecutive-pair feature transition detection (entered/exited per family)
  - `mostVolatileFeatures` summary: changes DESC, family ASC, top 10
  - Pure library: `src/lib/seo/feature-volatility.ts`
  - Hammer: FV-A through FV-J (10 tests)

- **Domain Dominance** (`GET /api/seo/keyword-targets/:id/domain-dominance`)
  - Per-snapshot domain frequency analysis with dominance index
  - Pure library: `src/lib/seo/domain-dominance.ts`
  - Hammer: DD-A through DD-J (10 tests)

- **Intent Drift** (`GET /api/seo/keyword-targets/:id/intent-drift`)
  - Maps SERP feature families to intent buckets (informational, video, transactional, local, news)
  - Detects intent distribution changes between consecutive snapshots
  - Pure library: `src/lib/seo/intent-drift.ts`
  - Hammer: ID-A through ID-J (10 tests)

- **SERP Similarity** (`GET /api/seo/keyword-targets/:id/serp-similarity`)
  - Jaccard similarity between consecutive snapshots on domain set and feature family set
  - Combined similarity score [0–1]
  - Pure library: `src/lib/seo/serp-similarity.ts`
  - Hammer: SS-A through SS-J (10 tests)

### Change Classification, Event Timeline & Causality (Complete)

- **SIL-12 Change Classification** (`GET /api/seo/keyword-targets/:id/change-classification`)
  - Combines all sensor signals to classify SERP change state
  - Supported classifications: `algorithm_shift`, `competitor_surge`, `intent_shift`, `feature_turbulence`, `ai_overview_disruption`, `stable`
  - Confidence scoring with overage-ratio scaling, clamped [50–100] for active rules
  - Tie-break: confidence DESC, label ASC
  - Pure library: `src/lib/seo/change-classification.ts`
  - Hammer: CC-A through CC-G (7 tests)

- **SIL-13 SERP Event Timeline** (`GET /api/seo/keyword-targets/:id/event-timeline`)
  - Builds chronological sequence of SERP change events per keyword
  - Snapshots processed in deterministic order (capturedAt ASC, id ASC)
  - Classification computed per cumulative snapshot window
  - Duplicate consecutive classifications collapsed — produces minimal event stream
  - Pure library: `src/lib/seo/event-timeline.ts`
  - Hammer: ET-A through ET-G (7 tests)

- **SIL-14 Event Causality Detection** (`GET /api/seo/keyword-targets/:id/event-causality`)
  - Detects deterministic adjacent transition patterns from the SIL-13 event timeline
  - Recognized patterns currently include:
    - `feature_turbulence_to_algorithm_shift`
    - `ai_overview_disruption_to_intent_shift`
    - `competitor_surge_to_feature_turbulence`
    - `competitor_surge_to_algorithm_shift`
    - `intent_shift_to_competitor_surge`
    - `intent_shift_to_algorithm_shift`
  - Confidence = rounded mean of adjacent event confidences
  - Pure library: `src/lib/seo/event-causality.ts`
  - Hammer: EC-A through EC-G (7 tests)

### Operator Reasoning Systems (Complete)

- **SIL-11 Operator Reasoning Layer**
  - Input: pre-computed project volatility summary + per-keyword profiles
  - Output: `observations[]`, `hypotheses[]`, `recommendedActions[]`
  - Attribution-weighted confidence scoring (not simple threshold triggers)
  - Endpoint: `GET /api/seo/operator-reasoning`

- **SIL-11B Operator Briefing Packet**
  - Composes SIL-4/5/10/11 outputs into a single structured briefing
  - Generates deterministic `promptText` for LLM consumption (no wall-clock data)
  - Optional delta section (limitDeltas param)
  - Pure library: `src/lib/seo/briefing/operator-briefing.ts`
  - Endpoint: `GET /api/seo/operator-briefing`
  - Risk attribution fields: `rankPercent`, `aiPercent`, `featurePercent`

---

## Architectural Characteristics (Invariants)

- Compute-on-read only — no materialized volatility tables, no background recomputation
- No background jobs, no cron, no LLM integration in any SIL layer
- No schema changes after SIL-1 initial migration — all SIL-2 through sensor suite are pure read surfaces
- All volatility math is pure functions: deterministic for any given input set
- Snapshot batch loading: O(K × S) where K = keyword count, S = snapshot count in window
- SIL-13 event timeline computes cumulative signals across prefix windows: O(n²) relative to snapshot count. Acceptable at current scale; future optimization target using deterministic incremental accumulation. No architectural changes required.
- SIL-14 event causality is downstream of SIL-13 and adds deterministic adjacent transition analysis only; no probabilistic inference, no multi-hop chain inference.
- Deterministic keyset pagination on all paginated surfaces
- Shared extraction logic in `src/lib/seo/serp-extraction.ts`
- Project isolation enforced on every endpoint via `resolveProjectId(request)` (headers only)
- Cross-project access on resource endpoints returns 404 non-disclosure, not 403
- Single requestTime anchor per handler — all window boundaries derived from one value
- No wall-clock fields (`computedAt`, `generatedAt`) in read endpoint responses

---

## What Does Not Exist

- No materialized volatility scores — compute-on-read only
- No background ingestion jobs or cron-based processing
- No LLM integration in any SIL layer (SIL-11B generates prompts; it does not call LLMs)
- No schema changes beyond SIL-1 initial migration
- No autonomous publishing
- No VS Code extension implementation (deferred)
- W4–W7 (pre-SIL DraftArtifact-based SEO endpoints) — formally superseded

---

## What Is Intentionally Deferred

- Materialized volatility tables with recompute triggers (warranted only if per-keyword snapshot counts exceed ~500)
- Materialized AlertEvent table (warranted only if alert history — not just current-window computation — becomes a hard operational requirement)
- Keyword clustering / entity-level aggregation
- AI citation extraction beyond status flags
- GraphRAG and advanced retrieval
- LLM broker integration
- Dashboard UI
- VS Code extension

---

## Future Sensors

These are candidate sensor additions. None are started. All must follow the same pattern:
pure library + read-only endpoint + hammer coverage.

- **Rank Velocity**: rate of rank change per keyword between consecutive snapshots; distinguishes gradual drift from sudden displacement
- **Competitor Presence Tracking**: per-domain tracking across keywords; surfaces when a competitor domain appears/disappears across a project's keyword set
- **AI Overview Stability Index**: rolling ratio of AI Overview presence/absence flips per keyword over configurable windows; extends aiOverviewChurn beyond per-window aggregate
- **Feature Co-occurrence Matrix**: which feature families appear together most frequently; identifies structural SERP patterns
- **Snippet Length Drift**: track character count changes in featured snippet text across snapshots (requires text field in rawPayload)

---

## Phase -1 — Multi-Project Hardening Milestone (DONE)

Status: ✅ complete

---

## Phase 0 — AI News + Manual SEO Instrumentation (DONE)

Status: ✅ complete

---

## Phase 0.1 — Search Intelligence Layer, SIL-1 through SIL-6 (DONE)

Status: ✅ complete

---

## Phase 0.2 — Search Intelligence Layer, SIL-7 through SIL-9 (DONE)

Status: ✅ complete

---

## Phase 0.3 — Search Intelligence Layer, SIL-10 through SIL-11B + Sensor Suite (DONE)

Status: ✅ complete

Delivered:
- SIL-10: Temporal Risk Attribution Surface
- SIL-11: Operator Reasoning Layer (attribution-weighted heuristics)
- SIL-11B: Operator Briefing Packet (deterministic LLM prompt generation)
- Feature Extraction Expansion (extractFeatureSignals, family normalization)
- Feature History Endpoint (paginated per-snapshot feature signals)
- Feature Volatility Diagnostics (consecutive-pair transition analysis)
- Domain Dominance Sensor
- Intent Drift Sensor
- SERP Similarity Sensor
- Hammer harness extended across all new surfaces

---

## Phase 0.4 — Change Classification + Event Timeline (DONE)

Status: ✅ complete

Delivered:
- SIL-12: Change Classification — deterministic SERP event classifier combining all sensor signals
- SIL-13: SERP Event Timeline — chronological event stream with duplicate collapse logic
- Hammer modules: `hammer-change-classification.ps1`, `hammer-event-timeline.ps1`
- Both wired into `scripts/api-hammer.ps1`

---

## Phase 0.5 — Event Causality Detection (DONE)

Status: ✅ complete

Delivered:
- SIL-14: Event Causality Detection — deterministic adjacent event transition pattern detection downstream of SIL-13
- Pure library: `src/lib/seo/event-causality.ts`
- Endpoint: `GET /api/seo/keyword-targets/:id/event-causality`
- Hammer module: `hammer-event-causality.ps1`
- Wired into `scripts/api-hammer.ps1`

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
- SIL observation ledger operational (satisfied through SIL-11B)

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

All surfaces covered. Exact counts update with each run.
Modules: `hammer-core`, `hammer-seo`, `hammer-sil2` through `hammer-sil11-briefing`,
`hammer-feature-history`, `hammer-feature-volatility`, `hammer-domain-dominance`,
`hammer-intent-drift`, `hammer-serp-similarity`, `hammer-change-classification`,
`hammer-event-timeline`, `hammer-event-causality`, `hammer-dataforseo-ingest`, `hammer-realdata-fixtures`.

The hammer suite validates: classification determinism, event timeline collapse logic,
event causality pattern detection, isolation safety, endpoint shape, and operator-visible behavior across all SIL layers.

---

**Roadmap authority note:**
Storage architecture changes (materialized tables) require an explicit roadmap amendment before any implementation begins. All new sensor additions must follow the established pattern: pure library → read-only endpoint → hammer coverage → roadmap update.
