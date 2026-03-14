# Database Ownership Strategy
## Data Ownership, Boundaries, and Cross-System Handoffs in the V Ecosystem

**Document Status:** Canonical Data Ownership Strategy  
**Applies To:** Project V, VEDA, V Forge, and Adjacent Systems  
**Purpose:** Define which system owns which kinds of data, how systems should share identifiers and handoff artifacts, and how to preserve future separation without introducing premature complexity.

---

# 1. Why This Document Exists

The V Ecosystem is being split into bounded systems because planning, observability, and execution are not the same kind of work.

That means the database strategy must follow **ownership**, not convenience.

The correct question is not:

```text
How many databases should exist?
```

The correct question is:

```text
Which system owns which data,
and how can that ownership remain clear over time?
```

Once ownership is clear, database structure becomes a solvable engineering problem.

---

# 2. The Primary Rule

# Data ownership must follow system responsibility.

This means:

- observatory truth belongs to VEDA
- planning and orchestration state belongs to Project V
- draft, publishing, and execution state belongs to V Forge

A system may reference another system’s entities.
A system may consume another system’s outputs.
A system may not silently become the owner of another system’s truth.

---

# 3. The Three Kinds of Data in the Ecosystem

The ecosystem deals with three major kinds of data gravity.

## 1. Observational truth
This is data about reality as observed.

Examples:
- search observations
- YouTube observations
- LLM citation observations
- graph relationships used for observability
- diagnostics
- derived proposals based on observations

This belongs to **VEDA**.

## 2. Planning and orchestration state
This is data about intent, sequencing, and project direction.

Examples:
- project definitions
- project lifecycle state
- strategy artifacts
- planning documents
- roadmaps
- orchestration decisions

This belongs to **Project V**.

## 3. Execution and production state
This is data about making things, editing them, and publishing them.

Examples:
- drafts
- editorial workflows
- revision state
- publishing state
- assets and media
- execution-side content artifacts

This belongs to **V Forge**.

These three data categories must not be blended casually.

---

# 4. Ownership by System

## VEDA owns

VEDA owns the data required to model, preserve, and analyze observability truth.

This includes:

- observatory entities required for intelligence work
- observations and snapshots
- content graph structures used for observability
- diagnostics outputs
- cross-lens intelligence artifacts
- proposal-generation data derived from observations
- minimal project identity required for scoped observability

### Examples
- tracked search queries
- SERP observations
- YouTube channel/video/query observations
- LLM citation observations
- entity and topic relationships for observability
- readiness classifications derived from observed signals
- proposal artifacts produced from VEDA analysis

### What VEDA does not own
VEDA does not own:

- broad project planning state
- editorial workflow state
- drafts and publishing workflow
- general CMS data
- execution-side asset management
- monetization operations or affiliate runtime mechanics

---

## Project V owns

Project V owns the data required to plan, coordinate, and sequence projects.

This includes:

- project definitions
- project lifecycle state
- roadmaps
- strategy artifacts
- planning checkpoints
- blueprint or project setup orchestration state
- execution requests and coordination metadata

### Examples
- project records
- project goals and strategic framing
- initiative sequencing
- roadmap items
- project-level milestones or readiness checkpoints
- decision logs about what should happen next

### What Project V does not own
Project V does not own:

- observatory raw truth
- detailed external platform observations
- execution-side drafts or publishing state
- shadow copies of VEDA’s intelligence data

Project V may consume VEDA outputs. It may not quietly replace them.

---

## V Forge owns

V Forge owns the data required to execute, create, edit, and publish.

This includes:

- draft content
- revision state
- editorial workflow state
- publishable artifacts
- media and asset references
- content execution metadata
- CMS-side operational data

### Examples
- article drafts
- version history
- review/publish states
- asset references
- template instantiations
- content execution logs

### What V Forge does not own
V Forge does not own:

- observatory truth
- planning authority
- the canonical interpretation of external signals

V Forge may receive execution-ready handoffs informed by VEDA and coordinated by Project V.
It should not become the place where observatory intelligence is redefined.

---

# 5. Database Strategy Recommendation

The recommended strategy is:

# protect VEDA most strongly, keep Project V and V Forge logically separate, avoid premature fragmentation

In practice, this means:

## VEDA
VEDA should have the strongest database boundary in the ecosystem.

This can be implemented as either:

- a separate database
- or a very hard schema/domain boundary if physical separation is not yet chosen

The reason is simple:
VEDA is the observatory truth core and must remain protected from planning drift and execution sludge.

## Project V and V Forge
Project V and V Forge may begin closer together than VEDA, provided ownership remains explicit.

That may mean:

- shared database initially
- separate schemas or strongly separated ownership zones
- explicit tables and naming that preserve future split options

This is acceptable because Project V and V Forge are both higher-chaos domains than VEDA and are more likely to evolve rapidly.

## What should be avoided
The ecosystem should avoid one giant undifferentiated shared database where:

