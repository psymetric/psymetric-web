# SIL-9 — Alerting Layer (Design Spec)

**Project:** PsyMetric

**Status:** Design spec only. No implementation started.

**Implementation state:** 0% — design spec only, no code exists.

**Depends on:** SIL-8 A1, A2, A3, B1, B2 (all complete)

**Related:**
- `docs/specs/SIL-8-PLAN.md` (volatility engine — source of all alert signals)
- `docs/specs/SEARCH-INTELLIGENCE-LAYER.md` (SIL overview)
- `docs/ROADMAP.md` (phase commitments)
- `src/lib/seo/volatility-service.ts` (compute primitives)

---

## 1. Purpose

SIL-9 layers a signal detection surface on top of the SIL-8 volatility engine. Where SIL-8 answers "what is happening," SIL-9 answers "what changed that an operator should know about."

Alerts are not push notifications. They are queryable, reproducible signal records derived deterministically from existing snapshot history. An alert is valid if and only if the snapshot data that generated it is valid.

No new schema is presumed at this stage. Storage architecture is an open decision documented in Section 4.

---

## 2. Alert Trigger Types

The following trigger types are defined for SIL-9. Each is scoped to a `projectId` and, where applicable, a `keywordTargetId`.

---

### T1 — Volatility Regime Transition

**Trigger condition:** The `volatilityRegime` classification for a keyword changes between the most recent completed snapshot pair and the pair immediately preceding it.

**Signal source:** `volatility-service.ts` → `classifyRegime()` applied to consecutive `pairVolatilityScore` values.

**Directionality:** Transitions are directional. A `calm → shifting` transition is a distinct signal type from `shifting → calm`.

**Fields:**
- `keywordTargetId`
- `fromRegime`: `"calm" | "shifting" | "unstable" | "chaotic"`
- `toRegime`: same enum
- `fromSnapshotId`, `toSnapshotId`
- `fromCapturedAt`, `toCapturedAt`
- `pairVolatilityScore`: score of the triggering pair

**Severity mapping (informational, not binding at this stage):**

| Transition | Severity |
|-----------|---------|
| calm → shifting | low |
| calm → unstable | high |
| calm → chaotic | critical |
| shifting → unstable | medium |
| shifting → chaotic | critical |
| unstable → chaotic | high |
| * → calmer regime | info (recovery signal) |

Severity mapping is advisory. It must not be hardcoded into storage — store `fromRegime` + `toRegime` and derive severity at read time.

---

### T2 — Spike Threshold Exceedance

**Trigger condition:** A `pairVolatilityScore` for a consecutive snapshot pair exceeds a configured threshold `X`.

**Signal source:** A2 (volatility-spikes) computation — `pairVolatilityScore = computeVolatility([snapshotA, snapshotB]).volatilityScore`.

**Default threshold:** `X = 75.00` (boundary of `chaotic` regime). Must be configurable per project, not globally hardcoded.

**Fields:**
- `keywordTargetId`
- `fromSnapshotId`, `toSnapshotId`
- `fromCapturedAt`, `toCapturedAt`
- `pairVolatilityScore`
- `threshold`: the value of `X` that was exceeded
- `exceedanceMargin`: `pairVolatilityScore - threshold`, rounded to 2 decimals

**Deduplication constraint:** A single snapshot pair should not generate more than one T2 alert per threshold configuration. If a pair's score changes due to recomputation, the existing alert is superseded, not duplicated.

---

### T3 — Risk Concentration Exceedance

**Trigger condition:** The `volatilityConcentrationRatio` from B2 (`/volatility-summary`) exceeds a configured threshold `Y`.

**Signal source:** B2 computation — `top3VolatilitySum / totalVolatilitySum`.

**Default threshold:** `Y = 0.80` (top-3 keywords represent 80%+ of project-wide volatility mass).

**Fields:**
- `projectId`
- `volatilityConcentrationRatio`
- `threshold`
- `top3RiskKeywords`: snapshot of the `top3RiskKeywords` array at trigger time
- `activeKeywordCount`
- `computedAt`

**Null guard:** If `volatilityConcentrationRatio` is `null` (all scores zero or no active keywords), no T3 alert is generated.

---

### T4 — AI Churn Spike Cluster

**Trigger condition:** Within a rolling window of `W` consecutive snapshot pairs for a keyword, the count of pairs where `aiOverviewFlipped = true` exceeds a threshold `Z`.

**Signal source:** Derived from snapshot pair sequence using the same flip detection logic as A4 (AI Stability Model).

