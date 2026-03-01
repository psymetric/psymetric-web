# Search Intelligence Layer (SIL)

**Project:** PsyMetric / Veda

**Status:** Draft (architecture memo; no code changes implied)

## Purpose

The **Search Intelligence Layer (SIL)** is the structured, deterministic substrate that turns “SEO data” into **actionable, auditable search-state intelligence**.

SIL’s job is to:

- **Record search reality** (what the SERP looked like, when, for which locale/device) as immutable observations.
- **Detect and summarize change** (volatility, feature changes, competitor movement, AI Overview presence, cannibalization signals).
- **Enable planning** (LLM-assisted and rules-based) by providing a queryable, provenance-rich knowledge spine.
- **Keep governance intact** (multi-project isolation, deterministic ordering, event-logged mutations, no autonomy).

SIL is not a dashboard feature. SIL is the **operating system layer** that future systems (LLM Broker, GraphRAG, vector retrieval, admin UI) will read from.

## Non-Negotiable Invariants

SIL must obey existing system invariants:

1. **Multi-project isolation**
   - All writes/reads scoped by `projectId`.
   - Cross-project access returns **404 non-disclosure**.
   - DB constraints/triggers prevent cross-project contamination.

2. **Strict event logging**
   - Any state mutation must occur inside `prisma.$transaction()`.
   - No mutation without corresponding EventLog entry (and vice versa).

3. **Determinism**
   - Explicit `orderBy` everywhere.
   - Tie-break by `id`.
   - No implicit DB ordering.
   - Idempotent lifecycle transitions.

4. **No background automation**
   - No cron/scheduled ingestion.
   - No autonomous publish.
   - No hidden retries that mutate state.
   - Operator-triggered actions only.

5. **No speculative engineering**
   - No schema fields “for later.”
   - No unused endpoints.
   - Add only what is required for the current phase.

## Conceptual Model

SIL treats search and AI visibility as **observations over time**, not mutable state.

### Key Concepts

- **Observation:** immutable record of “what we saw.”
- **Batch:** a group of observations captured together (for traceability and invalidation).
- **Derived insight:** deterministic summary computed from observations (stored as DraftArtifact initially).
- **Action proposal:** operator-facing recommendation, optionally LLM-generated, always confirm-gated.

### Why this matters

LLMs (and later GraphRAG) should not infer “what changed” from raw tables every time. SIL provides:

- Clear, queryable **deltas**
- Provenance
- Deterministic summaries
- Stable nodes/edges for graph traversal

## Data Domains

SIL covers five domains. Each domain has an **observation layer** and a **derived layer**.

### 1) SERP & Ranking Observations

**Observation layer (immutable):**
- SERP snapshot (top results, SERP features, AI Overview presence, citations/snippets)
- Keyword ranking records

**Derived layer (deterministic):**
- Volatility score (keyword/cluster)
- Feature change flags (AIO appeared, local pack appeared, etc.)
- Competitor movement summaries

### 2) Keyword Ownership & Cluster Governance

**Observation layer:**
- Keyword targets (intent, locale, device)

**Derived layer:**
- Primary ownership enforcement (one “primary” per locale)
- Cannibalization detection (multiple pages competing)

### 3) Content State (Locale-Publishable Units)

SIL assumes **publishable units are locale-scoped**.

- `EntityLocale` is the publishable unit.
- Canonical `Entity` remains the conceptual spine.

**Derived layer:**
- Freshness proposals
- Consolidation/split proposals

### 4) AI Visibility & Citation Observations (GEO)

**Observation layer:**
- AI Overview presence
- Citation/mention events (if detectable)

**Derived layer:**
- Citation velocity
- Claim extractability candidates

### 5) Monetization & Placement Instrumentation (Tenant-specific)

SIL should support (later) placement-level experiments without polluting the core.

- Track placements as **events/observations**, not mutable “best guess.”

## What SIL Enables for LLMs

LLMs connect to SIL to:

- **Plan:** identify best next actions from observed deltas.
- **Write:** generate content drafts grounded in sources + observed SERP requirements.
- **Explain:** produce operator-facing rationales with provenance.

### LLM outputs must be structured
LLM outputs should land as DraftArtifacts first:

- `operator_plan.v1` (proposal)
- `cluster_brief.v1` (derived summary)
- `refresh_queue_item.v1` (candidate)

Promotion to canonical state remains operator-driven.

## GraphRAG Readiness

SIL is designed so GraphRAG can be added later without redesign.

GraphRAG needs:

- Stable node IDs: `Entity`, `EntityLocale`, `KeywordTarget`, `SERPSnapshot`, `SourceItem`
- Typed edges: existing `Relationship` + SIL-specific relationships (added only when needed)
- Chunkable text with provenance: `QuotableBlock`, page sections, SERP snippets

**Rule:** do not add embeddings until the SIL observation tables and provenance are stable.

## Proposed Implementation Plan

This plan is deliberately phased to avoid schema sprawl.

### SIL-0: Documentation + Roadmap Alignment (NOW)

Deliverables:
- This doc (SIL definition)
- ROADMAP update to make SIL explicit
- Explicit scope: what is in/out for the next 2–4 weeks

No schema changes required.

### SIL-1: Observation Ledger (Minimum Viable SIL)

Goal: store immutable search observations with batch provenance.

Likely work:
- Add SERP snapshot tables (if not already present)
- Add IngestBatch concept for SEO ingest endpoints
- Ensure all observation writes are event-logged and deterministic

No volatility scoring yet.

### SIL-2: Deterministic Derived Insights

Goal: produce deterministic summaries (rules-based) from observations.

Likely work:
- Add a rules-based “delta detector” that writes DraftArtifacts
- Add volatility placeholders as DraftArtifacts initially

No LLM required.

### SIL-3: LLM-assisted Planning (Phase 3 Broker dependency)

Goal: operator-triggered LLM generation of:
- cluster briefs
- action plans
- content briefs

Strict confirm gating, structured outputs, provenance.

### SIL-4: GraphRAG + Vector Retrieval

Goal: speed and quality of retrieval.

Likely work:
- add chunk tables
- add embedding storage (project-scoped)
- hybrid retrieval: graph filter + vector rank

## What is Explicitly Out of Scope (for SIL-0)

- Building new SIL tables without phase approval
- Embeddings/vector DB integration
- Background ingest scheduling
- Autonomous publishing
- LLM broker write access without confirm gates

## Decisions Required (Roadmap)

1. **Phase labeling:** Is SIL a new Phase (recommended) or a sub-phase of SEO?
2. **Publish primitive:** Confirm `EntityLocale` is the publishable unit (recommended).
3. **Observation doctrine:** Confirm immutability + batch invalidation approach.
4. **Unimplemented endpoints:** Decide whether missing W4–W7 endpoints are implemented (new Phase) or formally descoped from Phase 0.

## Next Actions (for Claude Review)

Claude should:

- Review for drift against existing invariants.
- Identify schema risks (only at the conceptual level in SIL-0).
- Suggest minimal roadmap changes to align phases.
- Propose a minimal SIL-1 table set (no implementation yet) that fits our existing multi-project constraints.

**Do not implement code in this review.**
