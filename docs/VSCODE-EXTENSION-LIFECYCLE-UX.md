# Veda VS Code Extension — Lifecycle UX

**Status:** Future Vision (not active development)
**Last updated:** March 2026
**Companion documents:**
- `docs/VSCODE-EXTENSION-SPEC.md` — technical architecture, feature ladder, API contract
- `docs/veda-project-lifecycle-workflow.md` — lifecycle state definitions, transition rules, maturity thresholds

---

## Purpose

This document defines how the Project Lifecycle model should appear and behave inside the Veda VS Code extension user interface.

The lifecycle model acts as a **UX orchestration layer**, determining:

- which observatory surfaces are emphasized
- which operator actions are available
- what the operator should do next
- which signals are meaningful at the current stage

The goal is to guide the operator without introducing workflow bureaucracy or automation.

The extension should feel like **mission control**, not a dashboard.

This document does not redefine lifecycle state logic. All lifecycle state definitions, allowed transitions, and maturity thresholds are canonical in `docs/veda-project-lifecycle-workflow.md`. This document specifies only how those states are surfaced and rendered in the VS Code extension UI.

---

## Core UX Principles

### 1. Operator-first workflow

The extension must always preserve operator control.

No lifecycle transitions or mutations should happen automatically.

All state changes must be:

- visible
- explicit
- operator-confirmed

The lifecycle system is advisory and contextual, not autonomous.

### 2. Lifecycle as UI context

Lifecycle state determines which surfaces and actions are emphasized in the interface.

The lifecycle does not introduce new system logic. It only affects how information is presented. All data the extension reads is fetched from the VEDA API — no direct database access, no local computation.

### 3. Next Valid Action

The extension should always display the next valid operator action for the current lifecycle state.

Examples:

```
Next Action:
Confirm 124 proposed keyword targets
```

```
Next Action:
Review 3 volatility alerts
```

```
Next Action:
Run initial SERP snapshot ingest
```

This prevents operator confusion and removes the need for step-by-step wizards. The next action is derived from lifecycle state — it does not require inference or LLM assistance.

### 4. Signal gating

Observatory signals should only appear when they are meaningful. Showing a volatility score during `researching` produces noise and erodes operator trust in the system. Hiding irrelevant surfaces keeps the operator focused on what matters now.

This is presentation-layer gating only. The underlying API endpoints remain available regardless of lifecycle state.

---

## Lifecycle States Recognized

The VS Code extension recognizes the following project lifecycle states:

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

These match the states defined in `docs/veda-project-lifecycle-workflow.md` exactly. The extension never computes lifecycle state — it reads the state from the API and renders accordingly.

---

## Project Header / Context Panel

The project header should display lifecycle context immediately when a project is opened. This panel is always visible regardless of lifecycle state.

**Example layout:**

```
Project: example-project
Domain:  example.com

Lifecycle:  Observing
Maturity:   Preliminary (42% of targets at sampleSize ≥ 5)

Next Action:
Run SERP snapshot ingest — 87 targets pending first observation
```

**Fields displayed:**

| Field | Source |
|---|---|
| Project Name | Project metadata |
| Domain | Project metadata |
| Lifecycle State | Project record |
| Volatility Maturity | Computed from `KeywordTarget` sampleSize distribution |
| Maturity Progress | Percentage of targets meeting current threshold |
| Next Valid Action | Derived from lifecycle state (see per-state definitions below) |

Maturity progress is shown as a percentage and gives operators a sense of how close the project is to the next lifecycle threshold — without requiring them to navigate to a separate view.

---

## Stage-Aware Action Panels

The extension should only emphasize actions that make sense for the current lifecycle stage. Irrelevant surfaces should be hidden or visually de-emphasized — not removed entirely, as operators may need to navigate out of sequence in unusual circumstances.

---

### Created

**Operator posture:** Project exists but configuration has not started.

**Primary focus:** Project setup

**Next Action displayed:**
```
Configure project metadata and domain to begin setup
```

**Available actions:**
- Configure project metadata
- Attach domain
- Begin draft setup (transition: created → draft)

**Observatory signals:** Not shown. No `KeywordTarget` records exist.

---

### Draft

**Operator posture:** Actively configuring the project.

**Primary focus:** Project configuration

**Next Action displayed:**
```
Complete project configuration and prepare seed keywords
```

**Available actions:**
- Configure project settings
- Prepare seed keywords
- Move to Researching (transition: draft → researching)

**Observatory signals:** Not shown. Configuration is in progress.

---

### Researching

**Operator posture:** Wide keyword discovery and market reconnaissance.

**Primary focus:** Keyword discovery

