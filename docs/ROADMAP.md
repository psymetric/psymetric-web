# VEDA Roadmap

This roadmap is the **single source of truth for scope**.

- If it is not in the current active phase, it is out of scope.
- Any scope change requires an explicit roadmap edit.
- Detailed behavior lives in `docs/specs/`. This document is the navigation map.

---

## 1. System Principles

All system behavior is governed by five non-negotiable invariants:

- **Project isolation** — all queries resolve project scope via `resolveProjectId()`. Cross-project data access is a critical violation.
- **Transactional mutations + event logging** — every state change is transactional and emits an EventLog entry.
- **Deterministic ordering** — all API responses use deterministic sort with tie-breakers. No random, no `Date.now()` in analytics.
- **Compute-on-read analytics** — no materialized volatility state. All intelligence is derived at query time.
- **LLMs propose, humans commit** — LLM assistants may draft and suggest. They may never mutate system state silently.

---

## 2. VEDA System Model

VEDA is a **Search Ecosystem Operating System**.

Each project is a **brand ecosystem container**, not simply a website. A project declares which surfaces it operates on, tracks keyword territory, and accumulates observation history across its full lifecycle.

- Projects are strictly isolated. No shared state between projects.
- All queries scope to a project via `resolveProjectId()`.
- Projects may use any combination of VEDA system capabilities: SERP observatory, content graph, social media surfaces, video platforms, authority signal tracking, and future surfaces as they are defined.
- LLM systems interact with VEDA through MCP tools that expose the HTTP API surface. LLMs may read system state and propose actions but cannot mutate system state directly.

Specifications:
- `docs/specs/VEDA-MCP-TOOLS-SPEC.md`

---

## 3. Observational Surfaces

VEDA observes multiple surfaces of the search ecosystem simultaneously.

### Search Graph — SERP Observatory
Models the external search ecosystem via SERP snapshots and the SIL sensor stack.
Signals: rankings, domain dominance, SERP features, intent drift, AI overview behavior, volatility.

### Content Graph — Project Website
Models the internal structure of the project's own site, explicitly stewarded through VEDA workflows.
Signals: pages, page types, internal links, anchor text, schema usage, topic and entity coverage.

Specifications:
- `docs/specs/CONTENT-GRAPH-DATA-MODEL.md`
- `docs/specs/CONTENT-GRAPH-PHASES.md`

### Competitor Content Observatory
Observes structural patterns of competitor pages appearing in tracked SERPs. SERP snapshots act as the selection mechanism.
Signals: page archetypes, schema usage, internal support structures, citation patterns.

### LLM Citation Observatory
Tracks domain citation behavior across AI systems.
Signals: domain citation frequency, entity mention frequency, citation volatility, cross-model coverage.

### Social Surface Observatories *(Future)*
VEDA will extend observation to social media ecosystems as additional surface layers. Each platform will expose its own visibility signals through platform APIs.

Platforms:
- X (Twitter)
- YouTube
- Future social platforms

Signals:
- engagement
- reach
- entity references
- cross-platform authority signals

These signals integrate with VEDA's multi-surface intelligence model alongside SERP and content graph signals.

#### AI-Assisted Social Interaction Workflows *(Future)*

VEDA will support **operator-assisted engagement workflows** for social platforms.

Purpose:
- assist operators in responding to conversations
- reinforce brand authority in public discussions
- capture recurring questions and misconceptions

Initial platform focus:
- X (Twitter)

Example workflow:

```
Social reply detected or selected
→ captured as SourceItem
→ conversation context analyzed
→ VEDA generates DraftArtifact (x_reply)
→ operator reviews and edits
→ operator posts response manually
```

This workflow integrates existing system primitives:

- `SourceItem` capture
- `DraftArtifact` generation (`x_reply`)
- `MetricSnapshot` tracking for engagement signals

The system remains **human-in-the-loop**. VEDA never posts automatically.

---

## 4. Project Lifecycle

Projects move through a defined set of lifecycle states:

`created` → `draft` → `researching` → `targeting` → `observing` → `developing` → `seasoned` → `paused` / `archived`

All lifecycle transitions follow the **Propose → Review → Apply** rule. LLMs may assist in proposing transitions. They cannot apply them.

Specification:
- `docs/veda-project-lifecycle-workflow.md`

---

## 5. Project Blueprint Phase

The **Project Blueprint** defines the intended structure of a project before keyword targeting begins. It is produced during the `draft` lifecycle stage.

A project blueprint is required before a project may proceed to the research phase.

