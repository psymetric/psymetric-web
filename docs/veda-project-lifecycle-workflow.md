# Veda Project Lifecycle Workflow

This document defines the lifecycle workflow for projects managed within **Veda**.

The goal is to create a disciplined, repeatable process that moves a project from initial concept through mature SERP observation while preserving Veda's architectural invariants.

Core invariants:

- compute-on-read
- deterministic ordering
- operator-controlled ingest
- no silent mutation by LLM systems
- propose → review → apply workflow

This workflow ensures every project follows the same operational path from:

concept → research → observation → mature monitoring

---

# Terminology

PsyMetric and Veda refer to two layers of the same system.

**PsyMetric** is the internal system and codebase. All code-level entities, database models, API endpoints, and SIL layer references use PsyMetric naming conventions. When reading source code, migrations, or technical documentation, PsyMetric is the correct name.

**Veda** is the operator-facing product layer built on top of PsyMetric. When describing the product experience, workflow, and operator posture, Veda is the correct name.

Code-level entities always use internal naming:

- `KeywordTarget` — a tracked keyword within a project
- `SERPSnapshot` — a captured SERP observation record
- SIL layers — the Search Intelligence Layer architecture within PsyMetric

This document uses both names where appropriate. PsyMetric when referencing implementation details; Veda when describing operator experience.

---

# Lifecycle Overview

Projects in Veda move through the following lifecycle states:

```
created → draft → researching → targeting → observing → developing → seasoned
                                                       ↘ paused → archived
                                         ↑_________________________|
                                      (seasoned → targeting for major revision)
```

Each state represents a distinct operational posture and determines what actions and system outputs are expected.

Full ordered state sequence:

```
created
draft
researching
targeting
observing
developing
seasoned
paused
archived
```

---

# Lifecycle State Machine

## Allowed Transitions

The following table defines all valid state transitions and the trigger required to move between them. Transitions not listed here are not permitted by the system.

| FROM | TO | TRIGGER |
|---|---|---|
| `created` | `draft` | Operator begins project configuration |
| `draft` | `researching` | Operator initiates keyword discovery run |
| `researching` | `targeting` | Candidate keyword set is ready for review |
| `targeting` | `observing` | Operator confirms `KeywordTarget` set |
| `observing` | `developing` | Maturity threshold reached (see thresholds below) |
| `developing` | `seasoned` | Stability threshold reached (see thresholds below) |
| `observing` | `paused` | Operator pauses observation |
| `developing` | `paused` | Operator pauses observation |
| `seasoned` | `paused` | Operator pauses observation |
| `paused` | `observing` | Operator resumes observation |
| `paused` | `archived` | Operator permanently archives project |
| `seasoned` | `targeting` | Operator initiates major keyword set revision |

## Transition Rules

All transitions are **operator-initiated** unless explicitly noted as threshold-based.

Threshold-based transitions (`observing → developing`, `developing → seasoned`) are computed on read. The system evaluates whether the current data satisfies the thresholds when the operator requests the project status. No background job computes or applies these transitions automatically. The operator reviews the computed status and applies the transition.

The `seasoned → targeting` transition is explicitly permitted to allow mature projects to revisit and revise their tracked keyword set without requiring archival and re-creation. When this transition occurs, the existing observation history is preserved. The project returns to `targeting` to select a revised set and then re-enters `observing`.

The `paused → observing` transition restores the project to its pre-pause state. Observation history is fully intact. No snapshots are collected during the `paused` period.

---

# Maturity Thresholds

Lifecycle transitions from `observing → developing` and `developing → seasoned` are based on quantitative maturity thresholds derived from the volatility maturity model already present in PsyMetric.

The volatility maturity model classifies individual `KeywordTarget` observation depth as:

```
preliminary   sampleSize 0–4
developing    sampleSize 5–19
stable        sampleSize ≥ 20
```

Project-level lifecycle thresholds aggregate across all `KeywordTarget` records in the project.

## Observing → Developing

The project has sufficient early signal to produce directional analysis.

**Requirements:**

- `sampleSize ≥ 5` for at least **50% of `KeywordTargets`** in the project
- At least one full observation cycle has completed across the tracked set

At this threshold, volatility surfaces begin producing meaningful early signals. The `preliminary` maturity label will still appear on newer or lower-frequency keywords.

## Developing → Seasoned

The project has reached operational maturity. Analysis is reliable and actionable.

**Requirements:**

- `sampleSize ≥ 20` for at least **80% of `KeywordTargets`** in the project
- Observation span of **at least 30 calendar days** since the first snapshot in the project
- At least one volatility alert cycle has been reviewable

