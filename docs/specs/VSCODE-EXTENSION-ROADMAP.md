# VEDA VS Code Extension Roadmap

## Purpose

This document defines the practical roadmap for the VEDA VS Code extension after Phase 1 foundation work.

It exists to prevent architecture drift and avoid scattered implementation decisions.

The extension must evolve in small, modular layers.

It is an **operator cockpit**, not a second backend.

All intelligence remains in VEDA.

---

## Core Extension Rules

These rules apply to every phase.

### Thin Shell Only

The extension may:

- render UI
- collect operator input
- call VEDA HTTP API routes or MCP-backed surfaces
- render returned results

The extension may not:

- access the database directly
- compute observatory analytics locally
- invent business logic
- infer lifecycle transitions
- invoke LLM systems directly
- mutate silently

---

### Read-Only By Default

Until mutation workflows are explicitly designed and approved, the extension remains read-only.

No write flows should be added casually.

---

### No Polling

The extension must not introduce:

- background polling loops
- hidden refresh timers
- background auto-investigations
- silent state mutation

Refresh must be explicit or tied to clear operator actions.

---

### Reuse Existing Surfaces

The extension should reuse:

- existing results panel
- existing commands
- existing API routes
- existing MCP composites

Do not create duplicate client-side flows if the command center can route into a surface that already exists.

---

## Current State

The extension foundation already supports:

- environment switching
- project selection
- project context view
- project investigation command
- keyword diagnostic command
- reusable results panel

This is the command-center base.

---

## Phase 1.5 — Alive Sidebar

### Goal

Make the command center feel like a living observatory while staying within the thin-shell architecture.

### Scope

#### 1. Top Alerts Sidebar

Add a read-only sidebar view that shows top alerts for the active project.

Preferred source:

- `GET /api/seo/alerts`
- or the simplest existing alert surface already used by VEDA

Each item should show only data already present in the payload, such as:

- keyword or query
- severity or severity rank
- trigger type
- maturity
- volatility score if already returned

Clicking an alert should route into an existing read-only surface, preferably the keyword diagnostic panel.

---

#### 2. Keywords Sidebar

Add a read-only sidebar view that shows keyword targets for the active project.

Preferred source:

- `GET /api/seo/keyword-targets`

Each item should show only existing backend fields, such as:

- keyword
- locale
- device
- primary marker if available

Clicking a keyword should reuse the existing keyword diagnostic flow.

---

#### 3. Empty States

All sidebar views must show clear operator-facing empty states.

Examples:

- `Select a project to view alerts`
- `No alerts in the last 7 days`
- `No keyword targets yet`

Blank trees should be avoided where practical.

---

#### 4. Loading States

All sidebar views should show a clear loading indication.

Examples:

- `Loading alerts…`
- `Loading keywords…`

This can be done through placeholder tree items or native tree view messaging.

---

#### 5. Refresh Affordances

Each read-only sidebar view should expose an explicit refresh command.

Examples:

- `VEDA: Refresh Alerts`
- `VEDA: Refresh Keywords`

These should appear in the view toolbar when useful.

---

#### 6. Counts

Where practical, the extension should surface lightweight counts.

Examples:

- `Top Alerts (6)`
- `Keywords (42)`

If view-title counts are awkward, a native message-based count is acceptable.

---

### Out of Scope for Phase 1.5

- content graph integration
- page command center
- editor-aware page analysis
- CodeLens
- mutation workflows
- local analytics
- polling
- React migration

---

## Phase 1.75 — Guided Observatory UX

### Goal

Improve operator clarity and reduce ambiguity without adding backend logic.

### Scope

#### 1. Better Item Rendering

Improve scanability of tree items.

Examples:

- severity icons for alerts
- compact keyword descriptions
- primary markers
- minimal freshness hints if timestamps already exist in payloads

Do not derive new meaning locally.

---

#### 2. Results Panel Metadata

The results panel should always make context explicit.

Display:

- active project
- active environment
- source command
- fetch timestamp if easily available

This improves trust and orientation.

---

#### 3. Status Bar Summary

