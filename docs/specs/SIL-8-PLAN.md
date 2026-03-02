# SIL-8 — Deep Diagnostics + Operator Decision Tooling (Binding Spec)

**Project:** PsyMetric

**Status:** Spec complete. No implementation started.

**Implementation state:** 0% — design spec only, no code exists.

**Depends on:** SIL-1 through SIL-7 (all complete, 207 PASS / 0 FAIL / 0 SKIP)

**Related:**
- `docs/specs/SEARCH-INTELLIGENCE-LAYER.md` (SIL overview)
- `docs/ROADMAP.md` (phase commitments)
- `src/lib/seo/volatility-service.ts` (compute primitives — reused, not modified)
- `src/lib/seo/serp-extraction.ts` (extraction lib — reused, not modified)

---

## 1. Purpose

SIL-8 extends the compute-on-read intelligence layer in two tracks:

**Track A — Deeper Diagnostics:** Expose the internal structure of volatility. Answer not just "how unstable" but "which URLs, which patterns, which events, which competitors."

**Track B — Operator Decision Tooling:** Translate diagnostic signals into operator-actionable surfaces. Regime labels, risk concentration, competitive pressure, momentum direction.

No schema changes. No background jobs. No materialized tables. Compute-on-read throughout.

---

## 2. Global Invariants (All SIL-8 Surfaces)

These invariants are **non-negotiable** and apply to every endpoint defined in this spec. They supplement the platform-wide invariants in `docs/SYSTEM-INVARIANTS.md`.

### 2.1 Isolation

- All SERPSnapshot and KeywordTarget loads must include `WHERE projectId = resolvedProjectId` **at the DB query boundary**.
- No cross-project fetch followed by in-memory filtering.
- `resolveProjectId(request)` is called first, before any DB work, on every endpoint.
- Cross-project access on single-resource endpoints (those scoped by `:id`) → 404 non-disclosure.
- Cross-project access on project-list endpoints → returns that project's own data scoped to the resolved projectId.

### 2.2 Determinism

- Every top-N selection requires a fully specified, multi-field sort with a UUID tie-breaker as the final key.
- No sort that terminates before reaching a unique key.
- All computed scores are rounded to 2 decimal places using the existing `round()` helper before comparison or sort.
- No implicit DB ordering anywhere.

### 2.3 Window Anchor

- Any endpoint with time-window filtering computes `requestTime = new Date()` **exactly once per request**, before any DB work.
- All window boundaries (including multi-window endpoints) derive from this single `requestTime`.
- No secondary `new Date()` calls within the same request handler.

### 2.4 No New Math

- All SIL-8 scoring reuses existing normalized signals from `computeVolatility()`.
- `pairVolatilityScore` for a single pair is defined as `computeVolatility([snapshotA, snapshotB]).volatilityScore`. No new formula.
- Regime classification is a pure label derived from the existing `volatilityScore`. No new computation.

### 2.5 Extraction Reuse

- URL extraction always uses `extractOrganicResults` from `src/lib/seo/serp-extraction.ts`.
- Feature type extraction always uses `extractFeatureTypes` (inline in `volatility-service.ts`).
- No reimplementation of extraction logic in new route files.

### 2.6 Hammer Coverage

- Every new surface requires a `hammer-silN.ps1` module.
- Every new derived field requires boundary assertions in hammer (not just presence checks).
- Hammer discipline: exactly one PASS / FAIL / SKIP per test branch.

---

## 3. Sequencing

Implementation order (binding):

1. **B1** — Volatility Regime Classification (lowest effort, highest immediate UX value)
2. **A1** — URL Contribution Attribution
3. **A2** — Spike Detection
4. **B2** — Project Risk Index
5. **A3** — Feature Transition Matrix
6. **B4** — Volatility Momentum
7. **B3** — Competitive Pressure Detection (last; highest cardinality risk)

No surface may be started until all prior surfaces in this sequence have passing hammer coverage.

---

## 4. Track A — Deeper Diagnostics

---

### A1 — URL Contribution Attribution

**Endpoint:** `GET /api/seo/keyword-targets/:id/volatility-breakdown`

