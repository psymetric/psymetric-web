# Internal Linking & Relationship Rendering Rules

## Purpose
This document defines how **explicit database relationships** are rendered as visible links and sections across the Wiki and Main Site surfaces.

It exists to:
- convert the DB graph into navigable authority
- support SEO topical clustering
- make relationships legible to LLMs
- prevent link sprawl and semantic ambiguity

---

## Core Principle

**Relationships are first-class. Links are projections.**

- All meaningful relationships originate in the database.
- Pages render relationships explicitly, not infer them from prose.
- Inline links support readability; relationship blocks express structure.

---

## Relationship Rendering Rules (Global)

- Only render **direct relationships** (no inferred hops).
- Relationship blocks are labeled and consistent across pages.
- Relationship sections appear **below primary content**, never interrupt definitions.
- The same relationship type always renders with the same label.

---

## RelationType → UI Label Mapping

The DB stores specific relationship types. The UI collapses semantically similar types into unified section labels.

| DB RelationType | Rendered Section Label | Notes |
|-----------------|----------------------|-------|
| `GUIDE_USES_CONCEPT` | Related Concepts | On Guide pages |
| `GUIDE_EXPLAINS_CONCEPT` | Related Concepts | Collapsed with USES |
| `GUIDE_REFERENCES_SOURCE` | Sources / References | |
| `CONCEPT_RELATES_TO_CONCEPT` | Related Concepts | On Concept pages |
| `PROJECT_IMPLEMENTS_CONCEPT` | Concepts Demonstrated | On Project pages |
| `PROJECT_REFERENCES_SOURCE` | Sources / References | |
| `PROJECT_HAS_GUIDE` | Related Guides | On Project pages |
| `NEWS_DERIVED_FROM_SOURCE` | Sources / References | |
| `NEWS_REFERENCES_SOURCE` | Sources / References | Collapsed with DERIVED |
| `NEWS_REFERENCES_CONCEPT` | Related Concepts | On News pages |
| `DISTRIBUTION_PROMOTES_*` | (not rendered on Wiki) | Distribution tracking only |
| `VIDEO_EXPLAINS_*` | (not rendered on Wiki) | Distribution tracking only |

**Principle:** Preserve semantic specificity in the DB; simplify for human navigation in the UI.

---

## Concept Page Relationship Rendering

### Rendered Sections

1. **Related Concepts**
   - Renders `CONCEPT_RELATES_TO_CONCEPT`
   - Limit to directly related concepts only

2. **Used In**
   - Guides that use or explain the concept
   - Projects that implement the concept
   - Models that rely on the concept

### Rendering Notes
- Do not rank or order by importance
- Alphabetical or stable ordering only

---

## Model Page Relationship Rendering

### Rendered Sections

1. **Concepts Used**
   - Renders Concept relationships

2. **Comparisons**
   - Links to Comparison pages involving this model

### Rendering Notes
- No implied endorsement
- No usage statistics rendered here

---

## Comparison Page Relationship Rendering

### Rendered Sections

1. **Compared Concepts / Models**
   - Explicit links to compared entities

2. **Related Concepts**
   - Supporting or prerequisite concepts

---

## Guide Page Relationship Rendering

### Rendered Sections

1. **Related Concepts**
   - Concepts required to understand the guide

2. **Related Projects**
   - Reference implementations or demos

### Rendering Notes
- Guides may link inline to Concepts
- Definitions must remain on Concept pages

---

## Project Page Relationship Rendering

### Rendered Sections

1. **Related Guides**
   - Guides that explain or use the project

2. **Concepts Demonstrated**
   - Concepts implemented or showcased

---

## Main Site Relationship Rendering

The Main Site may render **curated subsets** of relationships.

Rules:
- Main Site never renders full relationship graphs
- Links always point to canonical Wiki pages
- Narrative context may explain why a relationship matters

---

## Ordering & Limits

- No page renders more than 10 items per relationship section by default
- Overflow is handled via "View all" links
- Stable ordering preferred over dynamic ranking

---

## Anti-Patterns (Explicitly Forbidden)

- Inline prose implying relationships not present in DB
- Manually curated lists that contradict DB relationships
- Hidden or collapsed relationship blocks by default
- Ranking relationships by popularity or metrics

---

## Invariants

- Relationships are rendered, not invented
- Relationship semantics never change silently
- Rendering logic must match DB relation types

If rendering behavior conflicts with this document, this document wins unless explicitly amended.

---

## Status
This document defines canonical relationship rendering behavior.

Next documents will define:
- Publishing and indexing rules
- Schema and metadata mapping
- Citation and source usage

End of document.