Optionally extend the status bar to include lightweight context.

Examples:

- `VEDA: LOCAL | 6 alerts`
- `VEDA: LOCAL | Example Project`

Keep this compact and non-noisy.

---

#### 4. Better Project Switching Behavior

When the active project changes:

- clear stale data
- refresh all sidebar views
- update status context
- avoid stale result confusion

This should remain explicit and predictable.

---

#### 5. Investigation Summary Node

A lightweight read-only summary node may be added if existing backend surfaces make it cheap.

Examples:

- active alerts count
- volatility summary
- project risk summary

This must come from existing backend responses rather than local composition if possible.

---

### Out of Scope for Phase 1.75

- Page Command Center
- content graph editing
- mutation workflows
- automated recommendations applied by extension

---

## Phase 2 — Page-Aware Intelligence

### Goal

Connect the command center to page context inside the editor.

This is where VEDA begins to feel like a true page intelligence system.

### Entry Features

#### 1. Page Command Center

Allow the operator to analyze the current page against the search ecosystem.

Potential inputs:

- current file
- current slug or route
- page metadata
- content graph registration later

Potential outputs:

- page archetype mismatch
- weak internal support structure
- missing schema coverage
- SERP comparison
- execution planning suggestions

This phase depends on stronger contracts from:

- `docs/specs/VSCODE-PAGE-COMMAND-CENTER.md`
- `docs/specs/CONTENT-GRAPH-LAYER.md`
- `docs/specs/CONTENT-GRAPH-SYNC-CONTRACT.md`

---

#### 2. Editor-Aware Commands

Examples:

- `VEDA: Analyze Current Page`
- `VEDA: Compare Current Page to SERP`
- `VEDA: Open Page Diagnostic`

These must still call backend surfaces rather than compute analysis locally.

---

#### 3. Content Graph Surfaces

Once Content Graph implementation exists, the extension may expose read-only Content Graph information.

Examples:

- page registration summary
- internal links
- schema usage
- entity coverage

This remains read-only until mutation rules are explicitly designed.

---

## Future Phase — Controlled Mutation Workflows

### Goal

Allow operator-approved workflows that propose, review, and apply changes through VEDA discipline.

This phase is **not active**.

Any future mutation workflow must obey:

- propose → review → apply
- EventLog discipline
- transaction invariants
- explicit operator approval

Examples of future-only capabilities:

- page proposal flows
- content graph registration actions
- patch review panels
- apply approved structural changes

These must not be implemented opportunistically.

---

## Explicit Non-Goals

The extension roadmap does **not** authorize the following right now:

- extension-side observatory logic
- background automation
- autonomous crawling or monitoring
- React-heavy UI rewrite without need
- direct DB access
- hidden local state machines
- generic CMS admin explorer sprawl

VEDA is not building a random admin panel.

It is building a command center for a search intelligence observatory.

---

## Suggested Implementation Order

### Now

1. complete Top Alerts sidebar
2. complete Keywords sidebar
3. add empty states
4. add loading states
5. add refresh affordances
6. add counts

### Next small polish wave

7. improve tree item rendering
8. add compact status bar summary
9. add results panel metadata
10. harden project-switch refresh behavior

### After that

11. lifecycle-aware emphasis
12. investigation summary node
13. next-valid-action display when backend supports it cleanly

### Later

14. Page Command Center
15. Content Graph read surfaces
16. editor-aware page intelligence workflows

---

## Decision Rule

Before implementing any new extension feature, ask:

1. Does this keep the extension a thin shell?
2. Does this reuse an existing backend surface?
3. Does this avoid polling and background automation?
4. Does this avoid adding mutation behavior casually?
5. Does this make the operator experience clearer right now?

If the answer to any of these is no, the feature likely belongs in a later phase.

---

## Summary

The extension should evolve in deliberate layers:

Phase 1
- foundation

Phase 1.5
- alive sidebar

Phase 1.75
- guided observatory UX

Phase 2
- page-aware intelligence

Future
- controlled operator-approved mutation workflows

This keeps the command center modular, useful, and aligned with VEDA’s observatory architecture.
