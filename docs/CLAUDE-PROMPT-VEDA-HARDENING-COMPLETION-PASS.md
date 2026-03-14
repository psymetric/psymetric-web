# Claude Prompt — VEDA Hardening / Completion Pass (Low-Level Audit)

You are performing a **low-level hardening and completion audit** for VEDA before any YouTube observatory implementation work begins.

This is a **microscope audit**, not a vibes audit.

Your job is to inspect the real repository state, verify what is complete, identify what is still unfinished or weak, and protect the current VEDA observatory from expansion before the foundation is genuinely ready.

Do not redesign the system casually.
Do not jump ahead into YouTube implementation.
Do not treat future-idea docs as active implementation scope.
Your role here is to help confirm that current VEDA is coherent, hardened, and closed enough before the next observatory surface is added.

---

## Repository / Environment

Working directory:

`C:\dev\psymetric`

Repository root:

`C:\dev\psymetric`

Active branch expected:

`feature/veda-command-center`

Stack:

- Next.js 16
- Prisma
- Postgres
- TypeScript
- PowerShell tooling
- VS Code extension
- MCP server

Important environment note:

Use the real repository state.
Do not assume docs are fully up to date unless you verify them against code.
Do not write files outside the repository workspace.
Do not write to Linux temp/home paths.

---

## Audit Objective

Determine whether **current VEDA** is truly ready to be considered “done enough” for its current active scope **before** a YouTube lens is added.

This means auditing current VEDA for:

- architectural coherence
- observatory-boundary discipline
- workflow completion
- implementation completeness relative to active roadmap
- hammer confidence / coverage gaps
- operator continuity
- doc-to-code alignment
- low-level sharp edges or unfinished seams

This is not a marketing audit.
This is not a product-vision brainstorm.
This is a systems hardening pass.

---

## Core Invariants (Non-Negotiable)

You must evaluate all current work against these invariants:

### Project Isolation

- all project-scoped queries resolve scope through `resolveProjectId()`
- cross-project access must produce 404 non-disclosure behavior
- no entity existence leakage

### Mutation Discipline

- no mutation without EventLog
- no EventLog without mutation
- all writes inside `prisma.$transaction()`

### Determinism

- explicit ordering everywhere
- stable tie-breakers
- deterministic pagination behavior
- no implicit DB ordering relied upon

### Schema Discipline

- no casual schema drift
- write schemas use `Zod.strict()` where applicable
- no unauthorized scope expansion disguised as cleanup

### Compute-on-Read Discipline

- no background jobs
- no cron analytics
- no persistent analytics caches
- no materialized volatility tables

### Hammer Discipline

- hammer suite is authoritative
- if docs/spec conflict with hammer behavior, hammer wins

### Observatory Boundary

VEDA must remain:

- search/discovery observatory
- structural-truth system
- diagnostics/proposals system

VEDA must not drift into:

- general project management
- CMS/editorial workflow
- creator workflow
- social reply tooling
- execution management

---

## Required Reading Before Audit

Read and use these as your starting context, but verify them against the codebase:

1. `docs/ROADMAP.md`
2. `docs/SYSTEM-INVARIANTS.md`
3. `docs/specs/CONTENT-GRAPH-DATA-MODEL.md`
4. `docs/specs/CONTENT-GRAPH-PHASES.md`
5. `docs/specs/PROJECT-BLUEPRINT-SPEC.md`
6. `docs/specs/VEDA-CREATE-PROJECT-WORKFLOW.md`
7. `docs/specs/VEDA-MCP-TOOLS-SPEC.md`
8. `docs/specs/SERP-TO-CONTENT-GRAPH-PROPOSALS.md`
9. `docs/specs/VEDA-VSCODE-OPERATOR-GAP-MAP.md`
10. `docs/First-run operator journey.md`
11. `docs/specs/deferred/DQ-001-topic-proposals-deferred-from-phase-c1.md`
12. `docs/specs/deferred/DQ-002-entity-proposals-deferred-from-phase-c1.md`
13. `docs/specs/deferred/DQ-003-authority-support-proposals-deferred-from-phase-c1.md`

Also inspect current implementation in:

- `src/lib/content-graph/`
- `src/lib/veda-brain/`
- `src/app/api/content-graph/`
- `src/app/api/veda-brain/`
- `src/app/api/projects/`
- `scripts/hammer/`
- `scripts/api-hammer.ps1`
- `vscode-extension/`
- `mcp/server/`