**Default parameters:** `W = 5` pairs, `Z = 3` flips within the window (60% flip rate).

**Fields:**
- `keywordTargetId`
- `windowStart`: `capturedAt` of the earliest pair in the window
- `windowEnd`: `capturedAt` of the most recent pair in the window
- `flipCount`: count of flipped pairs in the window
- `windowSize`: `W`
- `flipThreshold`: `Z`

**Cluster deduplication:** Overlapping windows that all satisfy the threshold represent a single sustained cluster, not N distinct alerts. Cluster boundary is defined as the earliest and latest consecutive pair satisfying the condition.

---

### T5 — Feature Transition Anomaly Frequency

**Trigger condition:** A specific `transitionKey` (from A3 feature-transitions) appears with a `count` exceeding its historical baseline by a configurable multiplier `M` within a rolling window.

**Signal source:** A3 (feature-transitions) computation.

**Baseline definition (open question — see Section 5.1):** Historical baseline for a transition type must be defined before this trigger can be implemented. Options: rolling 90-day mean, fixed reference period, or statistical z-score.

**Fields:**
- `keywordTargetId`
- `transitionKey`: `fromKey + "→" + toKey`
- `fromFeatureSet`, `toFeatureSet`
- `observedCount`: count in the current window
- `baselineCount`: expected count from baseline
- `multiplier`: `observedCount / baselineCount`

**Status:** T5 is the lowest-confidence trigger. It depends on a baseline definition that cannot be finalized without production data. **Implement last.**

---

## 3. Determinism Requirements

All SIL-9 alert surfaces must satisfy the following invariants without exception.

### 3.1 Reproducibility

An alert is a deterministic function of snapshot history. Given the same snapshot rows with the same `capturedAt` values, the same alerts must be produced every time. No alert may depend on wall-clock time at evaluation time (only at ingestion — `capturedAt` on the snapshot itself).

### 3.2 No Wall-Clock Dependency

Alert computation must not call `new Date()` to determine whether an alert fires. The triggering condition is evaluated against `capturedAt` timestamps stored on `SERPSnapshot` rows. `computedAt` may be added as a metadata field on stored alert records (Option B) but must not affect trigger logic.

### 3.3 Replayability

Given a fixed set of snapshot IDs as input, alert evaluation must produce identical output. This enables:
- Backfill of alerts after retroactive snapshot ingestion
- Regression testing of alert logic against fixture data
- Determinism validation in the hammer suite

### 3.4 No New Math

Alert trigger thresholds compare against `pairVolatilityScore`, `volatilityConcentrationRatio`, and `flipRatio` — all already defined and computed in SIL-8. No new scoring formula is introduced in SIL-9. Thresholds are plain numeric comparisons against existing rounded values.

### 3.5 Rounding Consistency

All comparisons use values already rounded per SIL-8 rules (2 decimal places for scores, 4 for ratios). Alert storage stores rounded values, not raw floats.

---

## 4. Storage Architecture Decision

Two approaches are viable. This section analyzes tradeoffs. **No decision is made in this spec.**

---

### Option A — Compute-on-Read Alert Surface

**Description:** No alert records are persisted. Alert detection runs on-demand when an operator queries a new endpoint (e.g., `GET /api/seo/alerts`). The endpoint loads snapshot history, runs trigger evaluations, and returns a live alert list.

**Advantages:**
- Zero new schema. No migration. No background job.
- Perfectly consistent with the SIL-8 compute-on-read architecture.
- Trivially replayable — same query always runs the same computation.
- No alert staleness. No synchronization problem.

**Disadvantages:**
- **Performance risk at scale.** Evaluating T1 (regime transitions) requires loading all consecutive snapshot pairs for all keywords in a project. At K=100 keywords, S=500 snapshots each: O(K × S) pair evaluations per request. At K=1000, this becomes operationally dangerous without mandatory `windowDays` constraints.
- **No alert history.** If an operator queries after a condition has resolved, the alert is gone. There is no record that it ever fired.
- **No alert deduplication across time.** A spike that persists across multiple requests will appear each time. There is no "acknowledged" state.
- **T5 (feature transition anomaly) requires baseline computation**, which itself is an O(K × S × T) operation. Compute-on-read for T5 may be infeasible.

**Window constraint mitigation:** Option A is viable for T1 and T2 if `windowDays` is mandatory (not optional) with a hard ceiling (e.g., 30 days). This bounds the snapshot load per request.

**Verdict on scope:** Option A is viable for MVP alerting (T1, T2, T3) with mandatory window constraints. It is not viable for T4 cluster detection or T5 anomaly frequency at production scale.

