# Citation & Source Usage

## Purpose
This document defines **how citations and sources are used** across the Wiki and Main Site surfaces.

It exists to:
- signal epistemic discipline
- support LLM citation and trust
- prevent over-citation and under-citation
- keep content factual without slowing creation

This is a **lightweight ruleset**, not an academic standard.

---

## Core Principle

**Citations support claims, not credibility theater.**

- Cite when a claim depends on external facts.
- Do not cite purely conceptual explanations.
- Separate explanation from evidence clearly.

If a citation does not clarify what would be false without it, it does not belong.

---

## What Must Be Cited (Non-Negotiable)

Citations are required for:

- Factual claims about specific models or systems
- Capabilities, limits, or configurations that can change over time
- Dates, versions, or release-related information
- Quotations or paraphrased claims from external sources
- Benchmarks or reported measurements (when included)

If a claim could reasonably be disputed or outdated, it must be cited.

---

## What Does NOT Require Citation

Citations are not required for:

- Conceptual definitions
- Explanations of mechanisms or mental models
- Logical reasoning explicitly explained on the page
- Illustrative examples clearly labeled as such

Over-citing these weakens clarity and signals uncertainty where none exists.

---

## Page-Type Citation Rules

### Concept Pages

- Citations optional
- Use citations only for:
  - historical origin claims
  - non-obvious factual assertions

Conceptual explanations stand on their own.

---

### Model Pages

- Citations required for:
  - capabilities
  - limitations
  - supported features
  - context lengths or constraints

Model pages are **time-scoped reference entries**.

---

### Comparison Pages

- Citations required for factual differences
- Tradeoff reasoning may be uncited if logically explained

---

### Guide Pages

- Citations optional
- Required only when referencing external behavior, APIs, or tools

Guides prioritize instruction over sourcing density.

---

### Project Pages

- Citations optional
- Repository links serve as primary reference

---

## Source Quality Hierarchy

Preferred sources, in order:

1. Primary technical sources
   - official documentation
   - release notes
   - model cards
   - original papers

2. Direct artifacts
   - GitHub repositories
   - captured snapshots

3. Secondary technical sources
   - only when primary sources are unavailable

Media commentary, opinion pieces, and personality-focused sources are discouraged.

---

## Source Presentation

- Sources are listed in a **Sources / References** section
- Inline reference markers may be used for clarity
- Links must resolve to stable URLs or stored snapshots

Sources support transparency, not exhaustiveness.

---

## Temporal Language

When citing time-sensitive facts:

- Use qualifying language ("as of", "at the time of writing")
- Prefer dates over relative phrasing
- Update content without changing canonical URLs

---

## DB Integration

- All cited sources correspond to SourceItem records
- SourceItems store:
  - URL or snapshot reference
  - capture date
  - notes if relevant

The DB remains the provenance backbone.

---

## Anti-Patterns (Explicitly Forbidden)

- Citation dumping
- Citing obvious definitions
- Using citations to imply endorsement or authority
- Relying on a single weak source for critical claims

---

## Invariants

- Citations clarify claims
- Conceptual explanations remain uncluttered
- Time-sensitive facts are qualified

If citation behavior conflicts with this document, this document wins unless explicitly amended.

---

## Status
This document defines canonical citation and source usage behavior.

Remaining planning document:
- SEO and research hooks

End of document.