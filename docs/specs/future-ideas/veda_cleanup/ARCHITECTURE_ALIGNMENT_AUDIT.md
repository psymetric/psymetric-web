# Architecture Alignment Audit
## Working Audit for Repo Cleanup, Naming Alignment, Ownership Drift, and Documentation Health

**Document Status:** Active Working Audit  
**Applies To:** Current VEDA repo cleanup and ecosystem alignment pass  
**Purpose:** Identify where the repo, docs, naming, and ownership surfaces no longer match the current V Ecosystem architecture, and define cleanup actions.

---

# 1. Why This Audit Exists

The architecture has clarified significantly.

The ecosystem now has a defined split:

- **Project V** — planning / orchestration
- **VEDA** — observability / intelligence
- **V Forge** — execution / production

However, the repository, documentation, extension surfaces, and historical conceptual layers were created across multiple stages of the project.

That means some parts of the system still reflect:

- old naming
- older system boundaries
- VEDA carrying too much conceptual weight
- future ideas mixed with active architecture
- documentation that no longer reflects reality

This audit exists to make the cleanup intentional rather than chaotic.

---

# 2. Audit Goals

This audit is focused on five goals:

## 1. Remove naming drift
Especially stale identity remnants such as old product naming or obsolete conceptual labels.

## 2. Remove ownership drift
Determine which docs, code surfaces, and extension features belong to VEDA, Project V, V Forge, or an adjacent system.

## 3. Reduce doc sprawl
Identify which documents are canonical, which are future-facing, which are historical, and which should be archived or removed.

## 4. Align active docs with implementation reality
A document describing an invalid architectural path is a liability.

## 5. Prepare the repo for the next build phase
After cleanup, the ecosystem should be easier to maintain, easier to explain, and safer for future LLM-assisted work.

---

# 3. Audit Categories

Each finding should be classified into one or more of these categories.

## Naming Drift
Examples:
- old names in active docs
- outdated product/system terminology
- stale identity labels that imply an obsolete architecture

## Ownership Drift
Examples:
- a feature documented as part of VEDA that now belongs to Project V
- extension surfaces with unclear system alignment
- concepts that should be adjacent but are still described as core

## Documentation Drift
Examples:
- specs that no longer match current implementation or architectural intent
- duplicated docs saying different things
- future ideas mixed into active architecture docs

## Repo Structure Pressure
Examples:
- folders that imply mixed ownership
- locations that will create confusion as the ecosystem splits
- future risk areas where cleanup may be needed even if no action is taken immediately

## Legacy Toleration
Examples:
- migration or internal function names that are not ideal but are too risky to rename immediately
- temporary technical remnants that should be contained, not treated as active architecture

---

# 4. Decision Buckets

Each audited item should end up in one of these decision buckets.

## Keep
The item is valid and aligned with current architecture.

## Rewrite / Reframe
The item is conceptually useful but must be rewritten or re-scoped.

## Move
The item belongs elsewhere in the repo or ecosystem.

## Archive
The item describes useful history or future thinking, but should not remain in the active surface area.

## Delete
The item is misleading, duplicated, obsolete, or no longer worth preserving.

## Tolerate Temporarily
The item is imperfect but low-risk enough to leave in place for now, provided it is not allowed to shape current architecture.

---

# 5. Current Canonical Docs Created in This Cleanup Pass

The following documents should be treated as the new architecture foundation unless later replaced deliberately:

- `V_ECOSYSTEM_OVERVIEW.md`
- `SYSTEM_BOUNDARIES_AND_MAINTENANCE_STRATEGY.md`
- `DB_OWNERSHIP_STRATEGY.md`
- `VEDA_ARCHITECTURE_RULES.md`
- `VSCODE_EXTENSION_OWNERSHIP_MATRIX.md`

These are the current reference layer for evaluating older docs.

---

# 6. Initial Audit Focus Areas

## A. Legacy naming decontamination

### Problem
The repo still contains references to short-lived or obsolete naming that no longer reflects the current ecosystem identity.

Known examples include:

- **PsyMetric**
- **Voltron**

### Why this matters
This is not only cosmetic.
It causes:

- naming confusion
- stale architecture storytelling
- LLM drift
- false continuity with directions that are no longer valid

### Audit actions
- find active docs using obsolete naming
- determine whether each occurrence is:
  - safe rename
  - archive candidate
  - legacy internal identifier that can remain temporarily
- remove obsolete naming from the active documentation surface area

### Current priority
**High**

---

