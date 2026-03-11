# VEDA VS Code Operator Gap Map

## Purpose

This document maps the first-run operator audit findings onto the currently documented and implemented VS Code extension surfaces.

The goal is not to redesign the extension.

The goal is to identify:

- which operator gaps already have a natural home in the current VS Code surface
- which gaps are partially addressed
- which gaps are still missing
- where future fixes should attach
- which items belong to phased extension polish rather than system redesign

This document exists so operator-friction findings do not get lost or re-discovered repeatedly.

---

## Framing

VS Code is not just a development convenience for VEDA.

It is the primary **repo-native execution surface** for VEDA-guided work on websites and other repository-backed project surfaces.

That means the extension is expected to support workflows where an operator:

- opens a project repository locally
- selects the active VEDA project
- inspects diagnostics and observatory state
- opens page or file context
- reviews LLM-drafted proposals
- applies repository changes through normal diff / commit discipline

The current gap work is therefore about **operator continuity and discoverability**, not about proving whether VS Code matters.

Related documents:
- `docs/ROADMAP.md`
- `docs/specs/VEDA-OPERATOR-SURFACES.md`
- `docs/specs/VEDA-REPO-NATIVE-WORKFLOW.md`

---

## Source Inputs

This map is based on:

- `docs/First-run operator journey.md`
- current VS Code extension implementation in `vscode-extension/`
- current project/bootstrap/brain/proposal workflow state
- current roadmap and specs

Related documents:

- `docs/ROADMAP.md`
- `docs/specs/PROJECT-BLUEPRINT-SPEC.md`
- `docs/specs/VEDA-CREATE-PROJECT-WORKFLOW.md`
- `docs/specs/SERP-TO-CONTENT-GRAPH-PROPOSALS.md`
- `docs/specs/VEDA-OPERATOR-SURFACES.md`
- `docs/specs/VEDA-REPO-NATIVE-WORKFLOW.md`

---

## Current VS Code Surfaces

The current VS Code Command Center includes these primary surfaces and commands.

### Activity Bar Container

- `VEDA`

### Views

- `Project Context`
- `Editor Context`
- `Investigation Summary`
- `Top Alerts`
- `Keywords`
- `Recent Page Workflow`
- `SERP Observatory`
- `VEDA Brain`

### Important Commands

- `VEDA: Switch Environment`
- `VEDA: Select Project`
- `VEDA: Open Project Blueprint Workflow`
- `VEDA: Refresh Context`
- `VEDA: Investigate Project`
- `VEDA: Investigate Current Page Context`
- `VEDA: Refresh Editor Context`
- `VEDA: Refresh Summary`
- `VEDA: Refresh Alerts`
- `VEDA: Refresh Keywords`
- `VEDA: Refresh SERP Observatory`
- `VEDA: Refresh Brain Diagnostics`
- `VEDA: Brain → Open Page Command Center`

### Related but not yet fully surfaced in the extension operator loop

- project creation workflow
- proposal workflow (`GET /api/veda-brain/proposals`)
- broader project lifecycle transitions
- repo-native guidance linking VEDA state to local file execution

---

## Gap Mapping

---

### Gap 1 — “No projects found” is a first-run dead end

## Audit finding

A first-time operator can hit an immediate wall when `Select Project` is used and no projects exist.

The current outcome is effectively:
- no project found
- ensure one exists
- no adjacent recovery action

## Natural VS Code fit

Primary fit:
- `VEDA: Select Project`
- `Project Context` empty state

Secondary fit:
- command palette onboarding path

## Current status

- baseline implemented
- no-project recovery path now exists
- environment-unreachable vs zero-project state now distinguished

## Best fit for future improvement

- later, replace doc-guided recovery with direct create-project flow when that workflow is intentionally surfaced in the extension

## Priority

- completed baseline

## Scope classification

- extension polish
- onboarding continuity
- not a redesign

---

### Gap 2 — Environment selection is visible but not contextualized

## Audit finding

The operator can switch environments, but the system does not sufficiently explain:
- which environment should be used first
- whether local must be running
- whether a failure is connectivity vs emptiness vs wrong environment

## Natural VS Code fit

Primary fit:
- `VEDA: Switch Environment`
- status bar environment indicator

Secondary fit:
- `Project Context` empty / failure state

## Current status

- partially covered
- selection exists
- unreachable environment vs zero-project state is now clearer
- explanatory guidance is still thinner than it should be

## Best fit for future improvement

- show lightweight environment context after switching
- clarify local base URL
- surface reachability failure more explicitly across more panels
- distinguish:
  - unreachable environment
  - reachable but empty environment
  - no project selected

## Priority

- P2

## Scope classification

- extension polish
- environment ergonomics

---

### Gap 3 — Project Context should become the lifecycle-guided next-step anchor

## Audit finding

Project Context is already the best candidate for orienting the operator, but it needs to do more than show state.

It should tell the operator what the next valid step is.

## Natural VS Code fit

