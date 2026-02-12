# Publishing & Indexing Rules

## Purpose
This document defines **when content becomes public, indexable, and canonical** within the PsyMetric system.

It exists to:
- prevent accidental SEO damage
- keep search engines and LLMs aligned with system state
- ensure traceability between DB status and public visibility
- eliminate ambiguity around drafts, previews, and updates

---

## Core Principle

**Publishing is a state transition, not a side effect.**

- Content is public only when explicitly published.
- Indexability is derived from DB state, not routing or UI behavior.
- Visibility decisions must be deterministic and auditable.

---

## Content Lifecycle States

All content entities follow a minimal lifecycle:

- `draft` – exists internally, not public, not indexable
- `published` – public and indexable
- `archived` – public but not actively promoted

State is stored in the database and is authoritative.

---

## Publishing Rules

- Only entities with `status = published` are rendered publicly.
- Publishing an entity:
  - sets a `publishedAt` timestamp
  - makes the canonical URL resolvable
  - includes the page in sitemaps

Publishing is an intentional act and must not occur implicitly.

---

## Indexing Rules

- Only `published` entities are indexable by search engines.
- Draft and preview pages must include `noindex, nofollow` directives.
- Archived pages remain indexable unless explicitly de-indexed.

Indexability is controlled centrally and consistently.

---

## Drafts & Previews

- Draft content may be viewable internally via preview URLs.
- Preview URLs:
  - must not appear in sitemaps
  - must not be linked publicly
  - must include `noindex` directives

Preview access is for review, not discovery.

---

## Updates to Published Content

- Updating published content does not change its canonical URL.
- Significant updates may:
  - update `updatedAt`
  - optionally note changes on the page

Search engines should see updates as continuity, not new pages.

---

## Archiving Behavior

- Archived content remains accessible at its canonical URL.
- Archived content:
  - is excluded from sitemaps
  - is not promoted in navigation
  - displays an "archived" notice

Archiving preserves history without driving new traffic.

### Archived Page Rendering Rules

1. **Full content remains visible** — do not stub or truncate
2. **Archived banner at top** — clear visual indicator (e.g., yellow/gray bar)
3. **Superseded link (if applicable)** — if a replacement exists, link to it prominently
4. **Removed from internal navigation** — no sidebar/menu links
5. **URL stays alive** — preserves external backlinks and LLM citations
6. **`archivedAt` timestamp displayed** — transparency about when it was archived

Archived pages should feel like historical records, not dead ends.

---

## Sitemaps

- Sitemaps are generated from DB state.
- Only canonical URLs of `published` entities are included.
- One sitemap per logical surface is acceptable.

No drafts, previews, or archived-only content should appear in sitemaps.

---

## Error Handling & Missing Pages

- Requests for non-existent or non-published entities return a proper 404.
- Soft 404s are forbidden.
- Redirects must not be used to mask missing content.

Clear failure states are preferred over ambiguity.

### 404 Page Requirements

The 404 page must include:

1. **Clear "not found" message** — no ambiguity
2. **Search box** — let users find what they were looking for
3. **Links to popular content** — Concepts index, Guides index, homepage
4. **Proper HTTP 404 status code** — not a 200 with "not found" text

A well-designed 404 page recovers 10-15% of would-be bounces.

### Previously Published, Now Archived

If a URL was once published but is now archived:
- Return **200** (content still exists)
- Display archived banner
- Do **not** return 404 or 410

If a URL was once published but entity is **deleted** (exceptional case):
- Return **410 Gone** (not 404)
- This signals permanent removal to search engines

---

## Invariants

- DB status is the single source of truth for visibility.
- Publishing is explicit and logged.
- Indexing follows publishing, never the reverse.

If a future decision conflicts with this document, this document wins unless explicitly amended.

---

## Status
This document defines canonical publishing and indexing behavior.

Next documents will define:
- Schema and metadata mapping
- Citation and source usage
- SEO and research hooks

End of document.

