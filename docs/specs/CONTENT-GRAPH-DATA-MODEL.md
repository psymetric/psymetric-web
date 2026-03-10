# Content Graph Data Model

## Purpose

The Content Graph models the **internal structure of a project's brand ecosystem**.

While the SERP Observatory models the external search ecosystem, the Content Graph models the structure and relationships of the project's own content surfaces.

VEDA compares the external ecosystem (SERPs) with the internal ecosystem (Content Graph) to detect structural gaps and opportunities.

All analytics follow VEDA's architectural invariants:

- compute-on-read analytics
- deterministic ordering
- project isolation
- no materialized intelligence tables

---

## Design Goal

The Content Graph must allow VEDA to reason about:

- topic territory coverage
- entity coverage
- page archetype distribution
- internal authority flow
- structural gaps in the site ecosystem

This enables the **SERP domination loop**:

SERP ecosystem
→ competitor structure analysis
→ compare with project content graph
→ detect coverage gaps
→ propose execution actions

---

# Phase 1 – Core Content Graph

Phase 1 focuses on modeling only the structures required for **coverage analysis and authority flow reasoning**.

The goal is to unlock the first domination loop while maintaining strict architectural discipline.

## Core Nodes

### Surface

Represents a project surface where content exists.

Examples:

- website
- wiki
- blog
- X
- YouTube

A project may declare multiple surfaces.

---

### Site

Represents a web property within a surface.

Example properties:

- domain
- framework (e.g. Next.js)
- sitemap behavior
- canonical configuration

Structure:

Project
→ Surface
→ Site

---

### Page

Represents a canonical content unit.

Example page attributes:

- url
- title
- archetype
- canonical status
- publishing state

Pages belong to a Site.

---

### ContentArchetype

Represents the structural type of a page.

Examples:

- guide
- comparison
- review
- tutorial
- reference

SERP behavior often correlates strongly with page archetypes.

---

### Topic

Represents conceptual territory clusters.

Topics allow VEDA to reason about **coverage depth and breadth**.

---

### Entity

Represents real-world entities referenced by content.

Examples:

- product
- ingredient
- technology
- concept
- organization

Entities are critical for modern search understanding and schema alignment.

---

## Relationship Objects

### PageTopic

Links pages to the topics they cover.

Possible roles:

- primary topic
- supporting topic

---

### PageEntity

Links pages to the entities they reference.

Possible roles:

- primary entity
- supporting entity
- reviewed entity
- compared entity

---

### InternalLink

Represents a structural link between two pages.

Attributes:

- source page
- destination page
- anchor text
- link role

Examples of link roles:

- hub link
- support link
- navigation link

Internal linking is a major signal of topical authority flow.

---

### SchemaUsage

Represents structured data used on a page.

Examples:

- Article
- Product
- FAQ
- HowTo
- Recipe

Schema usage strongly influences SERP features.

---

# Future Phases

Future phases expand the Content Graph to support deeper reasoning layers.

These are intentionally deferred until the core graph proves stable.

## Phase 2 – Coverage Intelligence

Derived reasoning about:

- topic authority score
- entity authority score
- cluster completeness
- structural hub detection

These remain compute-on-read.

---

## Phase 3 – Competitor Content Observatory

Integration with SERP Observatory signals.

Potential objects:

- CompetitorPage
- CompetitorSchema
- CompetitorArchetype

Used to reverse-engineer winning page structures.

---

## Phase 4 – Execution Planning

Adds operational planning structures.

Examples:

- ProposedPage
- CoverageGap
- ExecutionPlan

These enable VEDA to recommend specific actions to dominate SERPs.

---

## Phase 5 – Cross-Surface Authority

Integration with non-web surfaces.

Examples:

- YouTube content nodes
- X post clusters
- cross-surface entity reinforcement

This expands the graph beyond websites into full brand ecosystems.

---

# Key Architectural Rule

The Content Graph stores **structure only**.

All intelligence derived from the graph must follow:

compute-on-read analytics

VEDA must never persist derived authority scores or volatility metrics.

The graph provides the structural foundation for reasoning layers implemented elsewhere in the system.
