# DQ-003 — Authority-support proposals deferred from Phase C1

## Status
Deferred

## Area
SERP-to-Content-Graph proposal helpers

## Decision
Authority-support proposals (derived from `AuthorityOpportunityResult`) are
not included in Phase C1.

## Reason
- Authority-support proposals imply page-to-page internal linking actions.
  That is execution planning semantics, not structural mismatch detection.
- Phase C1 proposals must be structural and non-tactical. "Strengthen internal
  links to page X from adjacent pages" is a tactical instruction, not a
  structural observation.
- Expressing a linking proposal correctly requires knowing which specific pages
  should provide the link. That context belongs to the execution planning layer
  (Content Graph Phase 4), not the Phase C1 proposal surface.
- The `AuthorityOpportunityResult` signal is valid and useful for diagnostics.
  It is surfaced through `GET /api/veda-brain/project-diagnostics` already.
  It does not need to be re-expressed as a proposal until the execution
  planning layer exists to back it up.

## Next Eligible Phase
Execution Planning layer (Content Graph Phase 4) or C2 if a
non-tactical framing can be defined cleanly.

## Blocking / Unlock Conditions
- Archetype and schema proposals must be stable and hammered first.
- A non-tactical framing must be defined: the proposal must describe the
  structural gap ("this page has no internal support") without prescribing
  the specific linking action.
- Execution planning layer must exist before full authority-support proposals
  can be actionable.

## References
- docs/specs/SERP-TO-CONTENT-GRAPH-PROPOSALS.md
- docs/specs/CONTENT-GRAPH-PHASES.md (Phase 4 — Execution Planning)
- docs/ROADMAP.md
- src/lib/veda-brain/authority-opportunity.ts
