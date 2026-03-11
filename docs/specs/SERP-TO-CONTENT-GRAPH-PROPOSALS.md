# SERP-to-Content-Graph Proposals — Phase C1 Spec

## Status
Ready for implementation

## Phase
C1 — first slice

---

## Purpose

Phase C1 exposes a read-only, compute-on-read proposal surface that translates
already-computed VEDA Brain diagnostics into structured, operator-reviewable
action candidates.

This is not a tactics layer. It is a structured signal translation layer.
Proposals describe what the structural mismatch implies the operator could do.
They do not prescribe execution sequences or multi-step plans.

---

## What Phase C1 includes

Two proposal types only:

- **archetypeProposals** — derived from `ArchetypeAlignmentResult`
- **schemaProposals** — derived from `SchemaOpportunityResult`

One endpoint only:

- `GET /api/veda-brain/proposals`

---

## Why archetype + schema first

Both derive from already-computed, page-mapped brain signals only. No new
computational requirements and no new data sources.

Archetype proposals surface when a keyword maps to an existing page whose
archetype does not match the dominant archetype pattern in the SERP. This is
the clearest structural mismatch the brain currently detects — the evidence
field (serpDominantArchetype + count) is fully deterministic.

Schema proposals surface when a keyword maps to an existing page that lacks
schema types the SERP features imply. Again, fully deterministic from existing
brain computation. The schema signal is the most concrete gap the system can
currently express as a per-page action candidate.

Both proposal types are:
- bounded to keywords that already have a mapped page
- evidence-backed by deterministic SERP signals
- expressible as a small, concrete structural action
- free of strategic interpretation or prioritization ambiguity

All other proposal types (topic, entity, authority-support) are deferred.
See deferred items DQ-001, DQ-002, DQ-003.

---

## Source modules

| Proposal type | Primary source | Secondary source |
|---|---|---|
| archetypeProposals | `computeArchetypeAlignment()` | `computeKeywordPageMapping()` |
| schemaProposals | `computeSchemaOpportunity()` | `computeKeywordPageMapping()` |

The endpoint calls `computeVedaBrainDiagnostics()` and projects the
`archetypeAlignment` and `schemaOpportunity` fields into the proposal contract.
No new brain computation is introduced.

---

## Endpoint

```
GET /api/veda-brain/proposals
```

- Project-scoped via `resolveProjectId()`
- Read-only
- No query parameters in Phase C1
- Compute-on-read — no caching, no persistence
- Standard project isolation and 404 non-disclosure apply

### Response envelope

```json
{
  "data": {
    "projectId": "<uuid>",
    "proposals": {
      "archetypeProposals": [ ...ArchetypeProposal ],
      "schemaProposals": [ ...SchemaProposal ]
    },
    "summary": {
      "archetypeProposalCount": 0,
      "schemaProposalCount": 0,
      "totalProposals": 0
    }
  }
}
```

No `generatedAt` field. Timestamp is not deterministic from source data and
would change on every call for identical inputs, violating the determinism
invariant.

---

## Response contract — ArchetypeProposal

```typescript
interface ArchetypeProposal {
  proposalId: string;             // see proposalId rules below
  proposalType: "archetype";
  query: string;
  existingPageId: string;
  existingPageUrl: string;
  existingArchetype: string | null; // content archetype key, null if unassigned
  serpDominantArchetype: string;
  evidence: {
    serpDominantCount: number;    // how many SERP results showed that archetype
    mismatchReason: string;       // passes through ArchetypeAlignmentEntry.mismatchReason
  };
  suggestedAction: "review_archetype_alignment" | "consider_archetype_aligned_page";
}
```

**suggestedAction derivation:**
- `"review_archetype_alignment"` when `existingArchetype` is null
  (page is mapped but has no archetype assigned — review alignment before acting)
- `"consider_archetype_aligned_page"` when `existingArchetype` is non-null
  and does not match `serpDominantArchetype`
  (page exists with wrong archetype — consider whether a new aligned page is warranted)

This derivation is fully deterministic from the existing `mismatchReason` field.

**Inclusion filter:** only emit entries where `ArchetypeAlignmentEntry.aligned === false`
and `mismatchReason` is not `"no_mapped_page"` or `"no_serp_archetype_signal"`.
Entries with those reasons have insufficient evidence and must not produce proposals.

---

## Response contract — SchemaProposal

```typescript
interface SchemaProposal {
  proposalId: string;             // see proposalId rules below
  proposalType: "schema";
  query: string;
  pageId: string;
  pageUrl: string;
  missingSchemaTypes: string[];   // sorted ascending
  existingSchemaTypes: string[];  // sorted ascending
  evidence: {
    serpSchemaSignals: string[];  // schema types implied by SERP features for this query
    hasNoSchemaAtAll: boolean;
  };
  suggestedAction: "review_schema_gap";
}
```

**Inclusion filter:** only emit entries where `SchemaOpportunityEntry.missingSchemaTypes.length > 0`
and `mappedPageId !== null`. Entries without a mapped page have no actionable
context and must not produce proposals.

`suggestedAction` is always `"review_schema_gap"` in Phase C1. There is only
one structural action this signal implies.

---

## ProposalId derivation rules

ProposalIds must be stable and deterministic across calls for identical inputs.
They must not use timestamps, random values, or database sequences.

**ArchetypeProposal:**
```
proposalId = "archetype:" + pageId + ":" + slugify(query)
```