---

### Option B — Materialized Alert Events Table

**Description:** A new `AlertEvent` table stores alert records as they are generated. A background job or ingest-time trigger evaluates alert conditions after each new snapshot is ingested and writes `AlertEvent` rows.

**Schema sketch (not binding — illustration only):**

```
AlertEvent {
  id              UUID PK
  projectId       UUID FK → Project
  keywordTargetId UUID FK → KeywordTarget (nullable for project-scope alerts)
  triggerType     Enum(T1, T2, T3, T4, T5)
  fromSnapshotId  UUID FK → SERPSnapshot (nullable)
  toSnapshotId    UUID FK → SERPSnapshot (nullable)
  payload         JSONB  -- trigger-specific fields (thresholds, scores, feature sets)
  firedAt         DateTime -- capturedAt of the triggering snapshot, not wall clock
  createdAt       DateTime -- wall clock (metadata only, not used in trigger logic)
  acknowledged    Boolean default false
}
```

**Advantages:**
- **Alert history is preserved.** Operators can query past alerts, track resolution, and measure alert frequency over time.
- **Deduplication is explicit.** Upsert on `(projectId, keywordTargetId, triggerType, toSnapshotId)` prevents duplicate records for the same event.
- **Performance decoupled from query time.** Alert detection runs once at ingest, not at every operator query.
- **T5 is feasible.** Baseline can be computed incrementally at ingest time rather than on each read.
- **Acknowledgment state** enables operator workflow (dismiss, snooze, escalate).

**Disadvantages:**
- **Schema migration required.** New table, new enum type, new FK constraints.
- **Background job or ingest hook required.** Alert evaluation must be triggered after each snapshot ingest. This introduces a new execution surface that must be monitored.
- **Ingest-time evaluation couples alert logic to the data pipeline.** A bug in alert evaluation could block or corrupt snapshot ingestion if not properly isolated.
- **Replayability requires explicit backfill tooling.** Adding a new trigger type after deployment requires a backfill job to evaluate it against historical snapshots.
- **Storage growth.** Alert volume is proportional to project scale and alert sensitivity. Must implement TTL or archival policy.

**Ingest isolation rule (if Option B is chosen):** Alert evaluation must run in a separate transaction from snapshot ingest. A failure in alert evaluation must not roll back the snapshot write. Alert records are append-only; no snapshot write depends on alert state.

---

### Decision Criteria

The decision between Option A and Option B should be deferred until the following is known:

1. **Expected keyword count per project at P90.** If median projects have K < 50 and P90 < 200, Option A with mandatory windowDays is likely sufficient for MVP.
2. **Whether alert history is a product requirement.** If operators need "what alerts fired last week," Option B is required regardless of performance.
3. **Whether T5 (anomaly frequency) is in scope for MVP.** T5 forces Option B.
4. **Ingest pipeline architecture.** If snapshot ingestion already has a post-write hook pattern, Option B's ingest trigger is low-friction. If ingestion is stateless, adding a hook increases surface area.

**Recommendation at this stage:** Implement Option A for T1, T2, T3 as an MVP. Validate alert signal quality and operator usage patterns before committing to Option B schema migration. If T5 or alert history becomes a hard requirement, migrate to Option B at that point.

---

## 5. Open Questions

### 5.1 T5 Baseline Definition

Feature transition anomaly detection (T5) requires a historical baseline for each `transitionKey`. Options:

- **Rolling 90-day mean:** Compute average `count` for each transition type over the prior 90 days. Simple but requires sufficient history.
- **Fixed reference period:** Operator-configured stable period used as the baseline. Brittle if the SERP structure changes legitimately.
- **Statistical z-score:** Requires mean and standard deviation over a long history. Most principled but requires Option B storage to compute incrementally.

T5 cannot be finalized until a baseline methodology is chosen and validated against real data. **Do not implement T5 until SIL-9 core (T1–T3) is stable.**

### 5.2 Threshold Configurability Scope

Are thresholds global (per platform default), per-project, or per-keyword? Options:

- **Global defaults only:** Simplest. No configuration surface. Risk of false positives/negatives across heterogeneous projects.
- **Per-project overrides:** Reasonable scope. Requires a `ProjectAlertConfig` table or JSON config field on `Project`.
- **Per-keyword overrides:** Maximum precision. High operational complexity. Likely premature.

Recommendation: global defaults with per-project override, stored as a nullable JSON field on the existing `Project` table. Defer per-keyword overrides.