Blueprint components:
- Brand identity and strategic niche
- Surface registry (which VEDA surfaces the project uses)
- Website architecture model
- Content archetypes
- Entity clusters
- Initial keyword territory
- Authority model

The blueprint acts as the architectural contract for all subsequent targeting and observation work.

Specifications:
- `docs/specs/PROJECT-BLUEPRINT-SPEC.md`
- `docs/specs/VEDA-CREATE-PROJECT-WORKFLOW.md`

---

## 6. Brand Surface Registry

Each project declares which surfaces it operates on. VEDA treats these as parts of a single brand ecosystem.

Possible surfaces:
- Website
- Wiki
- Blog / editorial
- X (Twitter)
- YouTube
- Future media surfaces

Surface declarations are stored per-project and scope signal collection accordingly.

---

## 7. Architectural Stack

```
┌──────────────────────────────────────────────┐
│         Operator Interfaces                  │
│   VS Code Extension · MCP Bridge             │
├──────────────────────────────────────────────┤
│         SEO Lab  (future)                    │
│   Ranking hypothesis testing                 │
├──────────────────────────────────────────────┤
│         Tactics Layer                        │
│   Keywords · Links · Schema · Entity         │
├──────────────────────────────────────────────┤
│         Execution Planning Layer             │
│   Page-level plans · Playbooks · Defense     │
├──────────────────────────────────────────────┤
│         Strategy Synthesis Layer             │
│   Synthesis · Territory Intelligence         │
├──────────────────────────────────────────────┤
│         Operator Reasoning Layer             │
│   Reasoning · Briefing · Insights            │
├──────────────────────────────────────────────┤
│         Diagnostics Layer                    │
│   Project Diagnostic · Keyword Diagnostic    │
│   Spike Delta · Risk Attribution             │
├──────────────────────────────────────────────┤
│         SIL Sensor Layer                     │
│   SIL-1 → SIL-24: Volatility · Class.        │
│   Causality · Intent · Features · Weather    │
├──────────────────────────────────────────────┤
│         Observation Ledger                   │
│   SERPSnapshot · KeywordTarget · MetricSnap  │
│   EventLog · QuotableBlock · SearchPerf      │
├──────────────────────────────────────────────┤
│         Data Ingestion Layer                 │
│   DataForSEO Live SERP Ingest                │
│   Search Console Ingest · Manual Capture     │
└──────────────────────────────────────────────┘
```

Specifications:
- `docs/specs/SIL-1-OBSERVATION-LEDGER.md`

All analytics are compute-on-read. No materialized volatility state is permitted.

---

## 8. Completed Milestones

- Multi-project isolation architecture
- Observation ledger (SERPSnapshot, KeywordTarget, MetricSnapshot)
- DataForSEO SERP ingest pipeline
- SERP delta detection
- Keyword volatility engine
- Volatility alerts
- Operator reasoning layer
- SERP disturbance detection (SIL-16)
- Event attribution (SIL-17)
- SERP weather model (SIL-18)
- Weather forecasting + momentum (SIL-19, SIL-19B)
- Weather alerts (SIL-20)
- Alert briefing engine (SIL-21)
- Keyword impact ranking (SIL-22)
- Alert-affected keyword selection (SIL-23)
- Operator investigation hints (SIL-24)
- VS Code Command Center (multi-panel sidebar)
- SERP Observatory panel

---

## 9. Active Development

- Content Graph layer *(in progress)*
- Project Blueprint workflow
- Brand Surface Registry
- Page Command Center expansion
- MCP toolset for project creation and blueprint workflows
- SERP-to-Content-Graph proposal helpers *(Phase C1: archetype + schema proposals only, read-only, compute-on-read)*

SERP-to-Content-Graph helpers generate operator-reviewable proposals only. They do not mutate Content Graph state automatically.
Phase C1 scope: `GET /api/veda-brain/proposals` returning archetypeProposals and schemaProposals derived from VEDA Brain diagnostics.
Topic proposals (DQ-001), entity proposals (DQ-002), and authority-support proposals (DQ-003) are deferred to C2.

---

## 10. Future Phases

The order of future phases reflects architectural dependencies. Structural observatories and graph models must exist before higher-level strategy and experimentation layers can operate.

- Competitor Content Graph
- Social surface observatories (X, YouTube)
- AI-assisted social interaction workflows
- LLM citation observatory expansion
- Strategy synthesis engine
- Execution planning layer
- SEO Lab experimentation framework
- SERP ecosystem simulation
