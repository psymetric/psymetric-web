# VEDA Architecture Rules
## Operating Rules for Protecting the Observatory Core

**Document Status:** Canonical Architecture Rules  
**Applies To:** VEDA and any work that touches VEDA  
**Purpose:** Define the operating rules that protect VEDA from drift, scope creep, and architectural degradation.

---

# 1. Why These Rules Exist

VEDA exists to serve as the observability and intelligence core of the V Ecosystem.

Earlier project attempts failed because too many ideas, systems, and responsibilities were allowed to accumulate without strong structural discipline.

The result was:

- document drift
- human drift
- LLM drift
- feature creep
- unclear ownership
- unstable architecture

These rules exist to prevent VEDA from becoming that kind of system again.

They are intentionally conservative.

VEDA should evolve slowly, clearly, and only for good reasons.

---

# 2. The First Principle

# VEDA is infrastructure, not a playground.

VEDA is not the place for every interesting idea.
VEDA is not the place for every future feature.
VEDA is not the place where adjacent systems get absorbed because it is convenient.

VEDA is the observatory core.

Its job is to:

- observe
- model
- diagnose
- synthesize
- propose

Anything outside that role must be treated with suspicion.

---

# 3. Schema Rule

# No casual schema changes.

New tables, fields, relationships, or schema-level concepts must not be added to VEDA casually.

A schema change is allowed only when:

- the need is real and structural
- existing structures cannot express the requirement cleanly
- the change strengthens rather than weakens observability
- the ownership of the new data clearly belongs to VEDA

A schema change is **not** justified because:

- it feels convenient
- it avoids thinking harder
- an LLM proposed a new table as the easiest solution
- another system wants to push its complexity into VEDA

The default assumption is:

```text
VEDA schema does not change unless clearly justified.
```

---

# 4. Endpoint Rule

# No casual endpoint additions.

New endpoints must not be added to VEDA unless they are genuinely required by VEDA’s observatory role.

Before adding an endpoint, first ask:

- can the need be expressed through an existing endpoint?
- is this actually a new observatory capability or just a convenience feature?
- does this belong in VEDA at all?

An endpoint that mainly serves:

- CMS behavior
- editorial workflow
- project orchestration
- monetization operations
- runtime convenience outside observability

probably does not belong in VEDA.

---

# 5. Ownership Rule

# VEDA owns observatory truth only.

VEDA owns:

- observations
- diagnostics
- content graph structures used for observability
- cross-lens intelligence
- proposals derived from observatory signals
- the minimal scoped project identity needed for observability

VEDA does not own:

- project planning authority
- editorial workflow state
- publishing workflow state
- general CMS logic
- execution-side asset operations
- affiliate runtime mechanics

If ownership is unclear, the feature or data should not enter VEDA until ownership is resolved.

---

# 6. Observatory-First Rule

# New capabilities must be expressed as observability whenever possible.

VEDA should prefer:

- observations
- signals
- snapshots
- diagnostics
- proposals
- read models

over application-like expansion.

If a new feature can be modeled as:

```text
entity
+ observation
+ time
+ interpretation
```

that is usually the correct VEDA-friendly direction.

This is how new lenses should plug into the system.

---

# 7. Boring Over Clever

# Prefer boring solutions over clever ones.

VEDA should prioritize:

- clarity
- determinism
- consistency
- testability
- explicitness

Cleverness that increases ambiguity is architectural debt.

The correct solution is often the one that is:

- easier to explain
- easier to test
- easier to debug
- easier for an LLM to maintain

Even if it feels less exciting.

---

# 8. Existing Structures First

# Before adding new structure, exhaust existing structure.

When a new requirement appears, first ask:

- can this be expressed using existing schema?
- can this be expressed as a new observation type?
- can this be handled as a derived signal instead of a new persistent object?
- can the complexity live in an adjacent system instead?

This rule exists to prevent architecture sprawl.

The goal is not to avoid all change forever.
The goal is to ensure change is deliberate.

---

# 9. Explicit Contracts Rule

# VEDA must communicate through explicit contracts.

Other systems may consume VEDA outputs.
They must do so through explicit interfaces and payloads.

Project V should consume:

- diagnostics outputs
- proposal payloads
- scoped observatory views
- other stable VEDA-facing artifacts

V Forge and adjacent systems should only interact with VEDA through intentional, documented boundaries.

No system should depend on VEDA by casually reaching into unstable internal meanings.

---

# 10. Future Ideas Rule

# Future ideas stay future until promoted.

VEDA will accumulate many interesting ideas over time.
Examples may include:

- GraphRAG
- vector search layers
- deeper commercial observatories
- advanced automation systems
- new intelligence surfaces

These ideas should not automatically enter active scope.

They must remain in:

- future docs
- research notes
- exploratory concepts

until they are explicitly promoted into active architecture.

This prevents idea gravity from destabilizing the core system.

---

# 11. Lens Rule

# New lenses must plug into VEDA, not rewrite it.

A new lens should ideally arrive as:

- new entity types if truly required
- new observation types
- new diagnostics or interpretation logic
- new proposal logic

A new lens should not require VEDA to lose its identity.

If a lens demands major redefinition of the core, that is a signal to slow down and question the design.

---

# 12. Hammer Rule

# Hammer tests protect the system.

VEDA is not protected by good intentions.
It is protected by verification.

Every important invariant should be defended by:

- hammer tests
- deterministic behavior checks
- method guards
- isolation checks
- parse-checks where relevant

When a new behavior matters structurally, it should be tested.

If a system claim cannot survive repeated hammering, it is not stable enough.

---

# 13. Docs Must Reflect Reality

# Documentation is not decoration.

If a document describes a system path that is no longer valid, it becomes a liability.

VEDA documentation must be:

- current
- aligned with implementation reality
- aligned with the current ecosystem split
- free of stale conceptual paths where possible

This includes removing or isolating outdated naming and architecture remnants.

Stale docs cause LLM drift just as surely as stale code does.

---

# 14. Naming Rule

# Active VEDA documentation should use current system identity.

Old naming that no longer reflects the architecture should be removed from the active surface area where possible.

Legacy internal identifiers may survive temporarily if changing them is too risky, but:

- they should be contained
- they should not define the active story of the project
- they should not continue to shape new architecture work

Current docs should reflect the real ecosystem:

- Project V
- VEDA
- V Forge

not obsolete paths.

---

# 15. When a Rule May Be Broken

These rules are not meant to create paralysis.

They may be broken only when:

- the change is genuinely necessary for system health
- existing structures would require a worse architectural compromise
- the ownership is still correct
- the change is understood and documented

A rule should slow change down enough to force thought.
If, after that thought, the change is still necessary, the rule has done its job.

---

# 16. Practical Decision Filter

Before adding anything to VEDA, ask these questions:

## 1. Is this truly observability?
If no, it likely does not belong in VEDA.

## 2. Does VEDA clearly own this meaning?
If no, stop and resolve ownership first.

## 3. Can existing structures express it?
If yes, prefer the existing structure.

## 4. Is this boring, explainable, and testable?
If no, simplify it.

## 5. Will this make future maintenance easier or harder?
If harder, be very suspicious.

If a proposed change fails these questions, it should not enter VEDA casually.

---

# 17. Summary

VEDA should remain:

- observatory-first
- slow to change at the core
- strongly owned
- explicit in its contracts
- conservative in its schema
- protected by hammer tests
- resistant to scope drift

The purpose of these rules is not to make VEDA rigid for its own sake.
The purpose is to preserve the system long enough for it to become truly useful.

A stable core creates faster progress everywhere else.

---

# End of Document
