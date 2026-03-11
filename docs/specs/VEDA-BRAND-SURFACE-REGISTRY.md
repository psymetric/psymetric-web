# VEDA Brand Surface Registry

## Purpose

This document defines how a VEDA project declares the brand surfaces it operates on.

A project is a **brand ecosystem container**. Project isolation is necessary, but not sufficient. Each declared surface also needs durable surface identity so VEDA can reason clearly about what belongs to the project.

Related documents:
- `docs/ROADMAP.md`
- `docs/specs/PROJECT-BLUEPRINT-SPEC.md`
- `docs/specs/VEDA-CREATE-PROJECT-WORKFLOW.md`
- `docs/specs/VEDA-OPERATOR-SURFACES.md`

---

## Core Rules

- Every declared surface belongs to exactly one project.
- Surface declarations are project-scoped.
- A project may declare multiple surfaces of different types.
- A project may also declare multiple accounts or channels on the same platform when needed.
- Declared brand surfaces are not the same thing as observed external ecosystem surfaces.

---

## Surface Types

Examples of declared brand surfaces include:

- website
- wiki
- blog / editorial
- X
- YouTube
- future brand surfaces

These surfaces are siblings inside the same project container, but they are not identical siblings. Different surface types may have different observation models and execution workflows.

---

## Surface Identity

Each declared surface should have durable identity.

At minimum, a surface declaration should preserve:

- project scope
- surface type
- human-readable label
- canonical platform identifier
- status
- primary / secondary role when relevant

Examples of canonical identifiers:

- website: canonical domain or equivalent durable site identity
- X: durable account identifier, not only display handle
- YouTube: durable channel identifier, not only channel title

This avoids brittle modeling based only on mutable display names.

---

## Multiple Accounts On The Same Platform

A project may have multiple accounts or channels on the same platform.

Examples:

- main brand X account
- founder X account
- support X account
- main YouTube channel
- clips or secondary YouTube channel

The registry should therefore model each declared surface as its own identity-bearing record, not collapse a whole platform into one slot per project.

---

## Owned vs Observed Distinction

VEDA must preserve the distinction between:

### Declared brand surfaces
Surfaces officially operated by the project.

### Observed external ecosystem surfaces
Competitor or ecosystem surfaces that matter analytically but are not owned by the project.

These are not interchangeable concepts and should not be modeled as the same thing.

---

## Workflow Role

Surface declarations are part of project initialization and blueprinting.

Typical role in workflow:

1. project is created
2. blueprint proposes intended surfaces
3. operator reviews the surface registry
4. approved surfaces become part of project structure
5. surface-specific observatories and workflows may later activate

---

## Why This Matters

Without a clear brand surface registry, future implementation can drift into blurry assumptions such as:

- one platform always equals one account per project
- project isolation alone is enough identity
- owned surfaces and observed external surfaces are the same thing

Those assumptions break down quickly in real brand ecosystems.
