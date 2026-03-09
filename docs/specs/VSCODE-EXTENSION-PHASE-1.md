# VEDA VS Code Extension — Phase 1 Implementation Spec

## Status

Active implementation target.

This document defines the exact Phase 1 contract for the VEDA VS Code extension.

It translates the broader vision, lifecycle UX, semantic engine integration rules, and command-center architecture into a minimal, buildable, non-drifting implementation target.

Phase 1 is intentionally narrow.

Its purpose is to prove the operator loop:

VS Code
→ project context
→ VEDA API / MCP
→ structured observatory response
→ operator action

Phase 1 does **not** attempt to implement the full extension vision.

---

## Phase 1 Goal

Deliver a thin, reliable VS Code operator surface for the existing VEDA observatory.

This phase proves that operators can:

- select an environment
- select a project
- view current lifecycle context
- run a project investigation
- run a keyword diagnostic
- read structured results inside VS Code

The extension must remain a **thin client shell**.

All intelligence lives in VEDA.

---

## Non-Negotiable Constraints

### 1. Extension is a client only

The extension may:

- render UI
- collect explicit operator input
- call MCP tools or VEDA HTTP API routes
- render returned results

The extension may not:

- access the database directly
- compute business logic locally
- construct observatory analytics locally
- invent mutations
- invoke LLM systems directly

---

### 2. Read-only Phase

Phase 1 is read-only.

No mutation workflows are included in this phase.

No page creation.
No lifecycle transitions.
No content graph registration.
No alert mutation.
No patch application.

---

### 3. Project context must always be visible

The active project must remain explicit in the UI.

Operators should never wonder which project they are looking at.

At minimum, the following must be visible in one persistent surface:

- active environment
- active project name
- active project domain if available
- lifecycle state if available

---

### 4. Activation must be narrow

The extension must activate only when needed.

Preferred activation events:

- command invocation
- VEDA sidebar reveal

Do not activate eagerly on editor startup unless required by VS Code for contributed views.

---

## Phase 1 Scope

Phase 1 includes exactly four operator surfaces.

### A. Environment Switcher

A status bar item displays the current environment.

Examples:

- `VEDA: LOCAL`
- `VEDA: STAGE`
- `VEDA: PROD`

Click behavior:

- opens Quick Pick
- allows switching active environment

Environment config includes:

- label
- base URL
- auth token or placeholder for future auth

Phase 1 may support unauthenticated local workflows, but the architecture must be compatible with future SecretStorage-based auth.

---

### B. Project Context View

A sidebar view shows the active project context.

Required fields:

- project name
- project domain if available
- lifecycle state if available
- maturity summary if available
- next valid action if available

The view must be refreshable.

This view is the anchor of the command center.

---

### C. Project Investigation Command

Command:

`VEDA: Investigate Project`

Behavior:

- runs the existing project-level investigation surface
- fetches a structured investigation packet
- renders the packet in a reusable results panel

Preferred backend source:

- MCP composite tool `run_project_investigation`

If implementation chooses direct HTTP instead of MCP transport, the response shape must still mirror the existing observatory contract and remain API-only.

---

### D. Keyword Diagnostic Command

Command:

`VEDA: Keyword Diagnostic`

Behavior:

- lets operator choose a keyword target from the active project
- requests the keyword-level diagnostic packet
- renders the packet in the reusable results panel

Preferred backend sources:

- `get_keyword_overview`
- `get_keyword_diagnostic`
- `get_event_causality`

Exact orchestration may vary, but the extension must not compute these results locally.

---

## Explicitly Out of Scope for Phase 1

The following are excluded even if future docs mention them:

- entity explorer tree for generic content operations
- relationship editor
- mutation commands
- patch review panels
- audit runner
- CodeLens integration
- diagnostics in Problems panel
- content graph mutation flows
- page command center
- Rebecca integration
- background polling
- local persistence beyond lightweight settings and ephemeral session state

These are future layers.

Phase 1 proves the command center foundation only.

---

## Command Set

Phase 1 command palette commands:

### 1. `VEDA: Switch Environment`

Purpose:
- switch active environment

Behavior:
- show Quick Pick of configured environments
- persist selected environment
- refresh visible views

---

### 2. `VEDA: Select Project`

Purpose:
- set active project context

Behavior:
- query available projects
- show Quick Pick
- persist selected project for current workspace/session
- clear stale result panels if project changes

---

### 3. `VEDA: Refresh Context`

Purpose:
- refresh project context view and current cached read surfaces

Behavior:
- re-fetch project metadata and lifecycle-related context
- no mutation

---

### 4. `VEDA: Investigate Project`

Purpose:
- run top-level project investigation

Behavior:
- requires active project
- opens results panel
- shows progress state while request is in flight

---

### 5. `VEDA: Keyword Diagnostic`

Purpose:
- inspect a keyword target in the active project

Behavior:
- requires active project
- lets operator choose a keyword target
- fetches keyword packet
- opens results panel

---

## Sidebar / View Container Structure

The extension should contribute one VEDA view container.

Initial Phase 1 layout:

VEDA
- Project Context
- Investigation Summary (optional lightweight tree or summary node)
- Top Alerts (optional read-only summary if already available from project investigation)

The implementation may keep this minimal.

The critical requirement is that the sidebar must not become a dense generic CMS explorer in Phase 1.

It is an observatory shell, not a content admin panel.

---

## Results Panel Contract

Phase 1 uses one reusable results panel or webview for structured outputs.

This panel may render:

- project investigation packets
- keyword diagnostic packets

The rendering can be simple.

It must display:

- panel title
- active project context
- source command used
- structured sections from the returned packet

Desired characteristics:

- readable
- deterministic
- no client-side inference
- no hidden mutation controls

If a webview is used, keep it lightweight.

Do not introduce React unless implementation complexity genuinely requires it.

---

## Recommended Data Flow

Preferred flow:

VS Code Command
→ extension command handler
→ transport client
→ MCP tool or VEDA HTTP API
→ structured JSON response
→ render in panel / view

The extension should have a single transport abstraction.

Suggested service:

`VedaClient`

Responsibilities:

- resolve active environment
- inject auth when future auth is added
- inject project context where required
- handle bounded retry for read calls only
- normalize transport errors into user-facing messages

The client must not implement domain logic.

---

## State Model

Phase 1 should use a tiny shared state service.

Suggested responsibilities:

- active environment
- active project
- cached project list for current session
- currently open result panel reference

Suggested service:

`StateService`

Rules:

- no durable local database
- no offline sync store
- no hidden mutation queue
- no long-lived local observatory cache

Simple is correct here.

---

## File / Module Architecture

Recommended structure:

src/
- extension.ts
- registerCommands.ts
- commands/
  - switchEnvironment.ts
  - selectProject.ts
  - refreshContext.ts
  - investigateProject.ts
  - keywordDiagnostic.ts
- providers/
  - projectContextProvider.ts
- views/
  - resultsPanel.ts
- services/
  - vedaClient.ts
  - stateService.ts
  - configService.ts
- types/
  - api.ts
  - project.ts
  - keyword.ts
- utils/
  - errors.ts
  - formatting.ts

This structure keeps activation logic, transport, rendering, and command orchestration separate.

---

## Configuration Contract

The extension should support configured environments.

Minimum settings shape:

```json
{
  "veda.environments": {
    "local": { "baseUrl": "http://localhost:3000" },
    "stage": { "baseUrl": "https://stage.example.com" },
    "prod": { "baseUrl": "https://example.com" }
  },
  "veda.activeEnvironment": "local"
}
```

Future auth tokens should move to SecretStorage.

Do not design Phase 1 around plaintext token dependency.

---

## Error Handling Rules

Errors must be visible, clear, and boring.

Use standard VS Code messaging surfaces for Phase 1:

- information message
- warning message
- error message
- progress notification during long requests

Required handling:

- no active project selected
- no environments configured
- API unreachable
- malformed response
- empty project list
- empty keyword list

Read requests may retry once with bounded backoff.

Write retries are irrelevant in Phase 1 because there are no writes.

---

## Lifecycle-Aware Rendering

Phase 1 should respect lifecycle UX where practical, but only in presentation.

Examples:

- emphasize ingest / observation actions during `observing`
- emphasize alerts and volatility during `developing`
- emphasize long-term patterns during `seasoned`
- show paused / archived state clearly

The extension must not compute lifecycle state itself.

It reads lifecycle context from backend surfaces and renders accordingly.

---

## Performance Rules

- no background polling loops
- no heavy startup work
- no extension-side analytics
- no repeated project refresh unless operator triggers it
- no large cached data blobs in memory unless necessary for active rendering

Phase 1 should feel lightweight.

---

## Phase 1 Success Criteria

Phase 1 is complete when all of the following are true:

1. Operator can switch environment from status bar.
2. Operator can select an active project.
3. Sidebar reliably shows project context.
4. `VEDA: Investigate Project` returns and renders a project packet.
5. `VEDA: Keyword Diagnostic` returns and renders a keyword packet.
6. Project context remains explicit across all views and commands.
7. Extension performs no direct DB access and no local business logic.
8. No write or mutation surface exists in Phase 1.

---

## Relationship to Other Docs

This document is the implementation bridge between:

- `docs/VSCODE-EXTENSION-SPEC.md`
- `docs/VSCODE-EXTENSION-LIFECYCLE-UX.md`
- `docs/PsyMetric_VSCode_Semantic_Engine_Integration_v1.0.md`
- `docs/VISION-VEDA-COMMAND-CENTER.md`
- `docs/specs/VSCODE-PAGE-COMMAND-CENTER.md`

Interpretation rule:

- those docs define broader vision, UI philosophy, or future layers
- this doc defines the exact Phase 1 build target

If a broader document conflicts with this Phase 1 scope, this Phase 1 spec governs implementation for the initial extension release.

---

## Summary

Phase 1 delivers a minimal VEDA command center inside VS Code.

It is intentionally narrow.

It proves that the observatory can be operated cleanly from the editor without introducing architectural drift, local business logic, or premature mutation workflows.