**Purpose:** Identify which URLs are driving rank volatility for a keyword.

**Isolation:** Single-resource. `resolveProjectId()` + `keywordTarget.projectId !== projectId` → 404.

**Query params:**
- `windowDays` — optional, integer 1–365. Same semantics as SIL-3.
- `topN` — optional, integer 1–50, default 20. Maximum URLs returned.

**Computation:**

Load SERPSnapshots for `(projectId, query, locale, device)` ordered `capturedAt ASC, id ASC`. Apply `windowDays` filter at DB level. Compute N-1 consecutive pairs.

For each URL observed across all pairs:

**`appearances`:** Count of consecutive pairs where the URL appears in **at least one** snapshot with a non-null rank. This includes pairs where the URL entered or exited the SERP — not only pairs where it moved in both.

**`totalAbsShift`:** Sum of absolute rank shifts **only** for pairs where the URL appears in **both** snapshots with non-null ranks. Pairs where the URL appears in only one snapshot contribute 0 to `totalAbsShift` but still increment `appearances`.

**`averageShift`:** `totalAbsShift / pairsBothPresent` where `pairsBothPresent` is the count of pairs contributing to `totalAbsShift`. If `pairsBothPresent = 0`, `averageShift = 0`.

**`firstSeen`:** `capturedAt` of the earliest snapshot in which the URL appears with a non-null rank.

**`lastSeen`:** `capturedAt` of the most recent snapshot in which the URL appears with a non-null rank.

**Deterministic sort (binding):**
1. `totalAbsShift DESC`
2. `url ASC`

`url` is unique per result set, so this sort is complete.

**Response shape:**
```json
{
  "keywordTargetId": "uuid",
  "query": "string",
  "windowDays": null,
  "sampleSize": 3,
  "urlCount": 12,
  "urls": [
    {
      "url": "https://example.com/page",
      "totalAbsShift": 42,
      "appearances": 3,
      "averageShift": 14.0,
      "firstSeen": "2025-01-01T00:00:00.000Z",
      "lastSeen": "2025-03-01T00:00:00.000Z"
    }
  ]
}
```

**Edge cases:**
- `sampleSize = 0` (fewer than 2 snapshots) → 200 with `urls: []`, `urlCount: 0`.
- No `topN` truncation applied before sort — sort first, then slice to `topN`.

**Hammer requirements:**
- 400 on invalid UUID, invalid `windowDays`, invalid `topN`.
- 404 on cross-project `:id`.
- `urls` is an array (may be empty).
- Sort order: `totalAbsShift` non-increasing; within equal `totalAbsShift`, `url` lexicographically ascending.
- `appearances >= 1` for every returned URL.
- `averageShift >= 0` for every returned URL.
- Determinism: two sequential calls return identical response body (excluding wall-clock fields `computedAt`).
- `appearances` definition: a URL that appears in only one of a pair still increments `appearances` (create fixture with entry/exit URLs to verify).

---

### A2 — Spike Detection

**Endpoint:** `GET /api/seo/keyword-targets/:id/volatility-spikes`

**Purpose:** Identify discrete high-volatility events rather than smoothed averages. Answer: "Was this a gradual drift or a single algorithm punch?"

**Isolation:** Single-resource. Same 404 pattern as A1.

**Query params:**
- `windowDays` — optional, integer 1–365.
- `topN` — optional, integer 1–10, default 3.

**`pairVolatilityScore` definition (no new math):**

```
pairVolatilityScore = computeVolatility([snapshotA, snapshotB]).volatilityScore
```

This applies the existing composite formula to a sampleSize=1 input. Produces a value in [0, 100], rounded to 2 decimal places. No new normalization, no new weights.

**Spike selection sort (binding, deterministic):**
1. `pairVolatilityScore DESC`
2. `toCapturedAt DESC`
3. `toSnapshotId DESC`

Rationale: score-first gives urgency order; `toCapturedAt DESC` gives recency priority among tied scores; `toSnapshotId DESC` is the UUID tie-breaker (UUID sort order is arbitrary but stable).

