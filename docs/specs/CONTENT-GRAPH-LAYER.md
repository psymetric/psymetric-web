# Content Graph Layer

## Purpose

The Content Graph Layer gives VEDA a structured, machine-readable model of a project's website.

VEDA already observes the external search ecosystem through SERP snapshots, volatility sensors, classification, timeline reconstruction, and operator reasoning.

The Content Graph Layer models the internal content ecosystem of the project itself.

Together, these systems allow VEDA to reason across both sides of SEO:

- the search environment
- the project's own website structure

This layer exists so VEDA and LLM assistants can understand:

- what pages exist
- how they are linked
- which anchor text is used
- what schema is present
- which topics and entities are covered
- which pages are canonical for a concept or intent

This is the foundation for page-aware reasoning, execution planning, internal linking intelligence, and future content gap analysis.

---

## Core Principle

The website does **not** need to render directly from the database.

Instead:

- the website may be implemented normally in a framework such as **Next.js**
- the database stores the **canonical structural model** of the site
- the website and the database remain synchronized through an explicit **VEDA stewardship workflow**

The database acts as the site's **Content Graph**, not its rendering engine.

VEDA acts as the system steward for structural knowledge about the site.

---

## Stewarded Website Model

VEDA assumes a **stewarded publishing workflow** rather than a discovery model.

Pages are not inferred by crawling the website.

Instead the workflow is:

1. SERP intelligence identifies an opportunity.
2. A page or structural change is proposed through VEDA.
3. The operator reviews and approves the change.
4. The page is implemented in the website codebase.
5. The page and its structural metadata are registered in the Content Graph.

Because pages are created intentionally through this workflow, VEDA does not need to crawl the website to discover them.

The Content Graph becomes the authoritative structural record of the site.

---

## Architectural Role

VEDA now has two major observational systems:

### 1. Search Graph

The external search ecosystem.

Modeled through:

- SERP snapshots
- volatility
- feature volatility
- intent drift
- domain dominance
- SERP similarity
- classification
- timeline
- causality

### 2. Content Graph

The internal content system of the project website.

Modeled through:

- pages
- page types
- internal links
- anchor text
- schema usage
- topic/entity coverage
- canonical structure
- publishing and indexing state

VEDA's reasoning layer compares these two systems.

Example:

- the SERP expects a comparison-style page
- the site only has definitional pages
- internal support links are weak
- schema coverage is incomplete

This becomes actionable intelligence.

---

## Content Graph Registration

Instead of "discovering" pages by crawling the website, the Content Graph uses **explicit registration**.

Whenever a page is created, updated, or retired, the corresponding structural records must be updated in the Content Graph.

Typical registration includes:

- registering the page
- defining its page type
- assigning canonical URL
- recording internal links
- recording schema usage

This registration should occur as part of the approved page change workflow.

---

## Website Workflow

The website workflow should remain explicit and synchronized.

1. A content opportunity is identified through strategy or investigation.
2. A page is proposed through VEDA.
3. The operator reviews and approves the change.
4. The page is implemented in the Next.js site.
5. The structural metadata for that page is registered in VEDA.
6. Internal linking relationships are recorded.
7. Schema and indexing rules are validated.
8. The page becomes part of the Content Graph.

This keeps the website and Content Graph aligned without requiring the website to render from the database.

---

## Suggested Core Models

The exact schema is not defined yet, but the Content Graph Layer should eventually support structured records similar to the following.

### Site

Represents a project website.

Suggested fields:

- projectId
- domain
- framework
- repoPath
- defaultLocale
- publishMode

### Page

Represents a canonical page in the site.

Suggested fields:

- siteId
- url
- slug
- pageType
- title
- canonicalUrl
- status
- indexability
- sitemapInclusion
- primaryIntent
- primaryKeywordCluster

### PageEntity

Maps a page to its concepts, entities, topics, or products.

Suggested fields:

- pageId
- entityKey
- entityType
- role

### InternalLink

Represents explicit page-to-page links.

Suggested fields:

- sourcePageId
- targetPageId
- anchorText
- linkType
- placement

### SchemaUsage

Tracks structured data used on a page.

Suggested fields:

- pageId
- schemaType
- isPrimary

### PageSection

Optional finer-grained structural model for later reasoning.

Suggested fields:

- pageId
- sectionKey
- heading
- sectionType
- targetIntent

These models anchor system thinking and may evolve.

---

## Validation vs Discovery

VEDA may eventually implement **validation tools** that check the Content Graph against the built website.

Examples include:

- verifying that registered pages exist
- verifying canonical URLs
- verifying internal link presence
- verifying schema emission

These tools ensure synchronization but do **not** replace the stewardship workflow.

---

## Relationship to Other VEDA Layers

The Content Graph Layer connects directly to several other planned layers.

### SERP Observatory

The SERP observatory monitors the search ecosystem.

The Content Graph monitors the project's own site structure.

VEDA compares them.

### Strategy Layer

The strategy layer uses SERP signals to identify what the site should do.

The Content Graph shows what the site already has.

### Execution Planning Layer

Execution planning turns strategy into concrete page-level actions.

### Tactics / Checkers Layer

Traditional SEO mechanics such as internal linking, anchor text, schema, and content structure operate here.

### SEO Lab

Future experiments may test changes to page structure, internal links, schema, and content archetypes.

### VS Code Extension

The Page Command Center and contextual SERP Copilot will rely heavily on this layer.

---

## Next.js Fit

Next.js is a strong fit for project websites in this architecture.

The likely model is:

- Next.js renders the website
- VEDA stores the structural graph of the website
- explicit workflow keeps them aligned

---

## Future Extension: Competitor Content Graph

Competitor websites will require a different approach.

Because competitor sites are not stewarded by the operator, VEDA must rely on **observational ingestion**.

This will likely involve:

- crawling competitor pages
- extracting page structure
- extracting schema usage
- mapping internal links
- mapping content archetypes

This information would form a **Competitor Content Graph**.

This system is separate from the project's Content Graph and should be documented independently.

---

## Non-Goals

This document does not define:

- the final database schema
- website rendering implementation details
- autonomous content publishing
- direct DB-rendered website runtime
- background mutation workflows

This layer is an architectural specification, not an implementation plan.

---

## Supporting Documents

The site architecture planning set already defines many of the rules this layer will rely on.

Relevant docs:

- docs/site-architecture/01-SITE-ARCHITECTURE-OVERVIEW.md
- docs/site-architecture/02-URL-AND-ROUTING-STRATEGY.md
- docs/site-architecture/03-WIKI-CONTENT-TYPES-AND-PAGE-ANATOMY.md
- docs/site-architecture/04-INTERNAL-LINKING-AND-RELATIONSHIP-RENDERING.md
- docs/site-architecture/05-PUBLISHING-AND-INDEXING-RULES.md
- docs/site-architecture/06-SCHEMA-AND-METADATA-PLAN.md
- docs/site-architecture/07-CITATION-AND-SOURCE-USAGE.md
- docs/site-architecture/08-SEO-AND-RESEARCH-HOOKS.md
- docs/site-architecture/09-MEDIA-AND-ASSETS.md

These documents define the website rules.

The Content Graph Layer makes those rules available to VEDA as structured system knowledge.
