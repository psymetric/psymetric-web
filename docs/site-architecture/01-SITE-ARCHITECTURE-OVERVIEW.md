# Site Architecture Overview

## Purpose
This document defines the high-level architecture of the PsyMetric website system.

It exists to lock in **roles, boundaries, and invariants** so that future design, SEO work, and implementation decisions do not introduce drift.

This is an internal planning document. It is intentionally boring and explicit.

---

## Core Principle
**One system. Two surfaces. One source of truth.**

- The system has a single canonical source of truth: the database.
- The website is a projection of database state.
- Large Language Models (LLMs) assist with drafting and analysis but do not define reality.

The system deliberately separates *definition* from *explanation*.

---

## Logical Surfaces (Domain-Agnostic)

Hostnames and domains are intentionally unspecified. All design is **role-based**, not domain-based.

### 1. Main Site Surface
**Role:** Orientation, narrative, credibility, and guidance.

The Main Site answers:
- What is PsyMetric?
- Why does it exist?
- How should a human use it?
- How do pieces of the system fit together?

It is designed primarily for **humans**, not for definitional lookup.

**Allowed content:**
- Mission and philosophy
- How the system works
- Curated learning paths
- Project showcases
- Editorial explanations

**Explicitly not allowed:**
- Canonical definitions of technical terms
- Glossary-style explanations
- Authoritative claims about “what X is”

When the Main Site mentions a technical concept, it must link to the Wiki and stop.

---

### 2. Wiki Surface
**Role:** Reference, definition, and citation anchor.

The Wiki answers:
- What is X?
- How does X work (conceptually)?
- How does X relate to Y?
- Where is X used or demonstrated?

It is designed for:
- Search engines
- LLM citation
- Serious users seeking precise understanding

**Allowed content:**
- Canonical concept definitions
- Model reference pages
- Explicit comparisons
- Guides (procedural, scoped)
- Project reference pages

**Explicitly not allowed:**
- Marketing language
- Opinionated framing
- Personality or cultural commentary
- Narrative persuasion

The Wiki is the **only place** where definitions live.

---

## Source of Truth

- The database is the canonical source of truth.
- Page existence, URLs, relationships, and status are derived from DB records.
- If something is not represented in the DB, it is considered non-canonical.

The website does not invent state. It renders it.

---

## Canonical Authority Rules

- Every concept has exactly one canonical definition page (Wiki).
- Every Guide, Project, Model, or Comparison page links back to Concepts for definitions.
- The Main Site never competes with the Wiki for definitional authority.

This rule exists to support:
- SEO clarity
- LLM citation consistency
- Long-term maintainability

---

## Relationship-Driven Navigation

Navigation and internal linking are driven by explicit relationships stored in the database.

Examples:
- Concepts list related Concepts, Guides, and Projects.
- Guides list the Concepts they use and Projects they reference.
- Projects list the Concepts they demonstrate and Guides that explain them.

Relationships are first-class. Inline prose links are secondary.

---

## Non-Goals (Important)

This system is **not**:
- A news-driven content farm
- A personality-centric media site
- A benchmarking or evaluation authority
- A trend-chasing SEO blog

Avoiding these is a deliberate design choice.

---

## Invariants (Must Not Change Later)

- Definitions live only in the Wiki
- Database IDs are canonical identity
- URLs may change; IDs do not
- Relationships are explicit, not inferred
- Published pages are indexable; drafts are not
- **Mobile-first is assumed** — all pages must be responsive and performant on mobile devices

If a future decision conflicts with this document, this document wins unless explicitly amended.

---

## Technical Constraints

These are implementation-level constraints, not architecture:

- **Mobile-first indexing** — Google indexes mobile versions; design for mobile first
- **Core Web Vitals compliance** — LCP < 2.5s, CLS < 0.1, FID < 100ms
- **Performance is a feature** — speed affects SEO, UX, and LLM crawlability

These constraints are not optional. Implementation must satisfy them.

---

## Status
This document defines foundational architecture.

Future documents will specify:
- URL & routing strategy
- Wiki content types and page anatomy
- Internal linking rules
- Publishing and indexing rules
- Schema and metadata strategy

End of document.