Primary fit:
- `Project Context`

## Current status

- baseline implemented
- lifecycle-guided fallback guidance is now present
- blueprint phase note is now surfaced for created/draft states

## Best fit for future improvement

- later, prefer stronger server-authored next-step guidance where available
- keep fallback guidance concise and operational

## Priority

- completed baseline

## Scope classification

- extension polish
- workflow continuity

---

### Gap 4 — Blueprint workflow is architecturally central but operationally hidden

## Audit finding

Blueprint is essential in docs/specs but not strongly discoverable in the extension operator flow.

## Natural VS Code fit

Primary fit:
- `Project Context`

Secondary fit:
- command palette
- setup/recovery path from no-project or newly created project

## Current status

- baseline implemented
- explicit command now exists: `VEDA: Open Project Blueprint Workflow`
- Project Context now points to blueprint more directly

## Best fit for future improvement

- later, add richer blueprint-specific operator flow only if intentionally brought into active scope
- avoid turning blueprint discoverability into a new subsystem by accident

## Priority

- completed baseline

## Scope classification

- extension polish
- blueprint discoverability

---

### Gap 5 — Empty states stop too early

## Audit finding

Many panels tell the operator that data is absent, but not:
- what the panel is for
- why it is empty
- what should happen next

## Natural VS Code fit

Primary fit:
- `Project Context`
- `SERP Observatory`
- `VEDA Brain`
- `Keywords`
- `Recent Page Workflow`
- `Investigation Summary`
- `Top Alerts`

## Current status

- baseline implemented across core first-run surfaces
- key panels now teach panel purpose, why empty, and next step more clearly
- smaller message consistency refinements may still remain later

## Best fit for future improvement

- continue tightening message consistency in non-core or lower-priority panels as needed
- keep copy short and operational

## Priority

- completed baseline

## Scope classification

- extension polish
- low effort / high value

---

### Gap 6 — Action continuity from diagnostics to next step is inconsistent

## Audit finding

VEDA Brain → Page Command Center linking is strong, but many diagnostics do not make the next action legible enough.

## Natural VS Code fit

Primary fit:
- `VEDA Brain`
- `Page Command Center`

Secondary fit:
- `Project Context`
- future proposal surfaces

## Current status

- partially covered
- one strong continuity pattern exists
- broader continuity still uneven

## Best fit for future improvement

- add lightweight cross-panel hints
- make “where to go next” more explicit
- tie diagnostics to:
  - Page Command Center
  - blueprint work
  - proposal review
  - observatory review
  depending on lifecycle and surface

## Priority

- P2

## Scope classification

- extension polish
- workflow continuity

---

### Gap 7 — Page Command Center is valuable but semi-hidden

## Audit finding

The Page Command Center is important but often discovered indirectly rather than as a clearly explained destination.

## Natural VS Code fit

Primary fit:
- `VEDA Brain`
- page investigation flows
- panel titles / tooltips

## Current status

- partially covered
- linked from Brain
- not introduced clearly enough in the broader operator loop

## Best fit for future improvement

- improve wording/tooltip on jump actions
- make destination context clearer
- use titles/descriptors that reduce mystery

## Priority

- P3

## Scope classification

- extension polish
- discoverability

---

### Gap 8 — Proposal workflow is not yet part of the operator’s visible loop

## Audit finding

Proposal helpers now exist in the API and MCP layer, but the first-run operator cannot yet naturally see where proposals fit in the extension workflow.

## Natural VS Code fit

Primary fit:
- future proposals panel
- `Project Context`
- `VEDA Brain`

## Current status

- currently missing from extension operator loop

## Best fit for future improvement

- add a dedicated proposals surface after current extension priorities are addressed
- tie proposals into existing lifecycle/state understanding
- avoid turning proposals into hidden API-only capability

## Priority

- P2 / P3

## Scope classification

- future extension surface
- active roadmap continuation

---

## Priority Rollup

### Completed baseline
- no-project recovery path
- Project Context as lifecycle-guided next-step anchor
- blueprint workflow discoverability
- stronger empty-state guidance in key surfaces

### P2
- environment context / reachability guidance
- diagnostic-to-next-step continuity hints
- proposals surfaced into the operator loop later

### P3
- Page Command Center naming/descriptor clarity
- command naming polish
- smaller discoverability refinements

---

## Recommended Use

This document should be used as a mapping/reference artifact when planning:

- extension polish slices
- onboarding improvements
- blueprint discoverability work
- proposal surface exposure
- Project Context improvements
- repo-native workflow continuity inside VS Code

It should not be treated as authorization for redesign.

---

## Guiding Principle

The current VEDA extension is already a real command center.

The initial first-run continuity baseline is now in place.

The current operator gap is no longer basic onboarding survival.

The current operator gap is clearer continuity across the live system:
- environment clarity
- what to do next from diagnostics
- where proposals fit
- how surfaces connect during real operator flow

This map exists to connect those operator gaps to the VS Code surfaces where they naturally belong.
