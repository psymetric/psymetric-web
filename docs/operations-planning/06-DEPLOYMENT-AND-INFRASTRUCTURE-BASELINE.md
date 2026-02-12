# Deployment & Infrastructure Baseline

## Purpose
This document defines the **minimum required infrastructure** to deploy, operate, and evolve the PsyMetric system.

It exists to:
- ground implementation decisions
- avoid hidden dependencies
- distinguish required vs optional services
- keep deployment boring and predictable

Infrastructure supports the system; it does not define it.

---

## Core Principle

**Infrastructure is replaceable. Behavior is not.**

- Architectural rules are provider-agnostic
- Services may change without altering system semantics
- No deployment decision is allowed to redefine content or authority

---

## Required Infrastructure (v1)

These components are required to run the system as specified.

### Application Hosting

- Server-rendered web application
- Supports static generation and incremental revalidation
- Supports API routes for admin and tooling

**Assumption:** modern full-stack web framework with server and edge support.

---

### Database

- Relational database
- Strong consistency guarantees
- Supports transactions and relational constraints

**Role:**
- canonical source of truth
- entity state
- relationships
- event logs

The database is the system spine.

---

### Authentication

- Secure authentication for admin/dashboard access
- Supports role distinction (operator vs system)

**Role:**
- restrict publishing authority
- protect internal tools and drafts

---

### Object / Asset Storage

- Stores images, screenshots, and generated assets
- Public-read access for published assets
- Private access for drafts if needed

**Role:**
- media for site pages
- OG / social preview images

---

## Optional Infrastructure (Deferred)

These components are explicitly **not required** for initial launch.

### Search

- Internal site/wiki search
- Improves usability but does not affect authority

May be added after content volume justifies it.

---

### Analytics

- Lightweight, privacy-respecting analytics

Used for understanding usage, not driving content decisions.

---

### Background Jobs / Cron

- Scheduled tasks (e.g., sitemap refresh)

May be implemented via hosting provider tooling or external schedulers.

---

### Email / Notifications

- Used for alerts or workflow notifications

Not required for core operation.

---

## Environment Separation

The system assumes at least two environments:

- `development`
- `production`

Optionally:
- `staging`

Rules:
- Drafts never leak across environments
- Production publishing requires explicit credentials

---

## Secrets & Configuration

- Secrets are stored via environment configuration
- No secrets are committed to source control

Examples:
- database credentials
- auth provider keys
- storage access keys
nConfiguration is operational, not architectural.

---

## Deployment Events

Deployment-related actions may emit events:

- schema migrations
- cache revalidation
- sitemap regeneration

Deployment events do not alter content state.

---

## What This Document Does Not Decide

This document intentionally does **not** specify:

- vendor names
- pricing tiers
- performance tuning
- scaling strategies

Those decisions are implementation details.

---

## Invariants

- The DB remains canonical
- Publishing authority is human-gated
- Infrastructure may change without redefining rules

If an infrastructure change violates these invariants, it must not be adopted.

---

## Status
This document defines the baseline deployment and infrastructure assumptions.

It completes the operations-planning document set.

End of document.