- observability tables
- planning tables
- editorial tables
- CMS workflow tables
- utility tables

all mix without clear ownership.

That is the fastest route to schema sludge.

---

# 6. Shared Identifiers vs Shared Ownership

It is normal for systems to share identifiers.
It is not acceptable for systems to share ownership ambiguously.

## Shared identifiers are allowed
Examples:
- project IDs
- external entity IDs
- stable handoff IDs
- source observation references

## Shared ownership is not allowed
A row or concept should not have multiple quiet owners.

Bad pattern:

```text
Project V stores its own version of observatory truth
because it was convenient.
```

Good pattern:

```text
Project V stores a reference to a VEDA output
and consumes it through a defined contract.
```

This distinction is critical for diagnosability.

---

# 7. Handoff Strategy Between Systems

Systems should exchange:

- identifiers
- read models
- proposal payloads
- execution handoff artifacts
- diagnostics payloads

They should not exchange meaning through undocumented table reach-through.

## Recommended handoff model

### VEDA → Project V
VEDA provides:
- diagnostics outputs
- proposal payloads
- scoped observatory views
- structured opportunity/threat signals

Project V consumes these as **planning inputs**.

### Project V → V Forge
Project V provides:
- selected execution intent
- project framing
- requested work items
- coordination context

V Forge consumes these as **execution inputs**.

### V Forge → VEDA
Only limited, intentional signals should flow back.

Examples:
- publish events
- asset publication metadata if relevant to observability
- execution outcomes that affect what should be observed next

V Forge should not write directly into observatory truth structures except through clearly defined interfaces.

---

# 8. What Must Never Cross Directly

The following patterns should be treated as architectural violations.

## 1. Project V directly owning VEDA internals
Project V must not own internal observation structures, observatory snapshots, or graph truth that properly belongs to VEDA.

## 2. V Forge directly mutating observatory truth
Execution-side workflow noise must not leak directly into VEDA’s core data structures.

## 3. Duplicate silent truth stores
If a second system stores a slightly altered copy of another system’s data “for convenience,” drift becomes inevitable.

## 4. Mixed-purpose tables
A table should not simultaneously represent:
- observatory state
- planning state
- publishing state

Mixed-purpose tables destroy ownership clarity.

---

# 9. Ejectability and Future Separation

The system should be designed so that separation remains possible later.

This does not mean splitting everything immediately.
It means keeping enough structure that future separation is feasible.

## VEDA
Should be the hardest to pollute and the easiest to trust.

## Project V
Should remain conceptually separate from VEDA even if infrastructure stays close at first.

## V Forge
Should be easiest to eject later if it accumulates heavy workflow complexity.

This is why V Forge should be treated as the most likely future separation candidate.

---

# 10. Practical Ownership Heuristics

When deciding where new data belongs, use these tests.

## If the data describes observed external or internal reality
It likely belongs in **VEDA**.

## If the data describes what the project intends to do next
It likely belongs in **Project V**.

## If the data describes a draft, revision, or publishing workflow
It likely belongs in **V Forge**.

## If the data exists mainly to connect systems
It may belong in a thin handoff model or explicit contract artifact rather than being absorbed into one domain.

These tests should be applied before introducing any new schema.

---

# 11. Adjacent Systems

Not every system belongs inside the primary trio.

An adjacent system may have its own database or storage model later, but the same ownership principles apply.

## Example: Link Synapse Lite
Link Synapse Lite should own:
- tracked link definitions
- redirect events
- distribution telemetry specific to its operation

VEDA may observe or ingest derived telemetry from Link Synapse Lite.
That does not mean Link Synapse Lite belongs inside VEDA’s primary data ownership model.

The observatory consumes signals.
It does not need to become every runtime system.

---

# 12. Recommended Near-Term Stance

The recommended near-term stance is:

## VEDA
- strongest protection
- separate DB or hard domain boundary
- no casual contamination from planning or execution

## Project V + V Forge
- may start closer together operationally
- must remain logically distinct
- schema boundaries should already reflect future split possibility

## Between systems
- explicit contracts only
- stable IDs
- no undocumented internal joins as architecture

This gives the ecosystem the best balance of:
- maintainability
- simplicity
- future separation potential
- LLM-debuggability

---

# 13. Summary

The ecosystem should not decide database structure based on aesthetics.
It should decide it based on **data ownership**.

The correct ownership pattern is:

```text
VEDA       owns observatory truth
Project V  owns planning and orchestration state
V Forge    owns execution and publishing state
```

Systems may share identifiers and consume explicit handoff artifacts.
They may not quietly share ownership of the same meaning.

The database strategy should reflect this:

- protect VEDA most strongly
- keep Project V and V Forge logically separate
- avoid giant shared schema sludge
- preserve future ejectability where needed

This is the healthiest path for the ecosystem and the one most maintainable by both humans and LLMs.

---

# End of Document
