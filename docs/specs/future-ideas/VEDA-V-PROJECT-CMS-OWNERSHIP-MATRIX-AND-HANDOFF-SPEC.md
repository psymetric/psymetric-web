# VEDA, V Project, and CMS Ownership Matrix + Handoff Payload Spec

## Purpose

This document defines a future-facing architectural boundary model for three adjacent systems:

- **V Project** — upstream project planning and readiness
- **VEDA** — search intelligence observatory and structural truth
- **CMS / execution system** — production, publishing, and operational workflow

The goal is to preserve a **clean VEDA lens** while allowing adjacent systems to exist without architectural blur.

This document is **not active implementation authorization**.
It preserves the intended ownership boundaries and a candidate handoff model for future design work.

---

## Core Position

These systems should be treated as **related but separate systems**.

They may operate over the same real-world project, but they do **not** own the same truth.

The foundational split is:

- **V Project** owns planning truth and readiness truth.
- **VEDA** owns observatory truth and search-relevant structural truth.
- **CMS** owns execution truth and publishing workflow truth.

The systems may reference each other through explicit contracts.
They must not collapse into one giant shared-state product.

---

## System Mission Statements

### V Project

V Project exists to define, shape, audit, and assess whether a project is coherent enough to move downstream.

It is the home for:

- project definition
- research capture
- documentation-first planning
- architecture/spec readiness
- task traceability
- phase planning
- BYDA audits
- readiness evaluation

V Project answers questions like:

- What is this project?
- Is it coherent?
- What are the unresolved risks?
- Is it ready for implementation?
- Is it ready to enter VEDA?
- Is it ready to seed downstream execution systems?

### VEDA

VEDA exists to determine what is true in the search and discovery ecosystem.

It is the home for:

- project containers as bounded observatory scope
- blueprint grounding for observatory use
- surface registry state
- keyword research / targeting workflows
- SERP observatory workflows
- content graph structural truth
- compute-on-read diagnostics
- deterministic proposal helpers
- future discovery-surface lenses such as a YouTube observatory lens

VEDA answers questions like:

- What surfaces does this project operate on for observatory purposes?
- What is happening in the search ecosystem?
- What structural content assets exist?
- Where are the topic/entity/schema/archetype gaps?
- Where does internal authority flow appear weak or strong?
- What deterministic proposals follow from observed mismatch?

### CMS / Execution System

The CMS exists to carry out production and publishing work.

It is the home for:

- content planning HQ
- script management
- draft/revision workflow
- thumbnail workflow
- publishing calendar
- creator/editor workflow
- comments/replies workflow
- asset management
- channel/site publication operations

The CMS answers questions like:

- What content is being produced?
- What state is each draft in?
- What assets belong to which production item?
- What is scheduled and when?
- What has been published?
- What operational responses or moderation work is pending?

---

## Boundary Rule

A single real-world project may appear in all three systems, but with different bounded roles.

The correct architectural sentence is:

> **V Project determines whether a project is coherent and ready. VEDA determines what is true in the search/discovery ecosystem. The CMS determines what gets produced, scheduled, and published.**

This distinction must remain sharp.

---

## Ownership Matrix

| Domain / Capability | V Project | VEDA | CMS / Execution System | Notes |
|---|---|---|---|---|
| Canonical external project identity | Shared contract reference | Shared contract reference | Shared contract reference | Must be mapped explicitly, not assumed implicitly |
| Planning project definition | **Owns** | May reference bounded summary | May reference bounded summary | Project identity, goals, niche, readiness context |
| Research documents | **Owns** | May reference selectively | May reference selectively | VEDA should not become research dump storage |
| Architecture/spec documents | **Owns** | May reference selectively | May reference selectively | V Project is documentation-first |
| BYDA audits and readiness status | **Owns** | May receive handoff metadata | May receive setup metadata | VEDA should not become BYDA |
| Milestones / tasks / phase planning | **Owns** | Must not own | May own execution tasks only | Keep VEDA out of generic project management |
| VEDA project container | Must not own local authoritative row | **Owns** | Must not own | VEDA needs local project scope |
| Observatory lifecycle state | May reference | **Owns** | May reference | Only as relevant to observatory workflows |
| Blueprint for observatory grounding | May seed inputs | **Owns** | May consume derived guidance only | VEDA stores blueprint state needed for observatory operation |
| Surface registry for observatory scope | May seed inputs | **Owns** | May reference | VEDA must own observatory surface declarations |
| Keyword territory / targeting | Must not own authoritative observatory state | **Owns** | May consume advisory outputs | Search observatory responsibility |
| SERP snapshots / deltas / volatility / alerts | Must not own | **Owns** | Must not own | Core VEDA observatory data |
| Content Graph structural model | Must not own | **Owns** | Must not own | The Content Graph belongs in VEDA |
| Graph intelligence / brain diagnostics | Must not own | **Owns** | May consume advisory outputs | Compute-on-read structural truth |
| Proposal helpers | Must not own | **Owns** | May consume advisory outputs | Read-only observatory-generated proposals |
| YouTube observatory lens | Must not own | **Owns** | May consume advisory outputs | Only as observatory surface, not workflow system |
| Script drafts | Must not own | Must not own | **Owns** | CMS execution truth |
| Thumbnail workflow | Must not own | Must not own | **Owns** | CMS execution truth |
| Publishing calendar | Must not own | Must not own | **Owns** | CMS execution truth |
| Comments/replies workflow | Must not own | Must not own | **Owns** | CMS execution truth |
| Asset library / media variants | Must not own | Must not own | **Owns** | CMS execution truth |
| Publishing state | Must not own | May observe published existence by explicit contract | **Owns** | VEDA may observe what exists, but should not own production state |
| Execution revisions / approvals | Must not own | Must not own | **Owns** | CMS concern |
| Search-informed execution suggestions | Must not own | **Owns generation** | **Owns consumption / operationalization** | Clean advisory boundary |

