# Content Graph Phases

## Purpose

This document defines the phased development plan for the VEDA Content Graph.

It exists to preserve the implementation sequence and prevent architectural drift.

The Content Graph must be built with the same discipline used for the SERP Observatory:

- stretch the architecture far enough to understand the full system
- implement slowly and precisely
- keep Phase 1 minimal and strategically useful
- defer later layers until the foundation is stable

This document is not a schema dump.
It is the phased implementation map for the Content Graph.

---

## Core Goal

The Content Graph models the internal structure of a project's brand ecosystem.

The SERP Observatory models the external search ecosystem.

VEDA becomes strategically powerful when it can compare:

- what the search ecosystem rewards
- what the project actually has

This comparison enables the first domination loop:

SERP ecosystem
→ competitor structure analysis
→ compare with project content graph
→ detect structural and coverage gaps
→ propose execution actions

---

## Phase 1 — Core Content Graph

### Goal

Phase 1 exists to unlock the first domination loop without overbuilding the system.

The objective is to model just enough structure for:

- coverage analysis foundations
- authority flow foundations
- page archetype reasoning
- future comparison with competitor structures

### In Scope

Core nodes:

- Surface
- Site
- Page
- ContentArchetype
- Topic
- Entity

Relationship objects:

- PageTopic
- PageEntity
- InternalLink
- SchemaUsage

### Phase 1 Questions VEDA Must Be Able To Answer

- What pages exist on the project site?
- Which topics are covered?
- Which entities are covered?
- Which page archetypes exist?
- How are pages internally linked?
- Which schema types are used?
- Where are the obvious structural gaps?

### Why Phase 1 Stops Here

Phase 1 is intentionally limited.

It does not attempt to model every possible website detail.
It does not attempt to compute advanced planning artifacts.
It does not attempt to ingest competitor content directly.

The purpose of Phase 1 is to create a reliable structural foundation.

### Explicitly Out Of Scope In Phase 1

- competitor content graph objects
- persistent authority scores
- execution planning records
- social content nodes
- cross-surface reinforcement logic
- autonomous blueprint generation

---

## Phase 2 — Coverage Intelligence

### Goal

Phase 2 adds compute-on-read intelligence derived from the Phase 1 graph.

This phase remains structural in foundation but begins producing richer analysis.

### Intended Outputs

- topic authority score
- entity authority score
- cluster completeness
- structural hub detection
- weak-support detection

### Key Rule

These outputs remain compute-on-read.

VEDA must not persist derived authority scores as durable system state.

---

## Phase 3 — Competitor Content Observatory

### Goal

Phase 3 connects the internal Content Graph with external competitor structure.

This phase expands VEDA's ability to understand not just what the project has, but what winning competitors are doing.

### Potential Objects

- CompetitorPage
- CompetitorSchema
- CompetitorArchetype
- CompetitorEntityCoverage

### Strategic Purpose

This phase allows VEDA to reverse-engineer:

- which archetypes dominate a SERP
- which schema patterns appear repeatedly
- which entity patterns correlate with winning pages
- how competitor structures differ from the project graph

---

## Phase 4 — Execution Planning

### Goal

Phase 4 turns graph intelligence into operational action proposals.

This is where the Content Graph begins feeding concrete planning workflows.

### Potential Objects

- ProposedPage
- CoverageGap
- ExecutionPlan
- LinkOpportunity

### Strategic Purpose

This phase allows VEDA to propose moves such as:

- create a missing comparison page
- strengthen support links into a hub page
- expand entity coverage for a topic cluster
- add missing schema to a structurally weak page

This is where the system starts moving from observation to guided execution.

---

## Phase 5 — Cross-Surface Authority

### Goal

Phase 5 expands the graph beyond websites into full brand ecosystem modeling.

This phase reflects the reality that authority now flows across multiple surfaces.

### Potential Objects

- YouTubeContentNode
- XPostCluster
- CrossSurfaceEntityReference
- SurfaceAuthoritySignal

### Strategic Purpose

This phase allows VEDA to reason across:

- website content
- social publishing
- video ecosystems
- entity reinforcement across surfaces

This is the phase where VEDA evolves from a site intelligence system into a full brand ecosystem intelligence system.

---

## Architectural Rules For All Phases

The Content Graph must always preserve the core VEDA invariants:

- project isolation
- transactional mutation discipline
- deterministic ordering
- compute-on-read intelligence
- LLM proposal only, never silent mutation

All graph mutations must remain explicit and operator-controlled.

---

## Relationship To Other Specs

Related documents:

- `docs/specs/CONTENT-GRAPH-DATA-MODEL.md`
- `docs/specs/PROJECT-BLUEPRINT-SPEC.md`
- `docs/specs/VEDA-CREATE-PROJECT-WORKFLOW.md`
- `docs/ROADMAP.md`

---

## Guiding Principle

The Content Graph should be built the same way the SERP Observatory was built:

observe carefully
model only what is needed
verify the foundation
extend in layers

That discipline is what allows VEDA to become advanced without becoming chaotic.
