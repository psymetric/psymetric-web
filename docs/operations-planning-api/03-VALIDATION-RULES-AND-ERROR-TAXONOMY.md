# Validation Rules & Error Taxonomy (v1)

## Purpose
This document defines **what validation means**, **when it runs**, and **how failures are categorized** in PsyMetric.

It exists to:
- make publishing predictable
- prevent silent failures
- give humans clear, actionable feedback
- allow LLMs to assist without guessing

Validation is a **gate**, not a punishment.

---

## Core Principles

1. Validation blocks publishing, not drafting.
2. Validation never mutates publish state.
3. Validation results are deterministic.
4. Failures must be explainable to a human.
5. Passing validation does not imply quality — only readiness.

---

## When Validation Runs

Validation may be triggered:
- manually by the operator
- automatically on publish request
- automatically after significant entity updates

Validation **must** run before:
- `publish_requested`
- `published`

---

## Validation Categories

Validation is divided into **explicit categories**. Each category may pass or fail independently.

### 1) Anatomy Validation

Ensures required structural elements exist.

**Guide requirements:**
- Title present
- Summary present
- At least one step/section in content

**Concept requirements:**
- Title present
- Summary present
- Definition section in content

**Project requirements:**
- Title present
- Summary present
- `repoUrl` present and valid URL format

**News requirements:**
- Title present
- Summary present

Failure indicates missing required sections.

---

### 2) Relationship Validation

Ensures required relationships are present.

**Guide requirements:**
- Must reference ≥1 Concept (via `GUIDE_USES_CONCEPT` or `GUIDE_EXPLAINS_CONCEPT`)

**Concept requirements (standard):**
- No mandatory relationships

**Concept requirements (comparison):**
- `comparisonTargets` array must contain ≥2 valid Concept IDs
- All referenced Concepts must exist in the database

**Concept requirements (model):**
- No mandatory relationships (recommended: link to related Concepts)

**Project requirements:**
- Must reference ≥1 Concept (via `PROJECT_IMPLEMENTS_CONCEPT`) OR
- Must reference ≥1 Guide (via `PROJECT_HAS_GUIDE`)

**News requirements:**
- Should reference ≥1 Concept (warning, not blocking)

Failure indicates orphaned or incomplete entities.

---

### 3) Citation Validation

Ensures factual claims have sources where required.

**Rules by entity type:**

| Entity Type | Citation Requirement |
|-------------|---------------------|
| Concept (standard) | Optional — conceptual explanations may be uncited |
| Concept (model) | Required — factual specs must have sources |
| Concept (comparison) | Required — comparative claims must be sourced |
| Guide | Optional — procedural content may be uncited |
| Project | Optional — implementation details may be uncited |
| News | Required — claims must reference SourceItems |

Failure indicates missing or invalid citations.

---

### 4) Metadata Validation

Ensures SEO and indexing readiness.

**Checks:**
- `title` present and non-empty
- `summary` present (used as meta description)
- `slug` present and valid format (lowercase, hyphens, no spaces)
- `slug` unique within entity type

Failure indicates indexing risk.

---

### 5) Content Validation

Ensures content reference integrity.

**Checks:**
- If `contentRef` is set:
  - Path format is valid (e.g., `content/guides/my-guide.mdx`)
  - File extension is `.mdx` or `.md`
- If entity is being published:
  - `contentRef` should be present (warning if missing)

**Note:** File existence is checked at build time, not validation time. Validation only checks path format.

Failure indicates content reference issues.

---

## Validation Results

Validation returns:
- overall status: `pass` | `fail`
- per-category status
- list of error objects

**Example response:**
```json
{
  "status": "fail",
  "categories": {
    "anatomy": "pass",
    "relationships": "fail",
    "citations": "pass",
    "metadata": "pass",
    "content": "pass"
  },
  "errors": [
    {
      "code": "RELATIONSHIP_MISSING",
      "category": "relationships",
      "level": "BLOCKING",
      "message": "Guide must reference at least one Concept"
    }
  ]
}
```

---

## Error Taxonomy

Errors are categorized to support UI display and analytics.

### Error Levels

- **BLOCKING** — prevents publish
- **WARNING** — informational only, does not prevent publish

Only BLOCKING errors stop publish.

---

### Canonical Error Codes (v1)

**Anatomy errors:**
- `ANATOMY_TITLE_MISSING`
- `ANATOMY_SUMMARY_MISSING`
- `ANATOMY_SECTION_MISSING`
- `ANATOMY_REPO_URL_MISSING`
- `ANATOMY_REPO_URL_INVALID`

**Relationship errors:**
- `RELATIONSHIP_MISSING` — required relationship not present
- `RELATIONSHIP_INVALID` — relationship target does not exist
- `COMPARISON_TARGETS_INSUFFICIENT` — comparison needs ≥2 targets
- `COMPARISON_TARGET_NOT_FOUND` — referenced comparison target does not exist

**Citation errors:**
- `CITATION_MISSING` — required citation not present
- `CITATION_SOURCE_NOT_FOUND` — referenced SourceItem does not exist

**Metadata errors:**
- `METADATA_TITLE_MISSING`
- `METADATA_SUMMARY_MISSING`
- `METADATA_SLUG_MISSING`
- `METADATA_SLUG_INVALID` — invalid format
- `METADATA_SLUG_DUPLICATE` — slug already exists

**Content errors:**
- `CONTENT_REF_INVALID` — invalid path format
- `CONTENT_REF_MISSING` — no content reference (warning for publish)

Error codes are stable identifiers. Do not change without versioning.

---

## Event Logging

**On validation failure:**
- Log `ENTITY_VALIDATION_FAILED` event
- Include category and error codes in `details`

```json
{
  "eventType": "ENTITY_VALIDATION_FAILED",
  "entityType": "guide",
  "entityId": "...",
  "actor": "system",
  "details": {
    "categories": { "relationships": "fail" },
    "errors": ["RELATIONSHIP_MISSING"]
  }
}
```

**On validation success:**
- No event required in v1

---

## LLM Interaction Rules

LLMs may:
- explain validation failures in plain language
- suggest fixes based on error codes
- help draft missing content sections

LLMs may NOT:
- bypass validation
- auto-apply fixes without human review
- re-run validation without human request

---

## Invariants (Non-Negotiable)

- Validation blocks publish, not draft
- Errors are human-readable
- Error codes are stable
- Validation rules are explicit
- Comparison validation uses `comparisonTargets` field, not relationships

---

## Status
This document defines validation rules and error taxonomy for v1.

End of document.