---

## The Content Graph Decision

The **Content Graph belongs in VEDA**.

Reason:

The Content Graph is not a CMS workflow model.
It is not a project-planning model.
It is a **search-relevant structural model of the project’s internal ecosystem**.

It exists so VEDA can compare:

- external ecosystem truth (SERPs and future discovery lenses)
- internal ecosystem truth (Content Graph)

This comparison enables deterministic diagnostics and proposal generation.

The Content Graph therefore belongs with:

- blueprint grounding
- surface registry
- observatory state
- graph diagnostics
- VEDA Brain diagnostics

It should **not** be moved into a CMS database, where it would become coupled to execution workflow state.

---

## Project Container Decision

VEDA still requires its own local project container.

This is not optional, because VEDA must enforce:

- strict project isolation
- local observatory scope
- local lifecycle behavior relevant to observatory workflows
- blueprint state
- surface registry state
- ownership of observatory data and graph state

However, the VEDA project container must remain **bounded**.

VEDA must not become:

- the universal planning project record
- the master documentation store
- the task orchestration brain
- the content production workflow manager

So the correct principle is:

> **Projects belong in VEDA as observatory containers, not as full planning/execution universes.**

---

## Shared Identity Contract

These systems should not rely on an implicit “same row means same project” assumption.

A future relationship should use an explicit identity contract.

Recommended fields:

- `externalProjectKey`
- `canonicalSlug`
- `displayName`
- `originSystem`
- `vProjectProjectId` *(optional when applicable)*
- `vedaProjectId` *(optional when applicable)*
- `cmsProjectId` *(optional when applicable)*
- `handoffVersion`
- `createdAt`
- `updatedAt`

Important rule:

> **Same real-world project does not imply same database row, same local identifier, or same ownership authority.**

Each system should own its own local row and map explicitly to the shared external identity.

---

## Handoff Model

### Recommended Starting Model

Start with a **structured, bounded handoff** from V Project into VEDA.

Do **not** begin with:

- shared mutable database rows
- uncontrolled bidirectional sync
- raw document dumping into VEDA
- continuous background replication without explicit boundaries

The initial relationship should be:

1. Project is defined and audited in V Project.
2. V Project determines that the project is VEDA-ready.
3. V Project exports a bounded handoff payload.
4. VEDA imports that payload into its own project container / blueprint seed workflow.
5. VEDA owns all downstream observatory state locally.

A separate optional execution bootstrap payload may later be emitted from V Project and/or VEDA into a CMS.

---

## Handoff Payload Goals

A handoff payload should:

- provide only what the downstream system actually needs
- be explicit and reviewable
- be versioned
- be deterministic in structure
- preserve origin references
- avoid pretending to be a giant canonical dump of everything known about the project

The handoff should seed downstream systems, not replace their local ownership models.

---

## V Project → VEDA Handoff Payload Spec

### Overview

This payload is intended to seed a VEDA project container and blueprint workflow.

It should contain enough information for VEDA to:

- create or map the local observatory project
- establish bounded identity
- initialize surface registry expectations
- seed blueprint context
- preserve source references back to V Project

### Suggested Shape

```json
{
  "handoffVersion": "1.0",
  "sourceSystem": "v-project",
  "exportedAt": "2026-03-12T00:00:00Z",
  "identity": {
    "externalProjectKey": "proj_acme_001",
    "canonicalSlug": "acme-observatory",
    "displayName": "Acme Observatory"
  },
  "readiness": {
    "vedaReady": true,
    "status": "approved",
    "summary": "Project has coherent niche, seed surfaces, and blueprint inputs.",
    "openRisks": [
      "Keyword territory still broad and may need narrowing during research phase"
    ]
  },
  "blueprintSeed": {
    "strategicNiche": "Search intelligence tooling for independent operators",
    "audience": "solo builders and technical operators",
    "authorityPosture": "diagnostic and systems-level authority",
    "surfaceDeclarations": [
      {
        "surfaceType": "website",
        "label": "Main Site",
        "canonicalIdentifier": "https://example.com"
      },
      {
        "surfaceType": "youtube",
        "label": "Primary YouTube Channel",
        "canonicalIdentifier": "@examplechannel"
      }
    ],
    "websiteModel": {
      "siteType": "content-led product site",
      "frameworkHint": "Next.js",
      "notes": "Content graph expected to emphasize guides, comparisons, and reference pages"
    },
    "contentArchetypeHints": [
      "guide",
      "comparison",
      "reference"
    ],
    "topicTerritoryHints": [
      "search intelligence",
      "content graph diagnostics",
      "serp volatility"
    ],
    "entityTerritoryHints": [
      "SERP",
      "schema markup",
      "entity coverage",
      "search observability"
    ],
    "authorityModelHints": [
      "instructional authority",
      "diagnostic authority"
    ]
  },
  "sourceReferences": {
    "vProjectProjectId": "vp_123",
    "specRefs": [
      "spec://project-definition",
      "spec://blueprint-seed"
    ],
    "researchRefs": [
      "research://market-map",
      "research://surface-strategy"
    ]
  }
}
```