At this threshold, the full SIL analysis stack is producing stable outputs. Operator posture shifts from active monitoring to maintenance and strategic review.

## Threshold Configurability

These thresholds are operational guidelines, not hard system constraints. They represent sensible defaults for most projects and can be adjusted per project by the operator based on:

- keyword set size and diversity
- ingest cadence
- acceptable signal confidence
- client or business requirements

The system computes whether thresholds are met on demand. The operator decides when to apply the transition.

---

# Stage Definitions

## Created

The project record exists in the system but configuration has not started.

This state allows projects to be registered in Veda before the operator is ready to begin setup work — for example, a client project created in advance of a kickoff call.

### Inputs

- project name (minimum required)

### Outputs

- project record created in PsyMetric
- project appears in operator dashboard

### Notes

No metadata, domain, or keyword configuration is expected at this stage. The project is a placeholder. No SIL surfaces are active.

---

## Draft

The operator is actively configuring the project but research has not started.

This state covers the full setup phase: domain registration, metadata entry, team assignment, and integration configuration.

### Inputs

- project name
- domain
- description
- category / niche
- operator / owner

### Outputs

- project record fully configured
- metadata stored
- ready for research

### Operator Tasks

- register domain
- configure project email
- create Veda project record
- add project to ops tracker

---

## Researching

Wide keyword discovery and market reconnaissance phase.

Large keyword sets are generated but **not yet tracked**.

### Inputs

- seed keywords
- competitor domains
- category descriptors

### Outputs

- candidate keyword pool
- topic clusters
- competitor landscape

### Notes

Discovery keywords **must not automatically become `KeywordTargets`**.

This stage focuses on exploration and clustering. The output is a candidate set for operator review, not a committed tracking set. Generating a large candidate pool is expected and encouraged at this stage — filtering happens in Targeting.

---

## Targeting

Discovery results are filtered and converted into a strategic set of tracked keywords.

### Inputs

- candidate keyword pool
- cluster groupings
- operator review

### Outputs

- selected keyword targets
- confirmed tracking set

### Typical Target Size

```
50–200 keywords
```

### Selection Categories

Examples:

- core money terms
- high intent buyer terms
- category defining keywords
- informational authority terms
- competitor comparison queries

### Result

Creation of `KeywordTarget` entities within PsyMetric.

This is the point at which candidates become tracked records. The operator reviews the candidate pool, applies strategic filters, and confirms the final set. The transition to `observing` is triggered by this confirmation.

---

## Observing

Repeated snapshot ingest builds a time-series dataset.

This stage begins immediately after `KeywordTarget` confirmation. The first snapshots captured in this stage establish the baseline observation state — there is no separate baselining stage. The volatility maturity model handles early-observation uncertainty via the `preliminary` maturity label.

### Inputs

- operator-triggered snapshot ingest
- observation cadence

### Outputs

- `SERPSnapshot` records
- SERP deltas
- early volatility signals
- feature transitions
- domain dominance changes
- intent drift
- similarity shifts
- initial intent surface

### Characteristics

Project is actively monitored but patterns are still emerging. Many computed surfaces will show `preliminary` maturity at the start of this stage. This is expected.

The `preliminary` label from the volatility maturity model communicates data confidence directly to the operator without requiring a separate lifecycle state for early observation. As ingest continues, keywords will graduate from `preliminary` to `developing` to `stable` individually, reflecting their actual observation depth.

---

## Developing

The project now has sufficient history for meaningful analysis.

The maturity threshold for entering this stage is met when at least 50% of `KeywordTargets` have `sampleSize ≥ 5`. At this point the full analysis stack begins producing directional and actionable outputs.

### Outputs

- volatility summary
- alert generation
- risk attribution
- operator reasoning (SIL-11)
- briefing packets

### Questions Now Answerable

- which keywords are unstable
- what caused volatility
- competitor movement
- feature landscape changes
- intent drift patterns

The observatory begins producing actionable insights. Alert thresholds become meaningful. The operator shifts from "is data accumulating" to "what is the data showing."

---

## Seasoned

The mature operational state.

The maturity threshold for entering this stage is met when at least 80% of `KeywordTargets` have `sampleSize ≥ 20` and the project has at least 30 calendar days of observation history.

### Characteristics

- stable keyword set
- tuned alert thresholds
- long observation history
- meaningful volatility metrics
- reliable reasoning output

### Outputs

- project health summary
- risk posture
- dominant domains
- long-term SERP behavior patterns

Operator posture shifts from discovery to maintenance. The system is producing strategic intelligence rather than early signals.

