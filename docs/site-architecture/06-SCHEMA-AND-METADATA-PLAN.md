# Schema & Machine-Readable Metadata Plan

## Purpose
This document defines the **structured data, metadata, and machine-readable signals** used across the PsyMetric system.

It exists to:
- reduce ambiguity for search engines
- support LLM ingestion and citation
- ensure consistency across page types
- avoid schema spam or speculative markup

Schema is used to clarify meaning, not to manipulate rankings.

---

## Core Principle

**Structure reflects reality.**

- Schema must match actual page content.
- Metadata must be derivable from DB state.
- No speculative or inflated schema is permitted.

If schema markup conflicts with visible content, the schema is wrong.

---

## Global Metadata (All Pages)

Every page must include:

- `<title>` aligned with page intent
- `<meta description>` summarizing the page neutrally
- Canonical URL
- Robots directives derived from publish state
- Breadcrumb markup

These elements are mandatory and non-optional.

---

## Schema Types by Page Category

### Wiki – Concept Pages

**Primary schema:** `Article`

Optional extensions:
- `TechArticle` (when appropriate)

Required fields:
- `headline`
- `description`
- `author` (Organization)
- `datePublished`
- `dateModified`
- `mainEntityOfPage`

Notes:
- One concept = one article
- No FAQ schema unless the page explicitly contains Q&A sections

---

### Wiki – Model Pages

**Primary schema:** `Article`

Required fields:
- `headline`
- `description`
- `datePublished`
- `dateModified`

Optional:
- `about` links to Concept entities

Notes:
- Capabilities must match cited content
- Temporal claims must be reflected in visible text

---

### Wiki – Comparison Pages

**Primary schema:** `Article`

Optional:
- `ItemList` for structured comparisons

Notes:
- Comparison tables must be visible if structured
- No ranking or rating properties

---

### Wiki – Guide Pages

**Primary schema:** `HowTo`

Required fields:
- `name`
- `description`
- `step` (derived from visible steps)

Notes:
- Steps must match page content exactly
- No inferred or hidden steps

---

### Wiki – Project Pages

**Primary schema:** `Article`

Optional:
- `SoftwareSourceCode` (if repo details are present)

Notes:
- Do not imply production readiness
- Repo metadata must be accurate

---

### Main Site Pages

**Primary schema:** `WebPage`

Optional:
- `Organization`
- `CollectionPage`

Notes:
- Main Site pages must not declare definitional authority

---

## Organization Schema

The system defines **one canonical Organization entity**.

Used for:
- `author`
- `publisher`
- `Organization` schema

This entity is stable across domains.

---

## Breadcrumbs

- Breadcrumbs are rendered on all indexable pages
- Breadcrumbs reflect logical hierarchy, not URL depth

Example:
```
Wiki > Concepts > Tool Calling
```

---

## Robots & Indexing Metadata

- `noindex` applied to drafts and previews
- `index` applied only to published pages
- Canonical URLs always declared explicitly

Robots behavior is derived from DB state.

---

## JSON-LD Placement

- All schema is rendered as JSON-LD
- Placed in the document head or immediately after opening body tag
- One consolidated schema block per page preferred

---

## Anti-Patterns (Explicitly Forbidden)

- FAQ schema without real Q&A content
- Rating or review schema
- Keyword-stuffed metadata
- Schema fields not visible to users

---

## Invariants

- Schema mirrors visible content
- Metadata is deterministic
- DB state drives machine-readable output

If schema decisions conflict with this document, this document wins unless explicitly amended.

---

## Status
This document defines canonical schema and metadata behavior.

Remaining documents:
- Citation and source usage
- SEO and research hooks

End of document.

