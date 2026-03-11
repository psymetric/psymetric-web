# DQ-002 — Entity proposals deferred from Phase C1

## Status
Deferred

## Area
SERP-to-Content-Graph proposal helpers

## Decision
Entity proposals are not included in Phase C1.

## Reason
- Entity detection in the current brain is heuristic (URL/title token matching
  against project entity keys). The signal is useful for diagnostics but not
  precise enough to produce operator-facing proposals with confident specifics.
- A proposal that says "add entity X to this page" requires the entity match
  to be reliably correct. The current heuristic produces false positives when
  entity key tokens appear in unrelated URL segments.
- Surfacing a structurally unreliable proposal to the operator degrades trust
  in the proposal surface before it has established credibility.

## Next Eligible Phase
C2 — after archetype + schema proposals are stable and hammered.

## Blocking / Unlock Conditions
- Archetype and schema proposal outputs must be implemented, hammered, and
  proven stable.
- Entity extraction from SERP results must be improved beyond the current
  heuristic before proposals can be generated with sufficient confidence.
- The proposal contract structure established by C1 provides the pattern;
  entity proposals will follow the same shape.

## References
- docs/specs/SERP-TO-CONTENT-GRAPH-PROPOSALS.md
- docs/ROADMAP.md
- src/lib/veda-brain/entity-gap-analysis.ts