**Next Action displayed:**
```
Review candidate keyword clusters and select targets
```

**Available actions:**
- Run keyword discovery
- View candidate keywords
- Review keyword clusters
- Promote to Targeting (transition: researching → targeting)

**Hidden or de-emphasized:**
- Volatility surfaces
- Alerts
- Attribution diagnostics
- SERP history

These signals are not yet meaningful. No `KeywordTarget` records have been confirmed. Showing them here would confuse the operator.

---

### Targeting

**Operator posture:** Filtering discovery results into a confirmed tracking set.

**Primary focus:** Keyword selection

**Next Action displayed:**
```
Review proposed targets and confirm KeywordTarget set
```

**Available actions:**
- Review proposed targets
- Confirm `KeywordTarget` records
- Begin Observation (transition: targeting → observing)

**Observatory signals:** Minimal. `KeywordTarget` records now exist but no snapshots have been captured yet. The extension may show the confirmed target count and categories as configuration context.

---

### Observing

**Operator posture:** Building a time-series dataset through repeated snapshot ingest.

**Primary focus:** SERP observation

**Next Action displayed (varies by data state):**

When fewer than 50% of targets have `sampleSize ≥ 1`:
```
Run initial SERP snapshot ingest — N targets pending first observation
```

When initial snapshots exist:
```
Continue snapshot ingest — build observation history
```

**Available actions:**
- Run snapshot ingest
- View SERP deltas
- Inspect preliminary volatility
- Review feature transitions

**Observatory signals shown:**
- SERPSnapshot counts per keyword
- Early SERP deltas (SIL-2)
- Preliminary volatility scores with `preliminary` maturity label visible
- Feature transition counts

**Notes:** Most signals will carry `preliminary` maturity at the start of this stage. The extension should render the maturity label prominently so operators understand the confidence level of early data. This is expected behavior, not an error state.

---

### Developing

**Operator posture:** Sufficient observation history for meaningful analysis.

**Primary focus:** SERP analysis

**Next Action displayed:**
```
Review volatility alerts — N active alerts require attention
```

or, when no active alerts:
```
Review volatility summary for keyword instability patterns
```

**Available actions:**
- Review volatility summary (SIL-4)
- Inspect active alerts (SIL-5, SIL-9)
- View attribution diagnostics (SIL-7, SIL-8)
- Generate operator briefing (SIL-11)
- Review SERP history (SIL-6)

**Observatory signals shown:** All active SIL surfaces (SIL-1 through SIL-9 and SIL-11). Signals now carry `developing` or `stable` maturity on most keywords.

---

### Seasoned

**Operator posture:** Long-term monitoring. System producing strategic intelligence.

**Primary focus:** Long-term monitoring and maintenance

**Next Action displayed:**
```
Review project health summary and top volatile keywords
```

**Available actions:**
- Review project health
- Inspect top volatile keywords
- Review risk attribution (SIL-10)
- View operator reasoning (SIL-11)
- Revise keyword targets (transition: seasoned → targeting)

**Observatory signals shown:** Full SIL stack including SIL-10 (Temporal Risk Attribution) and SIL-11 (Operator Reasoning). The extension should emphasize long-term pattern surfaces over immediate alerts at this stage.

---

### Paused

**Operator posture:** Observation temporarily halted.

**Primary focus:** Project temporarily inactive

**Next Action displayed:**
```
Resume observation or archive this project
```

**Available actions:**
- Resume Observation (transition: paused → observing)
- Archive Project (transition: paused → archived)

**Snapshot ingest:** Disabled. The ingest trigger should not appear.

**Observatory signals:** Historical data remains visible and queryable. All previously collected SIL surfaces are readable. The extension should display a clear `PAUSED` indicator in the project header so operators do not mistake the absence of new data for a system error.

---

### Archived

**Operator posture:** Project is permanently inactive. Historical data access only.

**Primary focus:** Historical data

**Available actions:** None that mutate state. Read-only access to all historical data.

**Observatory signals:** All collected data remains visible. The extension should display a `ARCHIVED — READ ONLY` indicator. No ingest controls, no lifecycle transition buttons, and no alert surfaces should appear. The project record is queryable but cannot be changed.

---

## Lifecycle Transitions

Lifecycle transitions must always be explicit. They are never triggered automatically.

**Transition UI pattern:**

```
Lifecycle: Researching

Available Transitions:
→ Move to Targeting
→ Pause Project
→ Archive Project

[Each transition requires operator confirmation before applying]
```

All transitions map to the canonical table in `docs/veda-project-lifecycle-workflow.md`. The extension should not expose transitions that are not in that table.

---

## Recommended Transitions