A seasoned project may return to `targeting` when a major keyword set revision is required — for example, a category expansion, a product line change, or a significant shift in competitive landscape. This transition preserves all existing observation history.

---

## Paused

Observation temporarily halted.

### Use Cases

- project deprioritized
- ingest paused pending operator decision
- investigation on hold
- budget pause

Snapshots are not actively collected. No SIL computations change. All existing data remains intact and queryable. The project can be resumed by the operator at any time, returning it to the state it was in before pausing.

---

## Archived

Project is permanently inactive.

Data remains available and fully queryable but no further observation occurs. The project cannot be resumed from `archived` state. If reactivation is required, a new project should be created.

---

# Operational Workflow

The complete workflow for onboarding and operating a project:

```
1.  Create project record (created)
2.  Add domain + metadata (draft)
3.  Run keyword discovery (researching)
4.  Cluster and filter keywords (researching)
5.  Select target set (targeting)
6.  Confirm KeywordTargets (targeting → observing)
7.  Run initial SERP snapshot ingest (observing)
8.  Review early observations (observing)
9.  Continue operator snapshot ingest (observing)
10. Monitor early signals as maturity grows (observing → developing)
11. Review alerts, volatility, and reasoning outputs (developing)
12. Refine alert thresholds and target set as needed (developing)
13. Reach stable long-term monitoring posture (developing → seasoned)
14. Maintain and monitor with strategic cadence (seasoned)
```

---

# Data Scale Guidance

Keyword research can generate thousands of candidates.

Recommended practice:

```
discover thousands
track hundreds
```

Example workflow:

```
1,000 discovery keywords
        ↓
cluster and filter
        ↓
150 tracked targets
```

This keeps observation costs and noise manageable. The separation between `researching` (discovery at scale) and `targeting` (strategic selection) is the architectural mechanism that enforces this discipline. Discovery candidates should not automatically propagate into `KeywordTarget` records — operator review is required.

---

# Cost Model Considerations

Example DataForSEO pricing:

```
~$0.0006 per SERP request
```

Example operating costs:

```
200 keywords daily ≈ $0.12/day ≈ $3.60/month
```

Large-scale ingestion should remain intentional and operator-controlled. The lifecycle model reinforces this: ingest is triggered by operator action, not by background automation. Cost scales with operator decisions, not with system behavior.

---

# Relationship to SIL Architecture

The lifecycle integrates with the existing Search Intelligence Layer (SIL) architecture within PsyMetric:

```
SIL-1   Observation Ledger
SIL-2   SERP Deltas
SIL-3   Keyword Volatility
SIL-4   Project Volatility Summary
SIL-5   Volatility Alerts
SIL-6   SERP History
SIL-7   Attribution Components
SIL-8   Diagnostics
SIL-9   Compute-on-read Alerts
SIL-10  Temporal Risk Attribution
SIL-11  Operator Reasoning
```

Lifecycle stages determine **when these surfaces become meaningful**.

```
created / draft     →  no SIL surfaces active
researching         →  no SIL surfaces active
targeting           →  KeywordTargets registered; SIL-1 ready for ingest
observing           →  SIL-1, SIL-2, SIL-6 active; preliminary maturity
developing          →  SIL-3 through SIL-9 producing actionable outputs
seasoned            →  SIL-10, SIL-11 producing strategic intelligence
```

The maturity thresholds defined above correspond directly to the volatility maturity model used throughout the SIL stack:

```
preliminary  (sampleSize 0–4)    →  observing stage
developing   (sampleSize 5–19)   →  developing stage
stable       (sampleSize ≥ 20)   →  seasoned stage
```

This alignment is intentional. The lifecycle state and the per-keyword maturity label communicate the same underlying signal at different granularities — project level and keyword level respectively.

---

# LLM Interaction Rules

LLM systems may assist with:

- keyword clustering proposals
- research summarization
- target selection recommendations
- reasoning synthesis (SIL-11 Operator Reasoning Layer)

LLM systems **may not**:

- create `KeywordTarget` records automatically
- mutate tracked keyword sets silently
- suppress or modify alerts
- change project lifecycle state autonomously
- trigger snapshot ingest

All mutation must follow:

```
Propose → Review → Apply
```

This constraint applies at every stage of the lifecycle. LLM outputs are advisory. Operator confirmation is required before any system state changes.

---

# Key Principle

Veda is not simply a keyword tracker.

It is a **SERP observatory control system**.

The lifecycle workflow ensures each project moves from:

```
concept → reconnaissance → observation → long-term monitoring
```

in a structured and repeatable way.

The operator is always in control. The system produces intelligence. The operator decides what to do with it.