**Return semantics:**
- Return `min(topN, totalPairs)` spikes.
- If `sampleSize >= 1`, the `spikes` array is **never empty** (there is always at least 1 pair to return).
- If `sampleSize = 0`, return `spikes: []`.

**Per-spike fields:**
- `fromSnapshotId`, `toSnapshotId`
- `fromCapturedAt`, `toCapturedAt`
- `pairVolatilityScore` — composite score for this pair, 2 decimals
- `pairRankShift` — `averageRankShift` for this pair (mean abs shift across URLs present in both snapshots), 4 decimals
- `pairMaxShift` — `maxRankShift` for this pair
- `pairFeatureChangeCount` — symmetric difference of feature type sets
- `aiFlipped` — boolean

**Response shape:**
```json
{
  "keywordTargetId": "uuid",
  "query": "string",
  "windowDays": null,
  "sampleSize": 5,
  "totalPairs": 5,
  "topN": 3,
  "spikes": [
    {
      "fromSnapshotId": "uuid",
      "toSnapshotId": "uuid",
      "fromCapturedAt": "2025-02-01T00:00:00.000Z",
      "toCapturedAt": "2025-02-15T00:00:00.000Z",
      "pairVolatilityScore": 74.33,
      "pairRankShift": 12.5000,
      "pairMaxShift": 18,
      "pairFeatureChangeCount": 2,
      "aiFlipped": true
    }
  ]
}
```

**Hammer requirements:**
- 400 on invalid UUID, invalid `windowDays`, invalid `topN` (0 or > 10).
- 404 on cross-project `:id`.
- `spikes` never empty when `sampleSize >= 1`.
- `spikes` length = `min(topN, totalPairs)`.
- Sort order: `pairVolatilityScore` non-increasing across returned spikes.
- Each `pairVolatilityScore` in [0, 100].
- Determinism: two calls return identical spike array.
- `pairVolatilityScore` definition: create fixture with 2 snapshots, call `/volatility` (sampleSize=1), assert that `volatilityScore` equals `spikes[0].pairVolatilityScore` — they must be identical.

---

### A3 — Feature Transition Matrix

**Endpoint:** `GET /api/seo/keyword-targets/:id/feature-transitions`

**Purpose:** Expose structural SERP feature evolution. Track how feature sets change across consecutive snapshot pairs.

**Isolation:** Single-resource. Same 404 pattern as A1.

**Query params:**
- `windowDays` — optional, integer 1–365.

**Canonical feature set representation (binding):**

Feature types are extracted using the existing `extractFeatureTypes` logic. For each consecutive pair, two feature sets are produced: `fromFeatures` (snapshot A) and `toFeatures` (snapshot B).

- `fromFeatureSet` and `toFeatureSet` are **sorted arrays** of feature type strings, sorted **lexicographically ascending**.
- An empty set is represented as an empty array `[]` and serialized to key `""`.
- Grouping key:
  - `fromKey = fromSorted.join(",")` — comma-separated, no spaces
  - `toKey = toSorted.join(",")` — comma-separated, no spaces
  - `transitionKey = fromKey + "→" + toKey`

The separator character `→` (U+2192) is chosen to avoid ambiguity with comma-separated feature names. Feature type strings from DataForSEO do not contain this character.

**Deterministic output sort (binding):**
1. `count DESC`
2. `fromKey ASC`
3. `toKey ASC`

**Response shape:**
```json
{
  "keywordTargetId": "uuid",
  "query": "string",
  "windowDays": null,
  "sampleSize": 10,
  "totalTransitions": 10,
  "distinctTransitionCount": 4,
  "transitions": [
    {
      "fromFeatureSet": ["featured_snippet", "people_also_ask"],
      "toFeatureSet": ["people_also_ask"],
      "count": 4
    },
    {
      "fromFeatureSet": [],
      "toFeatureSet": ["featured_snippet"],
      "count": 3
    }
  ]
}
```

**Edge cases:**
- `sampleSize = 0` → 200 with `transitions: []`, `totalTransitions: 0`, `distinctTransitionCount: 0`.
- All pairs have empty feature sets on both sides → one transition entry `{fromFeatureSet: [], toFeatureSet: [], count: N}` (stable no-feature state is a valid transition).