The system may suggest lifecycle transitions based on observed maturity conditions. These suggestions are computed on read from the VEDA API — no background process evaluates them.

**Example:**

```
╔════════════════════════════════════════════════════════╗
║  Recommended Transition: Developing                    ║
║                                                        ║
║  Reason:                                               ║
║  68% of KeywordTargets have sampleSize ≥ 5             ║
║  (threshold: 50%)                                      ║
║                                                        ║
║  [ Review ]  [ Apply Transition ]  [ Dismiss ]         ║
╚════════════════════════════════════════════════════════╝
```

**Rules:**

- Recommendations are never automatically applied.
- The operator must explicitly confirm the transition.
- The threshold values shown match the maturity thresholds defined in `docs/veda-project-lifecycle-workflow.md`.
- Recommendations are dismissible and do not block other actions.

---

## Surface Gating Reference

This table defines which observatory surfaces are emphasized, de-emphasized, or hidden at each lifecycle state.

| Lifecycle State | Emphasized | De-emphasized | Hidden |
|---|---|---|---|
| `created` | Setup prompts | — | All observatory signals |
| `draft` | Configuration | — | All observatory signals |
| `researching` | Discovery tools | — | Volatility, alerts, attribution, SERP history |
| `targeting` | Keyword selection | — | Volatility, alerts, attribution |
| `observing` | SERP deltas, snapshot counts | Preliminary volatility (shown with maturity label) | Alerts, risk attribution |
| `developing` | Alerts, volatility summary, attribution | SERP raw history | — |
| `seasoned` | Long-term patterns, risk attribution, operator reasoning | Individual snapshot detail | — |
| `paused` | Resume / archive actions | Historical data (readable) | Ingest controls, alert actions |
| `archived` | Historical read-only data | — | All mutation controls, ingest, transitions |

---

## Integration With Observatory Surfaces

The lifecycle system coordinates with existing observatory surfaces defined in the SIL architecture:

| SIL Layer | First Active At |
|---|---|
| SIL-1 Observation Ledger | `targeting` (KeywordTargets registered) |
| SIL-2 SERP Deltas | `observing` (after ≥ 2 snapshots) |
| SIL-3 Keyword Volatility | `observing` (preliminary) / `developing` (actionable) |
| SIL-4 Project Volatility Summary | `developing` |
| SIL-5 Volatility Alerts | `developing` |
| SIL-6 SERP History | `observing` |
| SIL-7 Attribution Components | `developing` |
| SIL-8 Diagnostics | `developing` |
| SIL-9 Compute-on-read Alerts | `developing` |
| SIL-10 Temporal Risk Attribution | `seasoned` |
| SIL-11 Operator Reasoning | `developing` (directional) / `seasoned` (strategic) |

These surfaces appear naturally as the project matures. The extension does not need to gate them by checking SIL layer availability directly — lifecycle state is the proxy for signal readiness.

---

## LLM Assistance in the Extension

LLM systems surfaced through the extension (e.g., via the Operator Reasoning layer or future briefing panels) follow the same rules as the core system:

**LLM may assist with:**
- keyword clustering proposals
- research summarization during `researching` stage
- target selection recommendations during `targeting` stage
- reasoning synthesis and briefings during `developing` and `seasoned` stages

**LLM may not:**
- create `KeywordTarget` records automatically
- mutate tracked keyword sets without operator confirmation
- suppress or modify alerts
- apply lifecycle transitions autonomously
- trigger snapshot ingest

All LLM-generated proposals must follow:

```
Propose → Review → Apply
```

The extension must never present an LLM output as a completed action. Proposals are displayed as suggestions with explicit confirm/reject controls.

---

## Relationship to VSCODE-EXTENSION-SPEC.md

This document is a companion to `docs/VSCODE-EXTENSION-SPEC.md`, not a replacement.

`VSCODE-EXTENSION-SPEC.md` defines:
- the technical architecture and API contract
- the feature ladder (Levels 1–6)
- authentication model
- offline behavior
- what the extension is not

This document defines:
- how lifecycle state determines UI emphasis
- which actions are available at each stage
- how recommended transitions are surfaced
- which observatory signals appear at each stage

Both documents must be read together when implementing lifecycle-aware UI behavior. Changes to the lifecycle model in `docs/veda-project-lifecycle-workflow.md` may require updates to both.

---

## UX Design Goals

The VS Code extension should feel like:

**a control console**

not:

**a workflow wizard**

Operators should always understand:

- where the project is in its lifecycle
- which signals are meaningful right now
- what action should be taken next

The lifecycle system exists to support that clarity — not to constrain operators or introduce bureaucratic gates.
