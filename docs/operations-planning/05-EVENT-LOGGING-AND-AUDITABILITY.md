# Event Logging & Auditability

## Purpose
This document defines **how actions are recorded, traceable, and reconstructible** within the PsyMetric system.

It exists to:
- make system behavior explainable over time
- preserve accountability for human and LLM actions
- support debugging, review, and reflection
- prevent silent or ambiguous state changes

If something happened, the system should be able to explain *what*, *when*, *how*, and *by whom*.

---

## Core Principle

**Nothing important happens silently.**

All meaningful state changes and actions are recorded as events.

Event logs describe *what occurred*; they do not interpret intent.

---

## What Is an Event

An Event is a structured record of a significant action taken within the system.

Events are immutable once written.

Examples of events:
- Source captured
- Entity created
- Relationship added or removed
- Draft updated
- Publish requested
- Entity published
- Entity archived
- Validation failed

---

## Event Actors

Every event records an actor type:

- `human` – actions taken by the operator
- `llm` – actions taken by an LLM assistant
- `system` – automated internal actions (e.g., revalidation)

Actors describe *who acted*, not *who is responsible*.

---

## Minimum Event Fields

Each event must record:

- `eventType`
- `actorType` (human | llm | system)
- `actorId` (if applicable)
- `entityId` (if applicable)
- `timestamp`
- `details` (structured, minimal)

Events must be machine-readable and human-auditable.

---

## When Events Must Be Logged

Events are required for:

- All publish state transitions
- Creation or deletion of entities
- Relationship changes
- SourceItem lifecycle changes
- LLM-assisted draft creation or modification
- Validation failures

If an action affects visibility, truth, or structure, it must emit an event.

---

## What Events Are Not Used For

Events are **not**:
- analytics metrics
- engagement tracking
- behavioral profiling
- performance monitoring

Those concerns live elsewhere.

---

## Audit Use Cases

The event log must support:

- Reconstructing why a page exists
- Understanding how a page changed over time
- Identifying which actions were LLM-assisted
- Debugging incorrect or surprising outcomes

The log exists for clarity, not surveillance.

---

## Event Visibility

- Events are internal-only by default
- Operators may view event history per entity
- Events are not exposed publicly unless explicitly required

Transparency is for maintainers, not users.

---

## Immutability & Corrections

- Events are append-only
- Corrections are logged as new events
- Past events are never edited or deleted

History is preserved even when content changes.

---

## Invariants

- All critical actions emit events
- Events are immutable
- Actor type is always recorded

If a future feature bypasses event logging, it violates this document.

---

## Status
This document defines canonical event logging and audit behavior.

Remaining operations-planning document:
- Deployment and infrastructure baseline

End of document.