**Hammer requirements:**
- 400 on invalid UUID, invalid `windowDays`.
- 404 on cross-project `:id`.
- `transitions` is an array (may be empty).
- Sort: `count` non-increasing; within equal `count`, `fromKey` then `toKey` ascending.
- `fromFeatureSet` and `toFeatureSet` are sorted arrays (no descending order within the set).
- `count` sum across all transitions equals `sampleSize` (every pair is classified).
- Determinism: two calls return identical transition array.
- Canonical key test: create two fixtures producing the same feature types in different insertion orders — assert they group to the same transition entry.

---

### A4 — AI Stability Model

**Endpoint:** `GET /api/seo/keyword-targets/:id/ai-stability`

**Purpose:** Expose AI Overview stability patterns beyond raw churn count. Answer: "Is AI overview chaotic, oscillatory, or converging?"

**Isolation:** Single-resource. Same 404 pattern as A1.

**Query params:**
- `windowDays` — optional, integer 1–365.

**All streak metrics are expressed in snapshot-pair counts (not wall-clock durations).**

**Field definitions (binding):**

- `longestStableRun`: maximum count of consecutive pairs where `aiOverviewFlipped = false`.
- `longestVolatileStreak`: maximum count of consecutive pairs where each pair had `aiOverviewFlipped = true`.
- `currentRunLength`: count of consecutive pairs from the most recent pair backwards sharing the same flip state as the most recent pair.
- `currentRunState`: `"stable"` if the most recent pair had no flip; `"volatile"` if it did.
- `totalFlips`: total count of pairs where `aiOverviewFlipped = true` (equals `aiOverviewChurn` from SIL-3).
- `flipRatio`: `totalFlips / sampleSize`, rounded to 4 decimal places. `null` if `sampleSize = 0`.

No time-to-stabilization duration fields. Operators can derive real-time durations from `capturedAt` timestamps in SIL-6 if needed.

**Response shape:**
```json
{
  "keywordTargetId": "uuid",
  "query": "string",
  "windowDays": null,
  "sampleSize": 10,
  "longestStableRun": 4,
  "longestVolatileStreak": 2,
  "currentRunLength": 3,
  "currentRunState": "stable",
  "totalFlips": 3,
  "flipRatio": 0.3000,
  "computedAt": "2025-03-01T00:00:00.000Z"
}
```

**Edge cases:**
- `sampleSize = 0` → all count fields 0, `currentRunState: null`, `flipRatio: null`.
- All pairs stable → `longestVolatileStreak = 0`, `currentRunState = "stable"`.
- All pairs volatile → `longestStableRun = 0`, `currentRunState = "volatile"`.

**Hammer requirements:**
- 400 on invalid UUID, invalid `windowDays`.
- 404 on cross-project `:id`.
- `currentRunState` is `"stable"`, `"volatile"`, or `null` only.
- `longestStableRun + longestVolatileStreak <= sampleSize` (they cannot together exceed total pairs).
- `totalFlips` equals `aiOverviewChurn` returned by `/volatility` for same params — assert cross-endpoint consistency.
- `flipRatio = totalFlips / sampleSize` (verify arithmetic, 4 decimals).
- `currentRunLength <= sampleSize`.
- Determinism: two calls return identical all fields except `computedAt`.

---

## 5. Track B — Operator Decision Tooling

---

### B1 — Volatility Regime Classification

**Surfaces affected:** `GET /api/seo/keyword-targets/:id/volatility` and `GET /api/seo/volatility-alerts`

**New field:** `volatilityRegime: "calm" | "shifting" | "unstable" | "chaotic"`

**Regime mapping (on rounded `volatilityScore`, 2 decimal places — binding):**

```
calm:     volatilityScore >= 0.00  AND volatilityScore <= 20.00
shifting: volatilityScore >  20.00 AND volatilityScore <= 50.00
unstable: volatilityScore >  50.00 AND volatilityScore <= 75.00
chaotic:  volatilityScore >  75.00
```

