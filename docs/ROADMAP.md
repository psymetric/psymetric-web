# PsyMetric Roadmap (Authoritative)

This document defines the official phased roadmap for PsyMetric.

It exists to:
- prevent scope creep
- align implementation with documentation
- clearly define in-scope vs out-of-scope work
- provide measurable exit criteria
- preserve epistemic clarity

If a feature is not listed in the active phase, it is out of scope.

---

# Phase 1 — AI News Launch (ACTIVE)

## Core Objective
Establish a stable, traceable ingestion → interpretation → publish pipeline for AI news.

This phase is operational, not experimental.
No autonomous systems.
No inference layers.
No background intelligence.

---

## 1. Ingestion Layer

### Required
- Manual capture via dashboard
- Chrome extension capture (X posts)
- RSS ingestion pipeline
- URL deduplication (recapture logs event, no duplicate rows)
- contentHash generation
- SOURCE_CAPTURED event logging

### Rules
- SourceItem.url is unique
- Recapture reuses existing SourceItem
- All captures require operatorIntent
- Capture does NOT mutate canonical entities

---

## 2. Triage Layer

### Required
- SourceItem status transitions:
  - ingested
  - triaged
  - used
  - archived
- SOURCE_TRIAGED event logging
- Optional timestamped notes append

### Rules
- No silent status changes
- archivedAt must be set when archiving
- Status changes must log previousStatus + newStatus

---

## 3. Draft Creation

### Required
- Promote SourceItem → News draft
- Entity created with status=draft
- Relationship: NEWS_DERIVED_FROM_SOURCE
- ENTITY_CREATED event
- RELATION_CREATED event

### Rules
- Drafts are scaffolding
- Drafts are not canonical knowledge
- Drafts must never influence future intelligence systems

---

## 4. Publish Lifecycle

### Required Endpoints
- Validate entity
- Request publish
- Human-only publish
- Reject publish
- Archive entity
- GET entity events

### Rules
- Only humans may publish
- publish sets publishedAt
- archive sets archivedAt
- Every state transition must log an EventLog entry
- No autonomous publishing

---

## 5. Public Surface

### Required
- Only News entities render publicly
- Only status=published is indexable
- Drafts are preview-only
- Draft pages use noindex
- Sitemap generated strictly from published entities

### Rules
- UI is projection
- Database is truth

---

## 6. Distribution Tracking & Metrics

### Required
- DistributionEvent table
- Status: draft | planned | published | archived
- Manual X posting workflow
- DistributionEvent logging
- Metrics snapshots stored as time-based records (views, engagement, etc.)

### Rules
- Distribution does not mutate canonical entity
- Capture ≠ Publish
- Distribution ≠ Authority
- Metrics are snapshots, not conclusions

---

## 7. Hygiene & Integrity

### Required
- Draft expiry policy (auto-archive after defined window)
- EventLog for all meaningful actions
- No phantom enums
- No undocumented state transitions

---

## Explicitly Out of Scope (Phase 1)
- GraphRAG
- Pattern detection
- Agent systems
- OpenClaw orchestration
- Background inference
- Tool factories
- Monetization systems
- Autonomous summarization
- Automated posting

---

## Exit Criteria
Phase 1 is complete when:

- 3–5 AI news posts per week are consistently published
- Ingestion pipeline is frictionless
- No duplicate SourceItems
- Publish discipline is enforced
- Draft expiry is operational
- Distribution events are tracked
- Metrics snapshots are being recorded
- System can be reconstructed from repo + Neon

---

# Phase 1.5 — Operational Hardening

## Objective
Reduce cognitive load and stabilize workflow.

## In Scope
- Chrome extension UX refinement
- Inbox ergonomics improvements
- Publish UI clarity
- Minor performance optimizations

## Exit Criteria
- Publishing feels routine and boring
- No friction in daily workflow
- Zero ambiguity in status transitions

---

# Phase 2 — Structured Education Layer

## Objective
Transition from reactive news to structured educational authority.

## In Scope
- Canonical Concepts fully implemented
- Guides
- Relationship-driven navigation
- Cross-entity linking discipline
- Validation enforcement for structure & citations

## Rules
- Only canonical entities feed future intelligence layers
- Relationships must be explicit

## Exit Criteria
- 20+ Concepts
- 10+ Guides
- Fully navigable knowledge graph

---

# Phase 3 — Manual Pattern Recognition

## Objective
Extract recurring friction patterns manually.

## In Scope
- EventLog review
- Relationship clustering (manual)
- Friction documentation

## Out of Scope
- Automated clustering
- Intelligence engines

---

# Phase 4 — Assisted Intelligence Layer

## Objective
Introduce assisted reasoning once sufficient structured data exists.

## In Scope
- GraphRAG
- Pattern clustering
- Gap detection
- Recommendation assistance

## Constraints
- No autonomous publishing
- No uncontrolled state mutation

---

# Phase 5 — OpenClaw / Agent Orchestration

## Objective
Enable controlled agent-assisted execution after system maturity.

## Preconditions
- 6+ months structured data
- Stable cadence
- Proven manual pattern recognition

---

# Current Status

Active Phase: Phase 1
Core ingestion: Implemented
Triage: Implemented
Deduplication: Implemented
Video scaffold: Implemented (not active in workflow)
Draft expiry cron: Pending
Full publish lifecycle hardening: Pending
DistributionEvent confirmation: Pending
Metrics snapshot logging: Pending

This roadmap is authoritative and must be explicitly amended before phase transitions occur.