---

## Audit Questions You Must Answer

### 1. Current-Scope Completion

Relative to the active roadmap and committed system direction:

- what is fully implemented and coherent?
- what is implemented but still rough or weak?
- what is partially implemented and still needs hardening?
- what is still missing but implied by current active scope?

Be specific.
Do not hand-wave.

### 2. Observatory Boundary Integrity

Audit whether current VEDA has remained a clean observatory.

Look for any drift toward:

- project-management sprawl
- execution-system concerns
- creator/editorial workflow logic
- future-ideas contamination into active implementation

Call out anything muddy.

### 3. Low-Level Invariant Audit

Inspect current implementation for evidence of:

- missing `resolveProjectId()` usage
- non-deterministic ordering
- missing tie-breakers
- suspicious pagination behavior
- writes outside transactions
- writes without EventLog
- EventLog without real state mutation
- cross-project leakage risk
- schemas that are looser than expected

This section should be microscope-level.

### 4. Operator Continuity Audit

Using docs plus extension code, determine whether the operator loop is truly complete enough for current scope.

Audit for:

- first-run continuity
- no-project recovery
- lifecycle-guided next steps
- blueprint discoverability
- proposals discoverability
- diagnostics-to-next-step continuity
- command center panel consistency
- environment clarity and wording
- dead ends or confusing empty states

Distinguish between:

- already solved
- partially solved
- still weak

### 5. Hammer / Verification Audit

Inspect hammer coverage and current test posture.

Answer:

- what current behaviors seem strongly defended by hammer?
- where do hammer gaps likely exist?
- what high-risk areas should be hammered before YouTube work begins?

Pay special attention to:

- project isolation probes
- blueprint/apply flows
- content-graph writes
- diagnostics determinism
- proposal determinism
- MCP tool behavior
- extension/API continuity assumptions if testable

### 6. Docs ↔ Code Alignment Audit

Identify where docs, roadmap, and implementation are:

- aligned
- slightly stale
- materially out of sync

Do not merely complain that docs lag code.
Pinpoint which docs matter and how stale they are.

### 7. “Done Enough Before YouTube?” Judgment

Give a hard judgment.

Choose one:

- **YES — current VEDA is sufficiently coherent/hardened to begin YouTube planning/implementation**
- **NO — current VEDA still has completion/hardening work that should be closed first**
- **MIXED — current VEDA is mostly ready, but a bounded set of specific hardening items should be completed first**

Then justify it precisely.

---

## Required Output Format

Produce a report with these exact sections:

# VEDA Hardening / Completion Audit

## 1. Repository State Verified
- branch
- key recent commits
- relevant uncommitted/untracked state if any

## 2. Current Scope Status
- fully complete
- complete but rough
- partial / still open

## 3. Low-Level Invariant Findings
- isolation
- transactions/EventLog
- determinism
- schema discipline
- compute-on-read discipline

## 4. Operator Continuity Findings
- strong areas
- weak areas
- unresolved friction

## 5. Hammer / Verification Findings
- defended well
- weakly defended
- recommended hammer additions

## 6. Docs / Roadmap Alignment Findings
- aligned
- stale
- needs update

## 7. Boundary Integrity Findings
- where VEDA is clean
- where drift risk exists

## 8. Pre-YouTube Readiness Judgment
- YES / NO / MIXED
- concise reasoning

## 9. Required Pre-YouTube Hardening Tasks
Provide a **prioritized list** of the concrete tasks that should be completed before YouTube work begins.

For each task include:
- title
- why it matters
- what repo area it touches
- whether it is docs, code, hammer, MCP, or VS Code work

## 10. Nice-To-Have But Not Blocking
Keep this separate from required hardening.

---

## Audit Method Expectations

- verify against real code where possible
- use docs only as context, not as blind truth
- do not invent implementation status
- do not recommend giant redesigns
- prefer bounded hardening tasks over broad ambitions
- be strict about the difference between “implemented” and “solid”
- be strict about the difference between “future idea” and “active scope”

---

## Final Constraint

Do not turn this into a YouTube implementation brainstorm.

The point of this pass is:

> **finish and harden current VEDA before expanding the observatory to a new surface**

Treat this as a serious architectural readiness audit.