Boundary exactness: `20.00 → calm`. `20.01 → shifting`. `50.00 → shifting`. `50.01 → unstable`. `75.00 → unstable`. `75.01 → chaotic`.

Since `volatilityScore` is always rounded to 2 decimal places, these boundary comparisons are exact (no floating-point ambiguity at these values).

**Implementation:** Pure derived field. Add `classifyRegime(volatilityScore: number): VolatilityRegime` to `volatility-service.ts`. No schema change. No new DB query. Surfaced alongside `maturity` in both affected endpoints and in `AlertItem`.

**Hammer requirements (B1):**
- Field `volatilityRegime` present on `/volatility` response.
- Field `volatilityRegime` present on each item in `/volatility-alerts` response.
- Enum exact: value is one of exactly `["calm", "shifting", "unstable", "chaotic"]`.
- Boundary exactness:
  - Create fixture producing `volatilityScore = 0.00` → assert `calm`.
  - Existing SIL-3 bulk-insert fixture (sampleSize >= 20, score known) → assert correct regime.
  - Create fixture with controlled snapshots producing score in `(20.00, 50.00]` → assert `shifting`.
  - If feasible, create fixture producing score in `(50.00, 75.00]` → assert `unstable`.
- Determinism: two sequential calls return identical `volatilityRegime`.

---

### B2 — Project Risk Index

**Endpoint:** `GET /api/seo/volatility-summary` (extend existing SIL-4 endpoint)

**New fields added to existing response:**

**`weightedProjectVolatilityScore`:** Mean `volatilityScore` across all active keywords (sampleSize >= 1), weighted equally. Rounded to 2 decimals. `null` if `activeKeywordCount = 0`.

**`top3RiskKeywords`:** Array of up to 3 items from the active keyword set with highest `volatilityScore`.

Sort for `top3RiskKeywords` (binding, deterministic):
1. `volatilityScore DESC`
2. `query ASC`
3. `keywordTargetId ASC`

Always an array. Empty array if `activeKeywordCount = 0`. Length = `min(3, activeKeywordCount)`.

Per-item fields: `keywordTargetId`, `query`, `locale`, `device`, `volatilityScore`, `maturity`, `volatilityRegime`.

**`volatilityConcentrationRatio`:** `top3VoaltilitySum / totalVolatilitySum` where:
- `top3VolatilitySum` = sum of `volatilityScore` across `top3RiskKeywords`
- `totalVolatilitySum` = sum of `volatilityScore` across all active keywords

Division-by-zero rule: if `totalVolatilitySum = 0` (all active keywords have `volatilityScore = 0`, or `activeKeywordCount = 0`), return `volatilityConcentrationRatio = null`. Never return 0 or 1 in this case — `null` explicitly signals "no meaningful concentration data."

Rounded to 4 decimal places when non-null.

**Hammer requirements (B2):**
- New fields present on `/volatility-summary`.
- `top3RiskKeywords` is an array, length 0–3.
- `top3RiskKeywords` sort: `volatilityScore` non-increasing; equal scores sorted by `query` then `keywordTargetId` ascending.
- `volatilityConcentrationRatio` is null or a number in [0, 1].
- If `activeKeywordCount = 0`: `volatilityConcentrationRatio = null`, `top3RiskKeywords = []`.
- Arithmetic check: `volatilityConcentrationRatio * totalVolatilitySum ≈ top3VolatilitySum` (tolerance 0.01, for rounding).
- Determinism: two calls return identical new fields.

---

### B3 — Competitive Pressure Detection

**Endpoint:** `GET /api/seo/competitor-pressure`

**Purpose:** Identify URLs that repeatedly enter the top positions across multiple keywords in the project, signaling emerging competitors.

**⚠️ Cardinality warning (binding):**

This endpoint has **O(K × S × R)** memory cost where:
- K = keyword count in project
- S = snapshot count per keyword in window
- R = organic results per snapshot (typical 10–20)

At K=100, S=500 (windowed), R=20: peak in-memory object count approaches 1,000,000. This is qualitatively different from all other SIL surfaces. **Implement last. Only after A1 is stable and validated.**