### 5.3 Alert Delivery

SIL-9 is a queryable surface, not a push system. Webhook delivery, email, or Slack integration are explicitly out of scope for this spec. If delivery is required, it is a separate SIL-10 concern.

---

## 6. Isolation + Project Scope

All alerting surfaces follow the same `resolveProjectId` enforcement model as SIL-1 through SIL-8.

**Binding rules:**

- `resolveProjectId(request)` is called first on every alert endpoint, before any DB work.
- All `SERPSnapshot`, `KeywordTarget`, and `AlertEvent` (if Option B) loads include `WHERE projectId = resolvedProjectId` at the DB query boundary.
- No cross-project snapshot loads followed by in-memory filtering.
- Single-resource alert endpoints scoped by `keywordTargetId`: cross-project access → 404 non-disclosure.
- Project-scope alert endpoints: return only data for the resolved project.

**Alert payload isolation:** The `payload` JSONB field (Option B) must not contain data from other projects. Snapshot IDs, keyword IDs, and feature strings included in alert payloads must all belong to the resolved `projectId`.

---

## 7. Performance Constraints

The following constraints are binding for any SIL-9 implementation, regardless of Option A or B.

### 7.1 No Unbounded O(K × S × R) Patterns at Project Level

The B3 competitive pressure surface established this as a cardinality risk. Alerting at project scope (T3, T4 cluster) must enforce mandatory `windowDays` with a hard ceiling to bound snapshot loads.

**Binding limits for project-scope alert queries:**
- `windowDays` required, range 1–30 for compute-on-read surfaces
- No alert endpoint may load unbounded snapshot history for an entire project in a single request

### 7.2 Pair Evaluation Bound

For keyword-scope triggers (T1, T2, T4), evaluation is bounded by `windowDays × captureFrequency`. At one snapshot per day and `windowDays = 30`, this is 30 pairs per keyword — well within acceptable bounds.

### 7.3 Option B Ingest Isolation

If Option B is chosen, alert evaluation at ingest time must complete within the latency budget of the snapshot ingest pipeline. Alert evaluation failures must not block snapshot writes. Implement with:

- Separate transaction for alert writes
- Async evaluation with retry if latency budget is exceeded
- Circuit breaker to disable alert evaluation if error rate spikes without halting ingestion

### 7.4 Index Requirements (Option B Only)

Minimum required indexes on `AlertEvent`:

```
INDEX ON AlertEvent(projectId, firedAt DESC)
INDEX ON AlertEvent(projectId, keywordTargetId, firedAt DESC)
INDEX ON AlertEvent(projectId, triggerType, firedAt DESC)
UNIQUE INDEX ON AlertEvent(projectId, keywordTargetId, triggerType, toSnapshotId)  -- deduplication
```

---

## 8. Hammer Coverage Requirements

Every implemented SIL-9 trigger type requires a `hammer-sil9.ps1` module with the following minimum coverage:

- **Positive case:** Fixture that satisfies the trigger condition → assert alert fires.
- **Negative case:** Fixture that does not satisfy the trigger condition → assert alert does not fire.
- **Boundary case:** Fixture at exactly the threshold value → assert correct behavior (fires or does not fire based on strict vs. inclusive comparison).
- **Isolation case:** Two projects, condition satisfied in project B only → assert project A query returns no alert.
- **Determinism case:** Two sequential calls with identical snapshot state → assert identical alert list.
- **Null guard (T3):** `volatilityConcentrationRatio = null` → assert no T3 alert generated.

---

## 9. Surfaces Summary

| ID | Trigger | Scope | Signal Source | Storage | Status |
|----|---------|-------|--------------|---------|--------|
| T1 | Regime transition | Keyword | B1 classifyRegime | TBD | Design only |
| T2 | Spike threshold exceedance | Keyword | A2 pairVolatilityScore | TBD | Design only |
| T3 | Risk concentration exceedance | Project | B2 volatilityConcentrationRatio | TBD | Design only |
| T4 | AI churn spike cluster | Keyword | A4 aiOverviewFlipped | TBD | Design only |
| T5 | Feature transition anomaly | Keyword | A3 transitionKey count | TBD | Design only — baseline undefined |

---

## 10. What This Spec Does Not Cover

- Webhook, email, or push delivery (SIL-10 concern)
- Alert acknowledgment UI
- Alert snooze or suppression rules
- Per-keyword threshold configuration
- SLA or uptime alerting (infrastructure concern, not SEO signal concern)
- LLM-powered alert summarization
