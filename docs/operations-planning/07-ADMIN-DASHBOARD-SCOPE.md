# Admin Dashboard Scope

## Purpose
This document defines the **minimum scope** of the Admin Dashboard (the custom CMS layer) for PsyMetric.

It exists to:
- prevent ad-hoc implementation decisions
- keep workflows aligned with operations-planning docs
- define the screens, actions, and gates
- maintain human authority over publishing

The dashboard is an operator tool. It is not public.

---

## Core Principle

**The dashboard edits canonical DB state under strict rules.**

- Drafts are easy to create and revise
- Publishing is gated and explicit
- Everything important emits events

---

## Users & Roles (v1)

### Operator (Human)
- Full access to create/edit drafts
- Full access to capture/triage sources
- May request publish and approve publish

### LLM (Assistant)
- No direct dashboard access
- Operates only through allowed API/tool endpoints
- Cannot publish or change publish state

### System
- Performs internal actions (revalidation, sitemap generation)

---

## Required Screens (v1)

All screens below are required for v1. UI styling is implementation detail; **capabilities and gates** are not.

### Global Dashboard Capabilities (v1)
- Search inputs support title/slug lookup where relevant
- Filters support entityType and status where relevant
- Errors are shown inline with actionable messages
- All successful actions display brief confirmations

### 1) Source Inbox
Purpose:
- View and triage SourceItems

Capabilities:
- Create SourceItem manually (URL + intent note)
- View SourceItems by status: ingested / triaged / used / archived
- Promote SourceItem to draft entity (Concept/Guide/Project/News)
- Attach SourceItem to an existing entity
- Change SourceItem status (triage actions)

Non-goals:
- Bulk scraping
- Automated ingestion without review

---

### 2) Drafts Library
Purpose:
- Manage draft content entities

Capabilities:
- List/filter drafts by entity type (Concept/Guide/Project/News)
- Search by title or slug
- Filter by status (draft / publish_requested)
- Sort by createdAt or updatedAt
- Create new draft entity
- View validation status (pass/fail + reasons)
- View event history summary (last N events)

Concept-specific:
- Filter/group Concepts by `conceptKind` (standard | model | comparison)

---

### 3) Entity Editor
Purpose:
- Edit a single entity and its relationships

Capabilities:
- Edit entity fields
- Attach SourceItems
- Run validations on demand
- View the entity’s canonical URL

### Relationship Management (v1)
- View existing relationships (from/to this entity)
- Add relationship (select target entity + relation type)
- Remove relationship (with confirmation)
- Future: 1-hop neighborhood visualization

### Concept-Specific Fields (v1)
- `conceptKind`: selectable on create, displayed on edit
- If `conceptKind = comparison`: manage ordered `comparisonTargets` list

### LLM Draft Attribution (v1)
- Display whether the draft was LLM-assisted (badge or label)
- Link to relevant EventLog entries

Notes:
- Relationship edits are explicit actions and emit events
- The editor must display the entity’s canonical URL

---

### 4) Publish Queue
Purpose:
- Review and approve publish requests

Capabilities:
- List entities in `publish_requested`
- View diff/preview of what will be published
- View validation results
- Approve (publish) or reject (return to draft)
- Record optional rejection reason

### Preview (v1)
- Preview opens the rendered page template in a new tab
- Preview uses draft content and is not public
- Preview URLs must be `noindex`

Publishing is a human-only action.

---

## Optional Screens (Deferred)

- Metrics overview
- Search management
- Bulk relationship tools

These may be added after initial content scale justifies them.

---

## Required Actions & Gates

### Publish Request
- Allowed only for operator
- Requires all validations to pass
- Transitions entity to `publish_requested`

### Publish Approval
- Allowed only for operator
- Transitions entity to `published`
- Sets timestamps, updates sitemaps, triggers revalidation

---

## Error & Feedback States

- Validation failure: display specific failure reasons inline
- Publish rejection: display rejection reason and return entity to draft
- API errors: show error message and allow retry
- Success states: brief confirmation, auto-dismiss

---

## Auditability Requirements

The dashboard must provide:
- per-entity event timeline
- per-source lifecycle history
- visibility into whether content was LLM-assisted

---

## Invariants

- Publishing remains human-gated
- Drafts are not indexable
- All significant actions emit events
- The dashboard does not bypass workflow rules

If a dashboard feature conflicts with these invariants, it must not be implemented.

---

## Status
This document defines the minimum Admin Dashboard scope for v1.

End of document.

