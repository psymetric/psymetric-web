# Competitor Content Observatory

## Purpose

The Competitor Content Observatory models the **structure of competitor pages that actually participate in the SERP ecosystem VEDA monitors**.

Unlike the project's own Content Graph, competitor sites are **not stewarded** by the operator. Therefore VEDA must rely on **observational ingestion** rather than explicit registration.

The goal is not to crawl the entire internet or mirror competitor sites.

The goal is to observe the **pages that matter in search competition**.

---

## Core Principle

The SERP Observatory acts as the **selection engine** for competitor page observation.

Instead of crawling competitor sites blindly, VEDA begins with the URLs that appear in tracked SERPs.

Process:

SERP Snapshot
    ↓
Ranking URLs extracted
    ↓
Important competitor pages identified
    ↓
Structural observation performed

This keeps the system focused on pages that actually influence rankings.

---

## Why SERP-Led Observation

Generic crawling answers:

"What pages exist on a competitor site?"

VEDA needs to answer:

"What competitor pages are winning in the SERP ecosystem we observe?"

By using SERP snapshots as the entry point, VEDA avoids unnecessary crawling and focuses only on relevant competitive pages.

---

## Observed Competitor Data

For each observed competitor page, VEDA may extract structured signals such as:

Page signals

- canonical URL
- title
- meta description
- page archetype
- content structure
- heading hierarchy

Schema signals

- schema types present
- primary schema
- schema frequency patterns

Content signals

- section structure
- definitional blocks
- citation patterns

Link signals

- internal links
- outbound citations

Freshness signals

- last modified hints
- update patterns

These signals are stored as structured observations rather than full HTML archives.

---

## Initial Models

Possible data models include:

CompetitorSite

- domain
- firstObservedAt
- lastObservedAt

CompetitorPage

- siteId
- canonicalUrl
- firstObservedAt

CompetitorPageObservation

- pageId
- observedAt
- serpContext
- rankPosition

CompetitorSchemaUsage

- pageId
- schemaType

CompetitorInternalLink

- sourcePageId
- targetUrl

CompetitorCitation

- pageId
- citationDomain

CompetitorArchetype

- pageId
- archetypeType

These models capture **structural intelligence**, not full page content.

---

## Phased Expansion

### Phase 1 — SERP Page Observation

Only pages that appear in tracked SERPs are ingested.

This provides immediate competitive insight with minimal crawl overhead.

---

### Phase 2 — Local Link Neighborhood

For important pages, VEDA may observe pages directly linked from the ranking page.

This reveals support structures around winning pages.

---

### Phase 3 — Domain Graph (Selective)

For high-priority competitors, VEDA may expand observation to broader site structures.

This helps detect patterns such as:

- content hubs
- topic clusters
- schema distribution
- internal linking architecture

---

## Relationship to Other VEDA Systems

### SERP Observatory

The SERP observatory identifies competitive pages through ranking snapshots.

### Content Graph

The Content Graph models the project's own site.

### Strategy Layer

Strategy can compare:

SERP expectations
vs
competitor structures
vs
project content

---

## Example Insight

VEDA may detect patterns such as:

- comparison pages dominating a keyword cluster
- schema usage patterns across competitors
- internal support structures behind winning pages

This allows VEDA to produce strategy recommendations such as:

"SERP cluster dominated by comparison pages with FAQ schema. Project page archetype mismatch detected."

---

## Non-Goals

The Competitor Content Observatory does NOT attempt to:

- crawl the entire web
- mirror competitor sites
- create autonomous background scraping systems

Observation is targeted and deterministic.

---

## Future Opportunities

Once competitor page observations accumulate, VEDA may detect:

- archetype dominance patterns
- schema success patterns
- citation readiness signals
- causal relationships between page changes and SERP movement

This could eventually support **SERP-to-page causality analysis**.

---

## Summary

The Competitor Content Observatory is a **SERP-driven competitor intelligence system**.

SERP snapshots determine which pages matter.

VEDA then observes the structure of those pages to understand why they win.

This system complements the internal Content Graph and allows VEDA to reason across:

- search ecosystem
- competitor implementations
- project site structure
