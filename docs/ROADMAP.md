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
- DB-ARCHITECTURE-PLAN.md
- RELATIONSHIP-AND-EVENT-VOCABULARY.md
- site-architecture docs
- 07-ADMIN-DASHBOARD-SCOPE.md
- 05-PUBLISHING-AND-INDEXING-RULES.md
- 05-METRICS-AND-REPORTING.md
- 04-LLM-OPERATING-RULES.md
- 06-DEPLOYMENT-AND-INFRASTRUCTURE-BASELINE.md
- 08-EXTENSION-INGESTION-ARCHITECTURE.md

---

## 1. Database Spine (Derived from DB-ARCHITECTURE-PLAN.md)

Required in Phase 1:
- SourceItem model
- Entity model
- EntityRelation model
- EventLog model
- Video model scaffold (inactive workflow)
- DraftArtifact model (scaffolding only, non-canonical)
- DistributionEvent model
- MetricSnapshot model
- Enum vocabularies aligned with docs
- URL deduplication for SourceItem
- contentHash generation
- No phantom enums

Rules:
- Database is canonical truth
- DraftArtifact is NOT canonical truth
- No silent mutation
- All meaningful actions must be evented

---

## 2. Ingestion Layer (Derived from SYSTEM-OVERVIEW + EXTENSION-INGESTION-ARCHITECTURE)

Required in Phase 1:
- Manual Source capture (dashboard)
- Chrome extension capture (desktop)
- Kiwi extension capture (Android)
- Extension must capture visible X text at ingestion time
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
- Notes append behavior
- archivedAt set when archived

---

## 4. Draft System (Derived from guardrails + extension architecture)

Required:
- DraftArtifact table
- DraftArtifact kind = x_reply (minimum)
- DraftArtifact auto-expiry (~30 days)
- DraftArtifact never influences canonical knowledge
- DRAFT_CREATED event
- DRAFT_EXPIRED event
- Human-gated posting only

Rules:
- Drafts are scaffolding
- Drafts may be hard-deleted or tombstoned
- No autonomous publishing

---

## 5. Publish Lifecycle (Derived from PUBLISHING-AND-INDEXING-RULES)

Required:
- Validation endpoint
- Request publish
- Human-only publish
- Reject publish
- Archive entity
- Publish Queue UI
- Validation visibility in dashboard

Rules:
- Only humans may publish
- publish sets publishedAt
- archive sets archivedAt
- Validation required before publish

---

## 6. Public Website Layer (Derived from SITE-ARCHITECTURE-OVERVIEW)

Required:
- Main Site surface
- Wiki surface
- /news index (published only)
- /news/[slug] detail page (published only)
- Relationship-driven navigation
- Canonical URLs
- Draft entities never publicly routable
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
- Draft Library (DraftArtifact view)
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
- Manual X posting workflow
- MetricSnapshot table
- Metrics snapshot storage (time-based)
- MetricType vocabulary enforcement

Rules:
- Metrics are snapshots, not conclusions
- Distribution ≠ Authority

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
- Extension capture operational (desktop + Android)
- Draft reply workflow operational
- Public news pages live and indexable
- Dashboard fully operational per scope doc
- Metrics snapshots being recorded
- System fully rebuildable from repo + DB

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
Source Inbox: Implemented
Extension architecture: Documented
Public website: Missing
DraftArtifact: Not implemented
DistributionEvent: Not implemented
MetricSnapshot: Not implemented
Publish lifecycle: Partial

This roadmap is binding and must be amended explicitly before scope changes occur.
