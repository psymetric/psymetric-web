# VEDA Repo-Native Workflow

## Purpose

This document defines the intended repo-native operator workflow for VEDA-guided work.

It exists to make one architectural point explicit:

When a project surface is backed by a local repository, VS Code is the primary execution surface for implementation work.

Related documents:
- `docs/ROADMAP.md`
- `docs/specs/VEDA-OPERATOR-SURFACES.md`
- `docs/specs/VEDA-MCP-TOOLS-SPEC.md`
- `docs/specs/VEDA-VSCODE-OPERATOR-GAP-MAP.md`

---

## Core Workflow

A typical repo-native workflow looks like this:

1. Operator opens the project repository locally in VS Code.
2. Operator selects the active VEDA project.
3. VEDA surfaces project context, lifecycle state, and relevant diagnostics.
4. Operator opens a page, route, or file in local workspace context.
5. VEDA surfaces page context, observatory context, or Brain diagnostics.
6. An LLM may read VEDA state and workspace context to draft a proposal.
7. Operator reviews the proposed file changes through normal diff discipline.
8. Operator applies the accepted changes.
9. Operator commits, pushes, and deploys through normal repo / hosting workflows.
10. VEDA remains the deterministic source of structural truth throughout the process.

---

## Role Split

### VEDA
Owns:
- project-scoped state
- blueprint state
- observatory state
- content graph state
- deterministic diagnostics
- proposal helpers

### VS Code
Owns:
- repo-native file context
- editor context
- page execution surface
- continuity between diagnostics and implementation work

### LLM
Owns:
- reading
- interpretation
- summarization
- proposal drafting

### Human operator
Owns:
- review
- apply decisions
- commit / push / deploy decisions

---

## Guardrails

### No silent VEDA mutation

If VEDA state changes, it must follow normal system invariants.

### No silent repo mutation

Repository changes must be reviewable as file diffs.

### Repo changes and VEDA changes are distinct

A repository patch is not the same thing as mutating VEDA system state.

They may relate to the same project or diagnostic, but they are not interchangeable.

### Web UX still matters

Repo-native execution does not eliminate the need for web UX.

Web UX remains the natural place for:
- onboarding
- cross-project dashboards
- broad review surfaces
- workflows that do not require local repository context

---

## Why This Document Exists

Without this contract, future implementation can drift into the false assumption that all VEDA workflows should be forced into a web UI.

That would weaken the operator experience for real implementation work.

The intended model is multi-surface:
- web for broad workflows
- VS Code for repo-native execution
- MCP for safe LLM interaction with VEDA state
