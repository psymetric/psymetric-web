# Publish Review & Gating

## Purpose
This document defines **how drafts become published content** within the PsyMetric system.

It exists to:
- preserve human authority
- prevent accidental or premature publication
- enforce validation and quality checks
- make publishing a calm, intentional act

Publishing is the moment content becomes real.

---

## Core Principle

**Publishing is a deliberate state transition, not an outcome of drafting.**

- Drafting may be fast and iterative
- Publishing is slow, explicit, and gated
- No automation bypasses review

---

## Publish States (Recap)

Content entities move through these states:

- `draft` – editable, not public, not indexable
- `publish_requested` – awaiting review
- `published` – public and indexable
- `archived` – public but no longer promoted

State transitions are logged as events.

---

## Requesting Publish

Only a human operator may request publication.

Requesting publish:
- freezes the current draft snapshot
- runs all validation checks
- creates a publish review record
- logs an event

A publish request does **not** make content public.

---

## Required Validation Checks

Before a publish request can be approved, the system must confirm:

- Page anatomy matches its content type
- Required relationships exist
- Citation rules are satisfied
- Metadata and schema requirements are complete
- No unresolved validation errors remain

Validation failures must be corrected before approval.

---

## Human Review

During review, the operator confirms:

- The content says what was intended
- Tone is appropriate for the surface
- Sources are correctly represented
- No accidental claims are present

Review is editorial, not mechanical.

---

## Approval & Publish

Publishing requires explicit human approval.

On approval:
- `status` transitions to `published`
- `publishedAt` timestamp is set
- canonical URL becomes live
- content is added to sitemaps
- caches are revalidated
- event is logged

No other action results in publication.

---

## Rejection & Revision

A publish request may be rejected.

On rejection:
- status returns to `draft`
- rejection reason may be recorded
- content remains private

Rejection is a normal part of the workflow.

---

## Emergency Safeguards

The system must support:
- immediate unpublish (rollback to `draft` or `archived`)
- correction without URL changes

Safeguards prioritize accuracy over visibility.

---

## LLM Role in Publishing

LLMs may:
- prepare drafts for review
- suggest improvements

LLMs may not:
- request publish
- approve publish
- change publish state

Publishing authority is human-only.

---

## Invariants

- Publishing is human-gated
- Validation precedes visibility
- Events record every transition

If a future feature conflicts with this document, this document wins unless explicitly amended.

---

## Status
This document defines canonical publish review and gating behavior.

Remaining operations-planning documents:
- Event logging and auditability
- Deployment and infrastructure baseline

End of document.

