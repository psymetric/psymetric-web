# VEDA Graph Model

## Purpose

VEDA operates as a **multi-graph observatory for search ecosystems**. Each graph represents a different structural view of how information, authority, and ranking signals flow across the web.

These graphs are not separate products. They are complementary observational layers that together allow VEDA to reason about search competition, site structure, and knowledge authority.

---

## The Four Graphs of VEDA

VEDA ultimately models four primary graphs.

### 1. Search Graph (SERP Observatory)

Represents the **search ecosystem itself**.

Primary source: SERP snapshots.

Entities include:

- queries
- ranking URLs
- domains
- SERP features
- AI Overviews

Signals derived from the Search Graph include:

- rank volatility
- feature volatility
- intent drift
- domain dominance
- SERP similarity
- algorithm shift detection

This graph answers:

**"What is happening in the search results?"**

---

### 2. Content Graph (Project Website)

Represents the **internal structure of the project website**.

Unlike the Search Graph, this graph is **explicitly stewarded** through VEDA workflows. Pages are registered when they are created or modified rather than discovered through crawling.

Entities include:

- Site
- Page
- InternalLink
- SchemaUsage
- PageEntity

Signals derived from the Content Graph include:

- internal linking structure
- topical coverage
- schema distribution
- entity presence

This graph answers:

**"What structure does our site expose to search engines?"**

Specification: `docs/specs/CONTENT-GRAPH-LAYER.md`

---

### 3. Competitor Content Graph

Represents the **structure of competitor pages that appear in monitored SERPs**.

Unlike the project Content Graph, this graph is constructed through **SERP-led observational ingestion**.

VEDA observes competitor pages that appear in SERP snapshots and extracts structural signals from those pages.

Entities may include:

- CompetitorSite
- CompetitorPage
- CompetitorPageObservation
- CompetitorSchemaUsage
- CompetitorInternalLink
- CompetitorCitation

Signals derived from this graph include:

- archetype dominance
- schema usage patterns
- structural patterns of winning pages
- support-link architectures

Specification: `docs/specs/COMPETITOR-CONTENT-OBSERVATORY.md`

---

### 4. Citation Graph (LLM Citation Observatory)

Represents **AI assistant citation behavior**.

This graph captures how domains and entities are referenced by large language models.

Potential data sources:

- DataForSEO LLM Mentions API
- Google AI Overview citations
- direct LLM response capture

Entities may include:

- Prompt
- Model
- CitationDomain
- CitationEntity

Signals derived from the Citation Graph include:

- citation frequency
- cross-model citation coverage
- citation volatility
- entity citation dominance

Specification: `docs/specs/future-ideas/VEDA-LLM-CITATION-OBSERVATORY.md`

---

## How the Graphs Work Together

The power of VEDA comes from comparing these graphs.

Example relationships:

Search Graph
→ shows ranking volatility

Competitor Graph
→ reveals structural patterns of winning pages

Content Graph
→ shows whether the project site matches those structures

Citation Graph
→ reveals which domains are treated as authoritative by AI systems

Together these graphs support deeper intelligence such as:

- ranking vs citation authority mismatches
- structural gaps between competitors and the project site
- SERP archetype patterns
- knowledge authority detection

---

## Graphs and the Strategy Layer

These graphs feed the higher-level VEDA layers:

Search Graph
+
Content Graph
+
Competitor Graph
+
Citation Graph

        ↓

Strategy Synthesis Layer

        ↓

Execution Planning Layer

        ↓

Tactics Layer

        ↓

SEO Lab

---

## Design Principles

VEDA graphs follow consistent system rules:

- **deterministic outputs**
- **compute-on-read analytics**
- **no background mutation pipelines**
- **transactional mutations with event logging**
- **strict project isolation**

These rules maintain the reliability and auditability of the system.

---

## Summary

VEDA is not just a SERP monitoring system.

It is a **search ecosystem intelligence platform** built around multiple interacting graphs that describe how search engines, websites, competitors, and AI systems treat information.

By observing and comparing these graphs, VEDA can produce insights that are impossible when analyzing any single system in isolation.
