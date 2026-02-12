# Phase 1 — Controlled Slice: Publish Lifecycle (Backend Only)

## Status
OPEN — Controlled Execution

## Context

Phase 1 Option A (X Operator Loop) is complete and hardened.
This slice opens the next controlled backend-only expansion toward the
Phase 1 objective:

> Full ingestion → publish loop operational.

This slice intentionally excludes:
- Public website routes
- Dashboard UI screens
- Metrics infrastructure
- DistributionEvent model
- Architectural redesign

This is a backend state-machine + event integrity slice only.

---

# Objectives

Implement a minimal, disciplined publish lifecycle for Entity.

The lifecycle must:
- Enforce valid state transitions
- Log all transitions via EventLog
- Avoid schema changes unless strictly required
- Remain Phase 1 compliant

---

# State Model (Phase 1 Minimal)

Entity.status values involved:
- draft
- publish_requested
- published
- rejected (optional; can reuse draft if desired)

If status enum already exists in schema, reuse it.
Do NOT expand enum unless absolutely required.

---

# Required Endpoints (Backend Only)

## 1. Validate Entity

POST /api/entities/:id/validate

Purpose:
- Perform structural validation
- Return pass/fail + reasons

Behavior:
- If validation fails:
  - Return 400 with structured reasons
  - Emit ENTITY_VALIDATION_FAILED event
- If validation passes:
  - Return 200 with { valid: true }
  - Do not mutate Entity

No UI.

---

## 2. Request Publish

POST /api/entities/:id/request-publish

Purpose:
- Move Entity from draft → publish_requested

Rules:
- Must pass validation first (re-run validation internally)
- If invalid → 400
- If valid → set status = publish_requested
- Emit ENTITY_PUBLISH_REQUESTED event

---

## 3. Publish

POST /api/entities/:id/publish

Purpose:
- Human-gated final publish step

Rules:
- Optional token guard (like draft sweep)
- Must be in publish_requested state
- Set:
  - status = published
  - publishedAt = now
- Emit ENTITY_PUBLISHED event

---

## 4. Reject Publish

POST /api/entities/:id/reject

Purpose:
- Reject publish request

Rules:
- Must be in publish_requested
- Set status back to draft
- Emit ENTITY_PUBLISH_REJECTED event

---

# Invariants

- No autonomous publishing.
- All state transitions must emit exactly one EventLog entry.
- EventLog is append-only.
- No canonical mutation outside defined transitions.

---

# Out of Scope

- Public /news routes
- Publish queue UI
- Metrics / DistributionEvent
- Notification systems
- Scheduling
- Background workers

---

# Definition of Done

- All four endpoints implemented
- State transitions enforced
- Events emitted correctly
- No schema drift
- No UI changes
- Clean build + deploy

---

# Risks

- Silent state mutation (must be prevented)
- Missing event emission
- Allowing publish without validation

---

# Verification Plan

At Phase checkpoint:

1. Create Entity (draft)
2. Attempt publish without validation → must fail
3. Validate → must return valid
4. Request publish → status publish_requested
5. Publish → status published + publishedAt set
6. Verify EventLog entries for each step

---

This slice moves PsyMetric from "ingestion + drafts" toward
true ingestion → publish operational completeness,
without expanding beyond Phase 1 discipline.
