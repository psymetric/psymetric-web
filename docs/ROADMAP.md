# PsyMetric Roadmap (Authoritative — Doc-Aligned)

This roadmap is strictly derived from existing documentation.
Each section references the source document that defines the requirement.

If a feature is not listed in the active phase, it is out of scope.
If a requirement exists in docs, it must appear here in a phase.

---

# Phase 1 — AI News Launch (ACTIVE)

## Objective
Establish a traceable ingestion → interpretation → publish system for AI News.

Derived from:
- 00-SYSTEM-OVERVIEW.md
- 01-SITE-ARCHITECTURE-OVERVIEW.md
- DB-ARCHITECTURE-PLAN.md
- 07-ADMIN-DASHBOARD-SCOPE.md
- 05-PUBLISHING-AND-INDEXING-RULES.md
- 05-METRICS-AND-REPORTING.md
- 04-LLM-OPERATING-RULES.md
- 06-DEPLOYMENT-AND-INFRASTRUCTURE-BASELINE.md

---

## 1. Database Spine (Derived from DB-ARCHITECTURE-PLAN.md)

Required in Phase 1:
- SourceItem model
- Entity model
- Relationship model
- EventLog model
- DistributionEvent model
- Video model scaffold (not active in workflow)
- Enum vocabularies aligned with docs
- URL deduplication for SourceItem
- contentHash generation
- No phantom enums

Rules:
- Database is canonical truth
- No silent mutation
- All meaningful actions must be evented

---

## 2. Ingestion Layer (Derived from SYSTEM-OVERVIEW + ADMIN-DASHBOARD-SCOPE)

Required in Phase 1:
- Manual Source capture (dashboard)
- Chrome extension capture (X posts)
- RSS ingestion
- SOURCE_CAPTURED event logging
- operatorIntent required
- Recapture logs event, no duplicate rows

---

## 3. Triage Layer (Derived from ADMIN-DASHBOARD-SCOPE)

Required:
- SourceItem status transitions:
  - ingested
  - triaged
  - used
  - archived
- SOURCE_TRIAGED event logging
- archivedAt set when archived
- Notes append behavior

---

## 4. Draft & Entity Management (Derived from DB-ARCHITECTURE-PLAN + ADMIN-DASHBOARD-SCOPE)

Required:
- Promote SourceItem → News draft
- ENTITY_CREATED event
- RELATION_CREATED event
- Relationship: NEWS_DERIVED_FROM_SOURCE
- Draft editor UI
- Relationship management UI
- Draft preview (noindex)

Rules:
- Drafts are scaffolding
- Drafts do not feed intelligence systems

---

## 5. Publish Lifecycle (Derived from PUBLISHING-AND-INDEXING-RULES + ADMIN-DASHBOARD-SCOPE)

Required:
- Validate endpoint
- Request publish
- Human-only publish
- Reject publish
- Archive entity
- Publish queue UI
- Event timeline visibility

Rules:
- Only humans may publish
- publish sets publishedAt
- archive sets archivedAt
- Validation required before publish
- No autonomous publishing

---

## 6. Public Website Layer (Derived from SITE-ARCHITECTURE-OVERVIEW)

Required:
- Main Site surface
- Wiki surface (definitions live here)
- News index page
- News detail page
- Relationship-driven navigation
- Canonical URLs
- Only published entities indexable
- Drafts non-indexable
- Sitemap generation from DB
- Mobile-first rendering
- Core Web Vitals compliance

Rules:
- UI is projection
- Database is truth

---

## 7. Admin Dashboard Layer (Derived from ADMIN-DASHBOARD-SCOPE)

Required screens:
- Source Inbox
- Draft Library
- Entity Editor
- Relationship Management
- Publish Queue
- Preview (noindex)
- Event timeline view
- Validation failure visibility
- LLM attribution visibility

---

## 8. Distribution & Metrics (Derived from METRICS-AND-REPORTING)

Required:
- DistributionEvent table
- DistributionEvent status transitions
- Manual X posting workflow
- Metrics snapshot storage (time-based)
- MetricType vocabulary enforcement

Rules:
- Metrics are snapshots, not conclusions
- Distribution ≠ Authority

---

## 9. LLM Constraints (Derived from LLM-OPERATING-RULES)

Required enforcement:
- LLM cannot publish
- LLM cannot mutate canonical state directly
- All LLM actions must go through defined endpoints
- LLM attribution visible in dashboard

---

## 10. Deployment & Infrastructure (Derived from DEPLOYMENT-AND-INFRASTRUCTURE-BASELINE)

Required:
- Vercel deployment
- Neon PostgreSQL
- Prisma migrations
- No Edge runtime for DB
- Proper connection handling
- Rebuildable system from repo + DB

---

## Explicitly Out of Scope (Phase 1)

- GraphRAG
- Pattern detection engines
- OpenClaw orchestration
- Autonomous execution systems
- Tool factories
- Monetization systems

---

## Exit Criteria

Phase 1 is complete when:

- Consistent AI news publishing cadence established
- Full ingestion → publish loop operational
- Dashboard fully operational per scope doc
- Website compliant with architecture doc
- Metrics snapshots being recorded
- System fully rebuildable

---

# Phase 2 — Structured Education Layer

Derived from:
- SYSTEM-OVERVIEW.md
- RELATIONSHIP-AND-EVENT-VOCABULARY.md

Objective:
Expand canonical knowledge beyond News.

Required:
- Concepts fully populated
- Guides
- Cross-entity relationships
- Wiki-driven navigation
- Validation enforcement for citations

Out of Scope:
- Automated pattern detection
- Intelligence layers

---

# Phase 3 — Manual Pattern Recognition

Derived from SYSTEM-OVERVIEW long-pipe model.

Required:
- Manual EventLog analysis
- Relationship clustering
- Friction documentation

---

# Phase 4 — Assisted Intelligence Layer

Derived from long-term architecture references in docs.

Required:
- GraphRAG
- Pattern clustering
- Gap detection

Constraints:
- No autonomous publish
- No uncontrolled state mutation

---

# Phase 5 — OpenClaw / Agent Orchestration

Derived from future-planning documents.

Preconditions:
- Mature structured dataset
- Stable cadence
- Proven manual pattern recognition

---

# Current Status

Active Phase: Phase 1
Core DB spine: Implemented
Ingestion + dedupe: Implemented
Triage: Implemented
Video scaffold: Implemented (inactive)
Draft expiry cron: Pending
Full publish lifecycle: Pending confirmation
DistributionEvent confirmation: Pending
Metrics snapshot logging: Pending
Website architecture verification: Pending
Dashboard scope verification: Pending

This roadmap is binding and must be amended explicitly before scope changes occur.