**SchemaProposal:**
Schema proposals are per-page, not per-missing-schema-type. One proposal covers
all missing schema types for a given page+query combination. The sorted missing
schema types are included so that a change in the missing set produces a distinct
proposalId.
```
proposalId = "schema:" + pageId + ":" + sortedMissingSchemaTypes.join("+") + ":" + slugify(query)
```

**slugify rule:** lowercase, replace non-alphanumeric with hyphens, collapse
repeated hyphens, trim leading/trailing hyphens. This is a stable string
transform, not a hash.

Example: `"machine learning"` → `"machine-learning"`

These IDs are for operator-facing display and MCP tool consumption only.
They are not persisted. They are not foreign keys.

---

## Deterministic ordering rules

**archetypeProposals:**
Sort by `query` ascending, `existingPageId` ascending as tie-breaker.

**schemaProposals:**
Sort by `query` ascending, `pageId` ascending as tie-breaker.

Within each `SchemaProposal`:
- `missingSchemaTypes` sorted ascending
- `existingSchemaTypes` sorted ascending
- `evidence.serpSchemaSignals` sorted ascending

All sorts are deterministic string comparisons. No position-based ordering.

---

## Empty state behavior

If no proposals exist (e.g. no keywords, no SERP snapshots, no pages), return:

```json
{
  "data": {
    "projectId": "<uuid>",
    "proposals": {
      "archetypeProposals": [],
      "schemaProposals": []
    },
    "summary": {
      "archetypeProposalCount": 0,
      "schemaProposalCount": 0,
      "totalProposals": 0
    }
  }
}
```

Do not return a 404 or error for empty results. Empty is a valid project state.

---

## Implementation path

1. Add `src/lib/veda-brain/proposals.ts` — pure functions that project brain
   diagnostic outputs into `ArchetypeProposal[]` and `SchemaProposal[]`.
   No DB access. No side effects. Takes `VedaBrainDiagnostics` as input.

2. Add `src/app/api/veda-brain/proposals/route.ts` — calls
   `computeVedaBrainDiagnostics()` then `computeProposals()`, returns
   standard `successResponse`.

3. Add `scripts/hammer/hammer-veda-brain-proposals.ps1` — full hammer suite
   (see Hammer coverage section below).

4. Dot-source the new hammer module in `api-hammer.ps1`.

---

## Hammer coverage requirements

Before C1 is considered complete, the hammer suite must cover:

- `GET /api/veda-brain/proposals` returns 200
- Response envelope shape: `data.projectId`, `data.proposals`, `data.summary`
- `archetypeProposals` and `schemaProposals` are arrays
- `summary.totalProposals` equals `archetypeProposalCount + schemaProposalCount`
- Determinism: two calls return identical JSON (field-by-field)
- ProposalId stability: proposalIds are identical across calls
- ProposalId format: each `archetypeProposal.proposalId` starts with `"archetype:"`
- ProposalId format: each `schemaProposal.proposalId` starts with `"schema:"`
- No archetype proposals with `mismatchReason` of `"no_mapped_page"` or `"no_serp_archetype_signal"`
- No schema proposals with empty `missingSchemaTypes`
- No schema proposals with null `pageId`
- `suggestedAction` values are within the defined enum sets
- `archetypeProposals` ordered by query asc, pageId asc
- `schemaProposals` ordered by query asc, pageId asc
- POST rejected with 405
- Project isolation: cross-project call returns 400 or 404 (non-disclosure)
- Empty state: project with no keywords returns valid empty envelope (200, not error)

---

## Architectural invariants

This endpoint must observe all standard VEDA invariants:

- Project isolation enforced via `resolveProjectId()`
- Compute-on-read — no materialized proposal state
- No EventLog writes (read-only endpoint)
- Deterministic ordering throughout
- No LLM reasoning, no probabilistic scoring
- No mutation of Content Graph state

---

## Explicitly out of scope in Phase C1

- Topic proposals (deferred: DQ-001)
- Entity proposals (deferred: DQ-002)
- Authority-support proposals (deferred: DQ-003)
- Proposal persistence as DraftArtifact
- Operator apply / reject actions
- Filtering or pagination parameters on the proposals endpoint
- Confidence scores or priority scores
- LLM commentary on proposals
- MCP tool for proposals (follows after API is hammered and stable)
- VS Code extension surfacing of proposals (follows after MCP tool)
- Blueprint-seeded proposals
- `generatedAt` timestamp field

---

## Extension and UI sequencing

Backend first. The API surface must be implemented and hammered before any
operator-facing exposure is added.

Recommended sequencing after C1 API is green:
1. MCP `get_proposals` read-only tool (separate slice)
2. VS Code panel surfacing (separate slice after MCP tool)

Do not collapse these into the same implementation slice as the API.

---

## Related documents

- `docs/ROADMAP.md` — active development entry
- `docs/specs/CONTENT-GRAPH-PHASES.md` — content graph phase model
- `docs/specs/CONTENT-GRAPH-DATA-MODEL.md` — content graph data model
- `docs/specs/deferred/DQ-001-topic-proposals-deferred-from-phase-c1.md`
- `docs/specs/deferred/DQ-002-entity-proposals-deferred-from-phase-c1.md`
- `docs/specs/deferred/DQ-003-authority-support-proposals-deferred-from-phase-c1.md`
- `docs/specs/future-ideas/VEDA-BRAIN-MAGICAL-OPTIONS.md`
- `docs/specs/future-ideas/VEDA-TACTICS-LLM-REASONING.md`
