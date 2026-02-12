# URL & Routing Strategy

## Purpose
This document defines the **canonical URL structure and routing rules** for the PsyMetric system.

It exists to:
- prevent SEO ambiguity and duplicate intent
- support stable LLM citation
- decouple page identity from deployment details
- ensure future changes do not break canonical meaning

Domains and hostnames are intentionally unspecified.

---

## Core Principles

1. **URLs express meaning, not implementation**
2. **One intent = one canonical URL**
3. **Definitions have exactly one canonical location**
4. **IDs are canonical; URLs are addressable projections**

If a routing decision conflicts with these principles, the routing decision is wrong.

---

## Logical Surfaces

Routing is defined in terms of **logical surfaces**, not domains.

- **Main Site Surface** – narrative, orientation, credibility
- **Wiki Surface** – reference, definition, citation

These surfaces may be deployed via subdomains, subdirectories, or other mechanisms without changing this document.

---

## Wiki URL Structure (Canonical)

All Wiki URLs are canonical for reference and definition.

### Concepts
```
/concepts/{slug}
```

Rules:
- `{slug}` represents exactly one Concept entity
- Singular concept only
- No versioning in the URL

---

### Models
```
/models/{slug}
```

Rules:
- One page per model or system
- Slug matches official model name where possible
- Temporal changes handled in content, not URL

---

### Comparisons
```
/comparisons/{slug}
```

Rules:
- Slug format: `x-vs-y`
- Order is intentional and fixed
- One canonical comparison per pair

**Slug Ordering Rule:**
- Default: **alphabetical** by canonical slug (e.g., `claude-vs-gpt-4` not `gpt-4-vs-claude`)
- Exceptions: allowed only with documented rationale in the DB record (`notes` field)
- This prevents duplicate `/x-vs-y` and `/y-vs-x` pages

---

### Guides
```
/guides/{slug}
```

Rules:
- Procedural intent only
- Guides never compete with Concept pages for definitions

---

### Projects
```
/projects/{slug}
```

Rules:
- One Project entity per slug
- Slug does not imply production readiness

---

## Main Site URL Structure (Non-Canonical for Definitions)

Main Site URLs provide orientation and narrative context.

| Route | Purpose |
|-------|--------|
| `/` | Homepage — brand entry point |
| `/about` | Mission, philosophy, team |
| `/how-to-use` | Site orientation and navigation guide |
| `/learning-paths` | Index of curated learning paths |
| `/learning-paths/{slug}` | Individual learning path page |
| `/projects` | Project showcase index |
| `/news` | News/updates index |
| `/news/{slug}` | Individual news item (if defined here vs Wiki) |

Rules:
- Main Site pages must not define technical terms
- When concepts are mentioned, they must link to the Wiki
- Main Site URLs must not outrank Wiki URLs for definitional queries
- Learning paths are curated sequences; they reference Wiki content, not replace it

---

## Canonical URL Rules

- Every Wiki page has exactly one canonical URL
- Canonical tags always point to the Wiki for definitions
- Main Site pages never declare canonical authority for concepts
- Redirects must preserve intent (301 only)

---

## Slug Management

- Slugs are human-readable and SEO-oriented
- Slugs may change over time
- Slug changes must:
  - preserve entity ID
  - issue a permanent redirect
  - update sitemaps

IDs remain the canonical identity.

---

## Drafts, Previews, and Non-Indexable Routes

- Draft pages must not be indexable
- Preview URLs must be excluded from sitemaps
- Only pages with `status=published` are indexable

Indexability is derived from DB state, not routing logic.

---

## Sitemaps

- Sitemaps are generated from DB state
- Only canonical, published URLs are included
- One sitemap per surface is acceptable

No placeholders. No future URLs. No drafts.

---

## Redirect Rules

- 301 redirects only
- No redirect chains
- Redirects must preserve semantic intent

Redirects exist to protect users and crawlers, not to manipulate rankings.

---

## Invariants

- Definitions live only in the Wiki
- One intent maps to one canonical URL
- URLs may change; IDs do not
- Routing never introduces semantic ambiguity

If a future routing decision conflicts with these rules, this document wins unless explicitly amended.

---

## Status
This document defines canonical routing behavior.

Next documents will define:
- Internal linking and relationship rendering
- Publishing and indexing rules
- Schema and metadata mapping

End of document.

