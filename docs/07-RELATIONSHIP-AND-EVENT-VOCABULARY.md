# 07 — RELATIONSHIP & EVENT VOCABULARY

**Filename:** `07-RELATIONSHIP-AND-EVENT-VOCABULARY.md`  
**Version:** 1.2  
**Changelog:** Renamed SOCIAL_POST_* → DISTRIBUTION_*. Added ENTITY_VALIDATION_FAILED.

## Purpose

This document defines the **canonical vocabularies** used for:

- `EntityRelation.relationType`
- `EventLog.eventType`

These vocabularies exist to:
- prevent naming drift
- keep the relationship graph coherent
- ensure LLMs and humans speak the same language
- make historical analysis reliable

The database enforces these vocabularies via enums.  
The application layer must validate against them at all times.

---

## Global Rules

- Use **UPPER_SNAKE_CASE**
- Names describe **facts**, not intent or outcomes
- Relationship types describe **structural semantics**
- Event types describe **state changes or actions**
- Do not overload meanings
- Add new values sparingly

Any change to these vocabularies requires:
1. Updating this document
2. Updating the Prisma schema (if enum-based)
3. Recording a `SYSTEM_CONFIG_CHANGED` event

---

## RelationType (EntityRelation.relationType)

Relationship types describe **how two entities are connected**.

They are directional:
- `fromEntity` → `toEntity`
- Direction matters and must be respected

### Guide Relationships
- `GUIDE_USES_CONCEPT`
- `GUIDE_EXPLAINS_CONCEPT`
- `GUIDE_REFERENCES_SOURCE`

### Project Relationships
- `PROJECT_IMPLEMENTS_CONCEPT`
- `PROJECT_REFERENCES_SOURCE`
- `PROJECT_HAS_GUIDE`

### Concept Relationships
- `CONCEPT_RELATES_TO_CONCEPT`

### News Relationships
- `NEWS_DERIVED_FROM_SOURCE`
- `NEWS_REFERENCES_SOURCE`
- `NEWS_REFERENCES_CONCEPT`

### Distribution Relationships
- `DISTRIBUTION_PROMOTES_GUIDE`
- `DISTRIBUTION_PROMOTES_CONCEPT`
- `DISTRIBUTION_PROMOTES_PROJECT`
- `DISTRIBUTION_PROMOTES_NEWS`

### Video Relationships
- `VIDEO_EXPLAINS_GUIDE`
- `VIDEO_EXPLAINS_CONCEPT`
- `VIDEO_EXPLAINS_PROJECT`
- `VIDEO_EXPLAINS_NEWS`

### General Rules for RelationType
- Do not invent synonyms (`USES` vs `REFERENCES`)
- Prefer specificity over generality
- If a relationship does not fit, propose a new canonical type
- Never reuse an existing type with altered semantics

---

## EventType (EventLog.eventType)

Event types describe **actions or state transitions** that occur in the system.

They are immutable historical records.

### Entity Lifecycle Events
- `ENTITY_CREATED`
- `ENTITY_UPDATED`
- `ENTITY_PUBLISH_REQUESTED`
- `ENTITY_PUBLISH_REJECTED`
- `ENTITY_PUBLISHED`
- `ENTITY_ARCHIVED`
- `ENTITY_VALIDATION_FAILED`

### Source & Capture Events
- `SOURCE_CAPTURED`
- `SOURCE_TRIAGED`

### Relationship Events
- `RELATION_CREATED`
- `RELATION_REMOVED`

### Distribution Events
- `DISTRIBUTION_CREATED`
- `DISTRIBUTION_PLANNED`
- `DISTRIBUTION_PUBLISHED`

Note: DistributionEvents track **manual distribution only**. The system does NOT auto-post.

### Video Events
- `VIDEO_CREATED`
- `VIDEO_PUBLISHED`

### Metrics & System Events
- `METRIC_SNAPSHOT_RECORDED`
- `SYSTEM_CONFIG_CHANGED`

### Rules for EventType
- Events describe **what happened**, not why
- Events are append-only and never edited
- Events must always reference:
  - `entityType`
  - `entityId`
  - `actor`

---

## Validation & Enforcement

- The DB enforces enums where possible
- The application layer must:
  - reject unknown relationType values
  - reject unknown eventType values
  - prevent misuse of valid values

LLMs:
- may propose relationships or events
- must use canonical names
- must not invent new values

Humans:
- approve or reject changes
- may extend vocabularies deliberately

---

## Change Control

To add a new RelationType or EventType:

1. Propose the change with rationale
2. Update this document
3. Update Prisma enum definitions
4. Log `SYSTEM_CONFIG_CHANGED`
5. Deploy schema/app updates together

No silent additions.

---

## End of Document