**`windowDays` is required for this endpoint.** Range: 1–90. Return 400 if absent or out of range. This is a deliberate deviation from other SIL endpoints where `windowDays` is optional. Rationale: unbounded full-history scans are operationally dangerous at this cardinality.

**Isolation (binding):**

All SERPSnapshot loads must include `WHERE projectId = resolvedProjectId` at the DB query boundary. No post-load filtering. `resolveProjectId()` called first.

**"Top 3" definition (binding):**

Use `extractOrganicResults` from `src/lib/seo/serp-extraction.ts` with `topN = 3`. Do not reimplement extraction logic. Reuse ensures behavioral consistency with SIL-6.

**Computation:**

1. Load all KeywordTargets for project.
2. Load all SERPSnapshots for project within `windowDays` (`WHERE projectId = $pid AND capturedAt >= windowStart`), ordered `capturedAt ASC, id ASC`.
3. Group snapshots by `(query, locale, device)`.
4. For each snapshot, extract top-3 organic URLs.
5. For each URL, across all snapshots and keywords where it appears in top-3:
   - `keywordsImpacted`: count of distinct `keywordTargetId` values where URL appeared in top-3 in at least one snapshot.
   - `totalAppearances`: count of snapshots (across all keywords) where URL appeared in top-3.
   - `averageShiftCaused`: mean absolute rank shift for this URL across all pairs (any keyword) where it appeared in both snapshots of a pair within top-3.
   - `firstSeen`: earliest `capturedAt` where URL appeared in top-3 (any keyword).
   - `lastSeen`: most recent `capturedAt` where URL appeared in top-3 (any keyword).

**Deterministic sort (binding):**
1. `keywordsImpacted DESC`
2. `totalAppearances DESC`
3. `url ASC`

**Query params:**
- `windowDays` — **required**, integer 1–90.
- `minKeywordsImpacted` — optional, integer 1–K, default 2. Filters to URLs impacting at least this many keywords.
- `topN` — optional, integer 1–50, default 20.

**Hammer requirements (B3):**
- 400 if `windowDays` absent.
- 400 if `windowDays` < 1 or > 90.
- 400 on invalid `minKeywordsImpacted`.
- Isolation: create two projects, populate snapshots with a shared URL in both. Verify URL does not appear in project A's results when called with project A's headers (it cannot — all loads are projectId-scoped, so cross-project URLs are invisible by construction).
- Sort order: `keywordsImpacted` non-increasing; ties by `totalAppearances` non-increasing; ties by `url` ascending.
- `keywordsImpacted >= minKeywordsImpacted` for every returned item.
- Determinism: two calls with same params return identical response.

---

### B4 — Volatility Momentum

**Endpoint:** `GET /api/seo/keyword-targets/:id/volatility-momentum`

**Purpose:** Surface whether volatility is accelerating or decelerating. Help operators act before alerts explode.

**Isolation:** Single-resource. Same 404 pattern as A1.

**No query params.** Windows are fixed: current 30 days and prior 30 days relative to `requestTime`.

**Single anchor computation (binding):**

```
requestTime  = new Date()               // computed exactly once, before any DB work
window1Start = requestTime - 30d        // current window start
window2Start = requestTime - 60d        // prior window start
window2End   = window1Start             // exclusive upper bound for prior window
```

Partition rules:
- **Current window:** `capturedAt >= window1Start AND capturedAt < requestTime`
- **Prior window:** `capturedAt >= window2Start AND capturedAt < window1Start`

A snapshot at exactly `window1Start` is in the **prior window**, not the current window. No snapshot appears in both windows. No snapshot is excluded from both due to floating boundary drift.

**Query strategy (binding):** Issue one DB query with `capturedAt >= window2Start`, partition in-memory by `>= window1Start`. One DB round-trip, not two.

**Fields:**

