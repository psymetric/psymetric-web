# VEDA Operator Surfaces

## Purpose

This document defines the major operator surfaces of VEDA and the responsibilities of each.

VEDA is a **multi-surface operating system**.

No single surface is expected to do everything.

The purpose of this document is to reduce architectural blur by making the role of each surface explicit.

Related documents:
- `docs/ROADMAP.md`
- `docs/specs/VEDA-MCP-TOOLS-SPEC.md`
- `docs/specs/VEDA-REPO-NATIVE-WORKFLOW.md`
- `docs/specs/VEDA-BRAND-SURFACE-REGISTRY.md`

---

## Core Principle

VEDA owns deterministic structural truth.

LLMs may interpret, narrate, draft, and propose against that truth.

Humans review and apply changes.

This rule applies across all operator surfaces.

---

## Surface Types

### Web UX

The web UX is the broad operational and review surface.

It is the natural home for workflows such as:

- project onboarding
- project creation
- blueprint review
- cross-project dashboards
- broad observability
- team-readable summaries
- non-repo workflows

The web UX is important, but it is not the only execution surface.

---

### VS Code Extension

The VS Code extension is the primary **repo-native execution surface**.

It is the natural home for workflows such as:

- opening a project repository locally
- selecting the active VEDA project
- inspecting page and editor context
- reviewing diagnostics while looking at local files
- moving from VEDA Brain or observatory state into page work
- reviewing LLM-drafted repo changes through diff discipline
- performing file-based execution work before commit / push / deploy

VS Code is not just a development convenience. It is a core operator surface when the project has repository-backed assets.

---

### MCP / LLM Tool Layer

The MCP layer is the controlled interface between LLM assistants and VEDA system state.

It is responsible for:

- project-scoped reads
- proposal-oriented workflows
- structured access to deterministic VEDA state
- keeping LLM access inside API boundaries

It is not a license for silent mutation.

---

## Division Of Responsibilities

The surfaces are complementary.

### VEDA backend
Owns:
- deterministic structural truth
- project-scoped state
- blueprint state
- observatory data
- compute-on-read diagnostics
- mutation discipline

### Web UX
Owns:
- broader onboarding
- cross-project review
- high-level workflows that do not require local files

### VS Code
Owns:
- repo-native execution
- file and page context
- diff-oriented editing workflows
- continuity between diagnostics and implementation work

### MCP / LLM tools
Own:
- safe read/propose assistance
- structured reasoning support over VEDA state
- proposal generation that humans review

---

## Important Boundaries

### Repo changes are not VEDA mutations

Repository edits, commits, pushes, and deploys are not the same thing as mutating VEDA system state.

### VEDA mutations remain governed by system invariants

If VEDA system state changes, it must still obey:

- project isolation
- transaction discipline
- EventLog discipline
- review/apply rules

### Not every project surface is repo-native

Website work is often repo-native.

Other surfaces such as X or YouTube may still belong to the same project container without sharing the same execution mechanics.

---

## Why This Matters

Without explicit surface definitions, future implementation can drift into two bad patterns:

- trying to force every workflow into web UX
- trying to force every workflow into VS Code

Both are architectural mistakes.

VEDA should remain a coherent multi-surface system with clear responsibilities.
