# VEDA YouTube Observatory Specification

## Purpose

This document preserves a future-facing specification for a **YouTube observatory lens** inside VEDA.

The goal is to extend VEDA’s search intelligence observatory model into YouTube search and discovery without violating the clean lens principle.

This is a **future-ideas specification**.
It does **not** authorize implementation now.
It exists to:

- preserve the architecture direction
- prevent YouTube scope drift from becoming creator-studio bloat
- define the likely observatory object for YouTube
- clarify the truth-surface decision for later planning

---

## Core Position

A YouTube lens can belong inside VEDA **only if** it is treated as an **observatory surface**.

VEDA must not become:

- a video planning system
- a script management system
- a thumbnail workflow system
- a publishing calendar
- a comments/replies engine
- a creator studio clone

Those concerns belong in adjacent execution systems.

VEDA’s role is narrower and cleaner:

- observe YouTube search/discovery surfaces
- preserve structured truth about discoverability
- compute diagnostics on demand
- reveal ecosystem patterns relevant to search, entity presence, and authority

---

## Relationship To VEDA

VEDA currently models:

- external search ecosystems via the SERP Observatory
- internal project structure via the Content Graph
- deterministic diagnostics via compute-on-read analytics

A YouTube observatory lens should extend the first category:

**discovery-surface observability**

It should not be treated as a CMS, publishing workflow, or creator operations system.

The YouTube lens is therefore best understood as:

> **a lens-aware, block-aware discovery-surface observatory**

rather than a simple “ranked video list.”

---

## Guiding Principle

The key architectural statement is:

> **The VEDA YouTube lens should observe YouTube as a lens-dependent, block-structured discovery surface, not as a deterministic flat ranked list and not as a creator workflow system.**

This principle should govern all later design work.

---

## Why YouTube Is Not Just A SERP Clone

A classical web SERP observatory can often treat results as a mostly ordered result set with features layered around it.

YouTube search is messier.

Research indicates that YouTube search/discovery is:

- block-structured
- typed by result kind
- partially personalized
- subject to changing UI regimes
- not fully equivalent across API and UI retrieval methods

A YouTube query may surface combinations of:

- videos
- Shorts
- channels
- playlists
- movies
- official cards
- personalized shelves
- breaking-news or information panels
- ads

This means the primary observatory object cannot simply be:

`query -> ranked videos`

It must instead be closer to:

`query lens/context -> ordered blocks -> typed elements -> enrichment metadata`

---

## Observatory Scope

### In Scope

A future VEDA YouTube observatory may include:

- query tracking for YouTube discovery surfaces
- lens/context modeling
- snapshot capture of ordered blocks
- typed result-element storage
- enrichment of observed video/channel metadata
- compute-on-read diagnostics for volatility and ecosystem shifts
- project visibility analysis across YouTube discovery queries
- future relationships to entity/topic authority analysis

### Out Of Scope

The YouTube observatory must remain out of the following areas:

- script management
- thumbnail workflow
- production pipeline management
- publishing calendar
- upload operations
- creator workspace state
- moderation workflow
- comments/replies workflow
- editorial approvals
- asset management

These belong to execution systems, not the observatory.

---

## Observatory Truth Surface

The most important early design decision is:

> **What truth surface is VEDA actually observing?**

Three candidate instruments exist:

### 1. UI Truth Surface

Definition:

Observe the user-visible YouTube search page directly.

Advantages:

- closest to user-visible reality
- preserves block structure and module presence most faithfully
- captures cards, panels, ad placement, and other page-level phenomena

Disadvantages:

- highest compliance and operational complexity
- hardest to standardize cleanly
- harder to control for personalization and rendering variation
- worst maintenance burden

### 2. API Truth Surface

Definition:

Observe YouTube through the official YouTube Data API.

Advantages:

- official access path
- stable programmatic metadata enrichment
- clear object identifiers and resource structure
- strong fit for video/channel enrichment

Disadvantages:

- may not match the visible UI search surface
- weaker fit for full page/block fidelity
- known completeness/consistency concerns in search retrieval
- not ideal as the sole observatory-grade ranking surface

### 3. Vendor Truth Surface

Definition:

Observe YouTube search through a SERP/vendor provider such as DataForSEO.

Advantages:

- closer to user-visible search-page composition than API-only retrieval
- better fit for ordered blocks and mixed result types
- useful for rank-like page observability
- pragmatic fit for observatory snapshots

Disadvantages:

- vendor-mediated approximation rather than direct platform truth
- requires validation discipline
- may drift from UI behavior over time
- introduces provider dependency

---

## Recommended Phase 0 Decision

The recommended Phase 0 decision is:

- **Primary snapshot instrument:** vendor SERP (for example, DataForSEO)
- **Secondary enrichment instrument:** YouTube Data API
- **Validation instrument:** manual/UI spot checking

This yields the following operating model:

> **VEDA’s YouTube lens observes a vendor-mediated approximation of the user-visible YouTube search surface, validates it through UI spot checks, and enriches items through the official YouTube Data API.**

This is the best current fit for VEDA because:

- it preserves the observatory focus
- it captures page-structure realities better than API-only retrieval
- it avoids making raw UI automation the primary architecture bet
- it keeps the API in the role it fits best: stable metadata enrichment

---

## Baseline Lens Concept

Because YouTube search is not fully deterministic, the observatory must define an explicit **lens**.

A lens is the contextual wrapper under which a snapshot is interpreted.

At minimum, a lens may include:

- query
- timestamp
- retrieval source
- region
- language
- safe-search mode when relevant
- signed-in vs signed-out state
- history state when relevant
- device class when relevant
- experiment or cohort label when relevant

Important rule:

> **A YouTube ranking observation without an explicit lens is not observatory-grade truth.**

It is only an unlabeled output.

---

## Core Observatory Objects

### 1. Query Lens

Represents the context in which a query is observed.

Possible fields:

- query text
- normalized query key
- region
- language
- retrieval source
- device class
- signed-in state
- history state
- timestamp

### 2. Snapshot

Represents one observed YouTube results page for a query lens at a point in time.

Possible fields:

- snapshot id
- query lens id
- captured at
- retrieval source
- raw provenance metadata
- validation status

### 3. Ordered Block

Represents one ordered block/module on the search results page.

Possible examples:

- organic result block
- Shorts block
- channels block
- official card block
- breaking-news panel
- personalized shelf
- ad block

Possible fields:

- block id
- snapshot id
- block type
- block rank / position
- block label / title
- block metadata

### 4. Typed Element

Represents one element inside a block.

Possible element types:

- video
- short
- playlist
- channel
- movie
- ad
- card item
- panel item

Possible fields:

- element id
- block id
- element type
- rank within block
- absolute rank when meaningful
- stable external id when available
- title
- channel reference
- url / locator
- vendor flags such as shorts classification when available

### 5. Enrichment Record

Represents metadata enrichment for observed items.

Possible sources:

- YouTube Data API video resource
- YouTube Data API channel resource
- future vendor-specific metadata extensions

Possible fields:

- resource type
- external id
- publish time
- channel id
- channel title
- statistics snapshot
- category/topic metadata
- enrichment captured at

---

## Snapshot Semantics

A YouTube snapshot should be treated as:

- an ordered list of blocks
- each block containing ordered typed elements
- all interpreted within a declared lens

This is the minimal shape required to preserve page meaning.

A flattened rank list should be treated only as a derived view, not as the primary stored truth.

---

## Ranking Semantics

Because YouTube can mix ads, cards, modules, and multiple result types, ranking semantics must be explicit.

Possible derived ranking views may include:

### Absolute Rank

Counts user-visible element positions across the whole snapshot when meaningful.
Useful for visible prominence.

### Organic Rank

Counts positions among organic non-paid elements only.
Useful for project visibility analysis that excludes paid placement.

### Rank Within Block

Counts the element position inside a specific block.
Useful for interpreting module-local visibility.

Important rule:

> **Ranking in the YouTube observatory is derived from the block-aware snapshot model. It is not the primary object itself.**

---

## Diagnostics Model

The YouTube lens should remain compute-on-read.

It should not introduce materialized volatility tables or persistent analytics caches.

Potential diagnostics include:

### Volatility Diagnostics

