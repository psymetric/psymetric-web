# PsyMetric System Invariants

**Purpose**

This document defines the non-negotiable system invariants of PsyMetric.

These invariants are architectural constraints. They are not implementation details. They must remain true regardless of refactors, feature additions, UI changes, or internal reorganizations.

If a proposed change violates any invariant in this document, the change is incorrect.

---

## 1. Project Isolation Invariants

### 1.1 All Domain Rows Are Project-Scoped

Every domain entity must belong to exactly one Project.

This includes (non-exhaustive):
- Entity
- SourceItem
- SourceFeed
- EntityRelation
- EventLog
- DistributionEvent
- Video
- DraftArtifact
- MetricSnapshot

All such tables must contain a `projectId` column referencing `Project(id)`.

No domain row may exist without a project.

---

### 1.2 All Queries Must Scope by `projectId`

All internal API reads must filter by the resolved `projectId`.

No query may return rows from multiple projects unless the table is explicitly global (e.g., SystemConfig).

Accessing a row by UUID must still enforce project ownership.

If a row exists but belongs to another project, the response must behave as if it does not exist (e.g., 404 or equivalent notFound). No cross-project existence leakage is allowed.

---

### 1.3 EntityRelation Must Never Connect Across Projects

An `EntityRelation` row must only connect entities that belong to the same project.

It must be structurally impossible to create a relationship where:
- `fromEntityId` belongs to Project A
- `toEntityId` belongs to Project B
- `projectId` is A (or B)

Cross-project graph contamination is forbidden.

This invariant must be enforced at both:
- Application layer (ownership checks)
- Database layer (trigger enforcement)

---

## 2. Transaction & Atomicity Invariants

### 2.1 No Mutation May Exist Outside a Transaction

Any operation that changes persisted state must execute inside a single `prisma.$transaction()` block.

This includes:
- Status transitions
- Entity creation or updates
- Relationship creation or deletion
- Distribution events
- Metric snapshots
- Draft lifecycle changes

Partial writes are forbidden.

---

### 2.2 State Change + Event Log Must Be Atomic

If a mutation changes state, the corresponding event log must be written in the same transaction.

It must be impossible for:
- State to change without an event
- An event to exist without the corresponding state

If the transaction rolls back, both state and event must roll back.

---

## 3. Event Logging Invariants

### 3.1 Every Mutation Must Produce an Event

All domain state changes must emit at least one canonical `EventLog` entry.

Event logs must:
- Include `eventType`
- Include `entityType`
- Include `entityId`
- Include `actor`
- Include `projectId`

Event logs are append-only.

They must never be updated to rewrite history.

---

### 3.2 Read-Only Endpoints Must Not Emit Events

GET endpoints and other read-only operations must not create event logs.

Event logs represent state transitions, not observations.

---

## 4. Determinism Invariants

### 4.1 Deterministic Ordering

All list endpoints must have deterministic ordering.

Ordering must include a stable tie-breaker (e.g., `id`) to prevent pagination instability.

No endpoint may rely on implicit database ordering.

---

### 4.2 Deterministic Validation

Validation errors must be deterministic and reproducible.

Enum validation must be explicit.

No unsafe casting of enums or JSON types is allowed.

---

## 5. Database Constraint Invariants

### 5.1 Composite Uniqueness Is Project-Scoped

Where uniqueness is domain-scoped (e.g., slug), it must include `projectId`.

Example:
- `(projectId, entityType, slug)` must be unique.

Cross-project duplication must be allowed where appropriate.

---

### 5.2 DB-Level Enforcement Is Authoritative

Critical isolation constraints must be enforced at the database level.

Application checks alone are insufficient.

If an invariant protects multi-project isolation or graph integrity, it must be enforced in Postgres (constraints or triggers).

---

## 6. Public Surface Invariants

Public endpoints must:
- Be project-scoped
- Only expose published content
- Never leak cross-project data

Build-time database access must not occur unless explicitly intended and safe.

---

## 7. Testing & Verification Invariants

The system must maintain deterministic, repeatable verification via:
- API hammer tests
- DB hammer tests
- CI lint + build guardrails

Cross-project violation probes must fail.

Transaction atomicity probes must confirm rollback behavior.

If these tests fail, the system is not safe.

---

# Final Principle

PsyMetric is a multi-project, event-logged, transaction-safe system.

Isolation is structural.
Atomicity is mandatory.
Events are canonical.
Determinism is required.

Any change that weakens these properties is invalid.