---

## Field Guidance

### Top-Level Fields

- `handoffVersion`
  - required
  - version identifier for payload interpretation

- `sourceSystem`
  - required
  - expected value for this flow: `v-project`

- `exportedAt`
  - required
  - ISO timestamp

### `identity`

- `externalProjectKey`
  - required
  - stable cross-system identity key

- `canonicalSlug`
  - required
  - human-readable canonical slug for cross-system mapping

- `displayName`
  - required
  - operator-facing project name

### `readiness`

- `vedaReady`
  - required
  - boolean declaration that upstream readiness has passed for VEDA handoff

- `status`
  - required
  - bounded string such as `approved`, `conditional`, `blocked`

- `summary`
  - optional but strongly recommended
  - operator-readable explanation of readiness status

- `openRisks`
  - optional list
  - unresolved issues that do not block handoff but may matter downstream

### `blueprintSeed`

This section must remain a **seed**, not a fully sovereign blueprint replacement.

VEDA should own final local blueprint state.

Suggested fields:

- `strategicNiche`
- `audience`
- `authorityPosture`
- `surfaceDeclarations[]`
- `websiteModel`
- `contentArchetypeHints[]`
- `topicTerritoryHints[]`
- `entityTerritoryHints[]`
- `authorityModelHints[]`

### `sourceReferences`

This section preserves traceability back to V Project without importing all upstream documents.

Suggested fields:

- `vProjectProjectId`
- `specRefs[]`
- `researchRefs[]`

These should remain lightweight identifiers or references, not raw source dumps.

---

## Import Semantics in VEDA

When VEDA imports a handoff payload, it should:

1. resolve or create its own local `Project` row
2. map the external identity to the local VEDA project
3. store or stage blueprint seed information for operator review/apply workflows
4. create/update local surface registry declarations as explicitly allowed
5. preserve origin metadata for traceability

VEDA should **not** treat the handoff as authority for all future downstream state.

Once imported:

- VEDA owns its observatory project container
- VEDA owns blueprint state relevant to its workflows
- VEDA owns content graph state
- VEDA owns all observatory data

---

## Optional V Project → CMS Bootstrap Payload

A future CMS bootstrap payload may exist, but it should remain separate from the VEDA handoff payload.

Reason:

The CMS needs production-oriented setup information, which differs from observatory-oriented setup information.

Example CMS-oriented inputs may include:

- channel/site execution destinations
- default workflow templates
- editorial categories
- asset conventions
- production lane preferences

These concerns should not be smuggled into VEDA just because they are adjacent to the same project.

---

## Optional VEDA → CMS Advisory Payload

A future advisory payload from VEDA into CMS may include:

- structural gap summaries
- archetype opportunities
- schema opportunities
- content territory suggestions
- support-structure suggestions
- observatory-derived notes for execution prioritization

Important rule:

This payload should remain **advisory**.

The CMS may operationalize it, but VEDA should not become the execution workflow engine.

---

## Database Strategy Guidance

### Preferred Conceptual Model

Keep **ownership separated first**, then decide infrastructure shape second.

The most important architectural rule is not whether systems share a database server.
The most important rule is whether they share **data ownership authority**.

Recommended principle:

- separate ownership domains
- explicit contracts
- explicit identity mapping
- no ambiguous cross-system mutation

### Practical Recommendation

If the CMS becomes a real execution system, it should likely have its **own database ownership boundary**.

VEDA should retain its own database ownership boundary because it has strong invariants around:

- project isolation
- event logging
- transactional mutation discipline
- deterministic observatory responses
- compute-on-read analytics

A CMS will have different mutation patterns and workflow concerns.

That makes a strong case for separate database ownership, even if early development temporarily shares infrastructure.

---

## What This Spec Does Not Authorize

This document does not authorize:

- immediate implementation of V Project
- immediate CMS implementation
- shared sync services now
- schema changes now
- uncontrolled cross-system mutation
- moving the Content Graph out of VEDA
- turning VEDA into a project manager or creator studio clone

This document preserves the future architecture boundary and the handoff model.

---

## Guiding Principle

Keep the observatory lens clean.

- **V Project** decides whether the project is coherent and ready.
- **VEDA** determines what is true in the search/discovery ecosystem.
- **CMS** executes production and publishing work informed by that truth.

The systems should cooperate through explicit contracts, not dissolve into architectural soup.