- day-over-day set overlap
- rank churn
- element entry/exit from top-N derived views
- block appearance/disappearance
- result-type composition drift

### Ecosystem Diagnostics

- channel dominance / concentration
- project-owned surface visibility
- topic/entity visibility concentration
- Shorts vs longform balance
- official-card or panel presence by query class

### Lens Diagnostics

- differences by region
- differences by language
- differences by signed-in/out baseline
- differences by history state when explicitly modeled

All such diagnostics should remain:

- read-only
- deterministic relative to the stored snapshots and lens definitions
- compute-on-read

---

## Relationship To Content Graph

The YouTube observatory should not replace the Content Graph.

The Content Graph models the project’s internal structural ecosystem.

The YouTube observatory models an external discovery surface.

A future relationship may eventually exist between:

- project website structural truth
- project YouTube visibility truth
- shared topic/entity territory
- cross-surface authority patterns

But the sequence matters.

The YouTube observatory should be introduced first as a **standalone observatory surface**.
Cross-surface structural reasoning should come later.

---

## Relationship To V Project And CMS

### Relationship To V Project

V Project may eventually provide upstream planning context such as:

- whether a project is ready to enter YouTube observability
- intended surface declarations
- channel identity references
- strategic topic/entity territory hints

But V Project should not own the YouTube observatory itself.

### Relationship To CMS / Execution Systems

The CMS may eventually consume advisory insights from the YouTube observatory, such as:

- query opportunity signals
- dominance gaps
- result-type composition clues
- topic/entity visibility gaps

But the CMS should own:

- scripts
- thumbnails
- production workflows
- publishing calendar
- creator workflow state
- comments/replies operations

VEDA must remain the observatory, not the execution engine.

---

## Data Source Strategy Guidance

### Recommended Strategy

Use a layered source strategy:

1. **Vendor SERP source** for primary page snapshots
2. **YouTube Data API** for enrichment and stable metadata
3. **UI spot checks** for validation and drift review

### Why This Strategy Fits VEDA

This strategy preserves:

- page-structure observability
- explicit truth-surface honesty
- strong enrichment via official identifiers
- lower architectural risk than UI-first automation
- higher observatory usefulness than API-only retrieval

---

## Invariants For A Future YouTube Lens

Any future implementation must preserve core VEDA invariants:

- project isolation
- deterministic ordering
- compute-on-read analytics
- transaction discipline for mutations
- EventLog discipline for any writes
- LLM proposal only, never silent mutation

Additional YouTube-specific invariants should include:

- every snapshot must declare its lens
- every derived ranking view must state its ranking semantics
- retrieval source must be explicit
- page/block structure should not be discarded at ingest
- observatory storage should preserve enough truth to support later re-interpretation

---

## Non Goals

This document does not authorize or imply:

- direct UI scraping implementation now
- DataForSEO implementation now
- YouTube Data API integration now
- creator workflow implementation now
- publishing workflow implementation now
- comments/replies tooling now
- merging YouTube production operations into VEDA

This document exists to preserve the future observatory architecture, not to accelerate scope drift.

---

## Recommended Future Sequence

If this concept later moves into active planning, the sequence should be:

### Phase 0 — Truth Surface Definition

Decide and document:

- primary truth surface
- enrichment surface
- validation surface
- compliance posture
- baseline lens definition

### Phase 1 — Snapshot Model

Define and validate:

- query lens model
- snapshot model
- block model
- typed element model
- ranking semantics

### Phase 2 — Core Diagnostics

Define and validate:

- overlap/churn metrics
- block volatility
- channel concentration
- project visibility
- result-type composition

### Phase 3 — Cross-Surface Reasoning

Only after the observatory surface is stable, explore:

- project entity/topic reinforcement across website and YouTube
- future content-graph relationships where justified
- downstream advisory outputs for execution systems

---

## Guiding Principle

Keep the VEDA lens clean.

The YouTube observatory belongs in VEDA only as a **search/discovery observatory surface**.

It should help reveal:

- what the YouTube discovery ecosystem is showing
- how that ecosystem is structured
- how project visibility behaves within it
- where opportunity, concentration, and volatility exist

It should not become the place where videos are produced, scheduled, or managed.