- `currentVolatilityScore`: `volatilityScore` computed from current-window snapshots. `null` if `currentSampleSize = 0`.
- `priorVolatilityScore`: `volatilityScore` computed from prior-window snapshots. `null` if `priorSampleSize = 0`.
- `currentSampleSize`: number of pairs in current window.
- `priorSampleSize`: number of pairs in prior window.
- `momentumDelta`: `currentVolatilityScore - priorVolatilityScore`, rounded to 2 decimals. `null` if either score is null.
- `momentumDirection`: `"accelerating"` if `momentumDelta > 0`; `"decelerating"` if `momentumDelta < 0`; `"stable"` if `momentumDelta = 0.00`; `null` if `momentumDelta` is null.
- `currentVolatilityRegime`: regime classification of `currentVolatilityScore`. `null` if null score.
- `priorVolatilityRegime`: regime classification of `priorVolatilityScore`. `null` if null score.

**Response shape:**
```json
{
  "keywordTargetId": "uuid",
  "query": "string",
  "windowDays": 30,
  "currentWindow": {
    "start": "2025-02-01T00:00:00.000Z",
    "end": "2025-03-01T00:00:00.000Z",
    "sampleSize": 8,
    "volatilityScore": 62.14,
    "volatilityRegime": "unstable"
  },
  "priorWindow": {
    "start": "2025-01-01T00:00:00.000Z",
    "end": "2025-02-01T00:00:00.000Z",
    "sampleSize": 6,
    "volatilityScore": 41.50,
    "volatilityRegime": "shifting"
  },
  "momentumDelta": 20.64,
  "momentumDirection": "accelerating",
  "computedAt": "2025-03-01T00:00:00.000Z"
}
```

**Edge cases:**
- `currentSampleSize = 0` and `priorSampleSize = 0` → all score/regime/momentum fields null, 200 response.
- `currentSampleSize >= 1` but `priorSampleSize = 0` → `priorVolatilityScore = null`, `momentumDelta = null`, `momentumDirection = null`.
- `momentumDelta = 0.00` exactly → `momentumDirection = "stable"`.

**Hammer requirements (B4):**
- 400 on invalid UUID.
- 404 on cross-project `:id`.
- `momentumDirection` is one of `["accelerating", "decelerating", "stable", null]`.
- If `momentumDelta` is non-null: `momentumDelta = currentVolatilityScore - priorVolatilityScore` (arithmetic check, tolerance 0.01).
- Single-anchor test: both window boundaries are consistent with one `requestTime` — verify via `currentWindow.end ≈ priorWindow.end + 30d` and `currentWindow.start = priorWindow.end` (check ISO strings match).
- Determinism: two sequential calls return identical `momentumDelta`, `momentumDirection`, `currentSampleSize`, `priorSampleSize` (not `computedAt`).
- Regime consistency: `currentVolatilityRegime` matches `classifyRegime(currentVolatilityScore)` (cross-assert with B1 regime boundaries).

---

## 6. Surfaces Summary

| ID | Endpoint | Type | Track | Schema Change |
|----|----------|------|-------|---------------|
| B1 | Extends `/volatility` + `/volatility-alerts` | Field addition | Decision | None |
| A1 | `/api/seo/keyword-targets/:id/volatility-breakdown` | New endpoint | Diagnostic | None |
| A2 | `/api/seo/keyword-targets/:id/volatility-spikes` | New endpoint | Diagnostic | None |
| B2 | Extends `/api/seo/volatility-summary` | Field addition | Decision | None |
| A3 | `/api/seo/keyword-targets/:id/feature-transitions` | New endpoint | Diagnostic | None |
| B4 | `/api/seo/keyword-targets/:id/volatility-momentum` | New endpoint | Decision | None |
| B3 | `/api/seo/competitor-pressure` | New endpoint | Decision | None |

All surfaces: compute-on-read, no writes, no EventLog, no schema migration, no background jobs.

---

## 7. What This Spec Does Not Cover

- Materialized volatility tables (warranted only if per-keyword snapshot counts exceed ~500)
- Keyword clustering or entity-level aggregation (SIL-8 is keyword-level)
- LLM integration on any of these surfaces
- GraphRAG traversal from these surfaces
- Dashboard UI rendering

These remain deferred per `docs/ROADMAP.md`.