## B. VEDA vs Project V vs V Forge ownership clarity

### Problem
Some docs and extension surfaces were created before the current split was formalized.

### Audit actions
- reclassify docs by real owner
- identify where VEDA is still described as carrying too much responsibility
- identify where Project V or V Forge need stronger conceptual ownership

### Current priority
**High**

---

## C. VS Code extension ownership

### Problem
The extension likely contains a mix of:
- true VEDA surfaces
- Project V-oriented workflows
- future V Forge-adjacent needs
- shared extension infrastructure

### Current status
A first-pass ownership matrix has been written in:

- `VSCODE_EXTENSION_OWNERSHIP_MATRIX.md`

### Audit actions
- compare extension code and naming to the ownership matrix
- identify what should remain where
- identify what should be renamed or conceptually moved

### Current priority
**High**

---

## D. Future ideas vs active architecture

### Problem
Research and future-facing concepts are valuable, but they can distort the active architecture if not clearly bounded.

### Audit actions
- identify which docs are:
  - active architecture
  - future observatory concepts
  - adjacent system concepts
  - historical context only
- separate “what exists now” from “what may exist later”

### Current priority
**High**

---

## E. Roadmap alignment

### Problem
The roadmap must reflect the actual system split and current architectural reality.

### Audit actions
- update roadmap language to match the new ecosystem structure
- remove obsolete conceptual assumptions
- ensure VEDA is described as an observatory core rather than an everything-system

### Current priority
**High**

---

# 7. Initial Working Findings

## Finding 1
**VEDA was historically carrying too many roles.**

### Effect
Some docs and surfaces still reflect a period when VEDA was implicitly:
- planner
- observatory
- execution layer
- general product system

### Action
Rewrite or reframe docs that still treat VEDA as the all-in-one system.

### Bucket
**Rewrite / Reframe**

---

## Finding 2
**Project V should inherit planning/orchestration meaning from older project planner concepts, but not necessarily all original implementation assumptions.**

### Effect
The old project planner material is useful, but it is too broad and too heavy to be treated as direct implementation truth without reinterpretation.

### Action
Preserve the strategic intent, but re-scope it under the new ecosystem boundaries.

### Bucket
**Rewrite / Reframe**

---

## Finding 3
**V Forge is conceptually under-documented relative to the other systems.**

### Effect
Execution and CMS-side meaning may drift or get pulled into VEDA if not defined clearly.

### Action
Create and stabilize V Forge overview docs before execution-related features expand.

### Bucket
**Create / Clarify**

---

## Finding 4
**The extension already has strong VEDA-aligned value.**

### Effect
Not all extension work should be treated as transitional. Much of it is correctly observatory-aligned.

### Action
Keep strong observatory surfaces with VEDA while reclassifying setup/planning flows toward Project V.

### Bucket
**Keep + Reframe**

---

# 8. Cleanup Worklist

## Immediate

- remove stale naming from active docs where safe
- review roadmap against new ecosystem architecture
- review extension naming against ownership matrix
- identify canonical docs vs future docs
- reduce active-surface ambiguity

## Near-term

- create Project V overview doc
- create V Forge overview doc
- define handoff contracts between systems
- identify repo locations that may need future restructuring

## Later

- archive historical docs cleanly
- isolate legacy internal names where renaming is too risky
- refine future idea promotion rules

---

# 9. Suggested Audit Method

For each doc, feature, or structure under review, ask:

## 1. Does this reflect the current ecosystem?
If not, it must be rewritten, moved, or archived.

## 2. Who owns this meaning now?
If ownership is unclear, classify it before changing anything.

## 3. Is this active truth, future concept, or historical context?
Do not let those categories blur together.

## 4. Is this load-bearing or decorative?
If it influences implementation or future AI reasoning, it is load-bearing and must be accurate.

## 5. Is it safer to rename, archive, or tolerate temporarily?
Choose the least dangerous cleanup action that increases clarity.

---

# 10. Success Criteria

This audit is successful when:

- active docs reflect the current ecosystem accurately
- obsolete naming is removed or isolated from active surfaces
- extension ownership is clear enough to guide future work
- VEDA is no longer described as an everything-system
- future ideas no longer distort active architecture
- the repo is safer for future LLM-assisted coding and maintenance

---

# 11. Summary

This audit is not a paperwork exercise.
It is the bridge between:

- a hardened but historically layered system
and
- a clean, bounded ecosystem ready for the next phase of building

The cleanup should be surgical, reality-based, and guided by ownership rather than sentiment.

---

# End of Document
