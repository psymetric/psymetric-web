# DB-ARCHITECTURE-PLAN.md

## Purpose

This document defines the **canonical database architecture** for PsyMetric.

It is intended for humans and LLMs (Claude, ChatGPT) to:
- generate schema (Prisma or equivalent)
- build APIs and dashboards
- reason about system state without hallucination
- preserve traceability and future extensibility

This document is the authoritative DB plan for implementation.

**Version:** 1.2  
**Changelog:** Renamed SocialPost → DistributionEvent for semantic clarity. Added ENTITY_VALIDATION_FAILED event type.

---

## Core Principles

1. **DB is the spine**
   - If it is not in the DB, it is not real.
   - Website, GitHub, and social platforms are projections.

2. **Stable identity**
   - Every entity has a UUID primary key.
   - IDs never change.
   - Slugs/titles are not identity.

3. **Relationships are first-class**
   - Stored in an explicit edge table.
   - Controlled vocabulary prevents drift.

4. **Metrics are append-only facts**
   - Time-stamped snapshots.
   - Never overwritten.

5. **Events are append-only**
   - Every meaningful action is logged.
   - Controlled vocabulary for event types.

6. **Content bodies live in Git-tracked MDX**
   - DB stores `contentRef` pointers.
   - Git provides version history.

---

## Global Conventions

- Primary keys: UUID (v7 preferred, v4 acceptable)
- Time: UTC timestamps
- Deletions: forbidden (use `status=archived` + `archivedAt`)
- Missing data: valid and expected

---

## Controlled Vocabularies

To prevent naming drift, these fields use controlled vocabularies:

- `EntityRelation.relationType` → controlled enum (RelationType)
- `EventLog.eventType` → controlled enum (EventType)
- `MetricSnapshot.metricType` → flexible string, validated against canonical list (see `08-METRIC-TYPE-VOCABULARY.md`)

---

## Canonical Content Entities

All content entities include:
- `contentRef` (pointer to Git-tracked MDX file path)
- `publishedAt` / `archivedAt` timestamps
- `status` (`draft | publish_requested | published | archived`)

### Guide

```
Guide
- id (UUID, PK)
- title (string)
- slug (string, unique)
- summary (text)
- difficulty (enum: beginner | intermediate | advanced)
- estimatedTimeMinutes (int, nullable)
- status (enum: draft | publish_requested | published | archived)
- canonicalUrl (string, nullable)
- contentRef (string, nullable)
- publishedAt (timestamp, nullable)
- archivedAt (timestamp, nullable)
- createdAt (timestamp)
- updatedAt (timestamp)
```

### Concept

```
Concept
- id (UUID, PK)
- title (string)
- slug (string, unique)
- summary (text)
- conceptKind (enum: standard | model | comparison, default: standard)
- difficulty (enum: beginner | intermediate | advanced)
- status (enum: draft | publish_requested | published | archived)
- canonicalUrl (string, nullable)
- contentRef (string, nullable)
- comparisonTargets (UUID[], nullable)  // only for conceptKind=comparison
- publishedAt (timestamp, nullable)
- archivedAt (timestamp, nullable)
- createdAt (timestamp)
- updatedAt (timestamp)
```

**Note:** Model pages and Comparison pages are Concept subtypes:
- `conceptKind=model` → renders at `/models/{slug}`
- `conceptKind=comparison` → renders at `/comparisons/{slug}`
- `comparisonTargets` stores ordered array of compared entity IDs (for comparisons only)

### Project

```
Project
- id (UUID, PK)
- title (string)
- slug (string, unique)
- summary (text)
- status (enum: draft | publish_requested | published | archived)
- repoUrl (string)
- repoDefaultBranch (string, nullable)
- license (string, nullable)
- canonicalUrl (string, nullable)
- contentRef (string, nullable)
- publishedAt (timestamp, nullable)
- archivedAt (timestamp, nullable)
- createdAt (timestamp)
- updatedAt (timestamp)
```

### NewsItem

```
NewsItem
- id (UUID, PK)
- title (string)
- slug (string, unique)
- summary (text)
- status (enum: draft | publish_requested | published | archived)
- canonicalUrl (string, nullable)
- contentRef (string, nullable)
- publishedAt (timestamp, nullable)
- archivedAt (timestamp, nullable)
- createdAt (timestamp)
- updatedAt (timestamp)
```

---

## Source & Capture Entities

### SourceItem

Represents captured external material (RSS, webpages, comments, replies, videos).

```
SourceItem
- id (UUID, PK)
- sourceType (enum: rss | webpage | comment | reply | video | other)
- platform (enum: website | x | youtube | github | other)
- url (string)
- capturedAt (timestamp)
- capturedBy (enum: human | llm | system)
- contentHash (string)
- snapshotRef (string, nullable)
- snapshotMime (string, nullable)
- snapshotBytes (int, nullable)
- notes (text, nullable)
- status (enum: ingested | triaged | used | archived)
- archivedAt (timestamp, nullable)
- sourceFeedId (UUID, nullable)
- createdAt (timestamp)
- updatedAt (timestamp)
```

### SourceFeed

Represents an RSS feed definition.

```
SourceFeed
- id (UUID, PK)
- name (string)
- feedUrl (string, unique)
- platform (enum: website | x | youtube | github | other)
- platformLabel (string, nullable)
- isActive (boolean)
- createdAt (timestamp)
- updatedAt (timestamp)
```

---

## Distribution Entities

Distribution artifacts reference canonical content using **type + id** (polymorphic pattern).

**IMPORTANT:** DistributionEvents track **manual distribution only**. The system does NOT auto-post to any external platform. No credentials or API tokens for external platforms are stored. No endpoints exist that post content externally.

### DistributionEvent

Tracks when an operator manually posted content to an external platform.

```
DistributionEvent
- id (UUID, PK)
- platform (enum: x | linkedin | other)
- externalUrl (string, nullable)  // URL of actual post, filled after manual posting
- contentText (text)              // Draft copy for the post
- status (enum: draft | planned | published | archived)
- postedAt (timestamp, nullable)  // When the operator manually posted
- archivedAt (timestamp, nullable)
- primaryEntityType (enum: guide | concept | project | news)
- primaryEntityId (UUID)
- createdAt (timestamp)
- updatedAt (timestamp)
```

Status meanings:
- `draft` — copy being prepared
- `planned` — operator intends to post manually (not automation)
- `published` — operator confirmed manual post occurred
- `archived` — no longer relevant

### Video

```
Video
- id (UUID, PK)
- platform (enum: youtube | other)
- externalUrl (string)
- status (enum: draft | published | archived)
- publishedAt (timestamp)
- archivedAt (timestamp, nullable)
- primaryEntityType (enum: guide | concept | project | news)
- primaryEntityId (UUID)
- createdAt (timestamp)
- updatedAt (timestamp)
```

Distribution artifacts remain as public history even if referenced content is later archived.

---

## Metrics & Events

### MetricSnapshot

```
MetricSnapshot
- id (UUID, PK)
- targetEntityType (enum: guide | concept | project | news | distributionEvent | video | sourceItem | sourceFeed)
- targetEntityId (UUID)
- platform (enum: website | x | youtube | github | other)
- metricType (string)
- value (int)
- capturedAt (timestamp)
- source (enum: api | manual | analytics | scrape)
- confidence (enum: high | medium | low, nullable)
- notes (text, nullable)
```

Rules:
- Append-only
- Never overwritten
- Missing snapshots are acceptable
- `metricType` validated against canonical list in app layer (see `08-METRIC-TYPE-VOCABULARY.md`)

### EventLog

```
EventLog
- id (UUID, PK)
- eventType (enum: see Appendix A)
- entityType (enum: guide | concept | project | news | distributionEvent | video | sourceItem | sourceFeed)
- entityId (UUID)
- actor (enum: human | llm | system)
- details (jsonb)
- timestamp (timestamp)
```

Rules:
- Append-only
- Used for traceability and audits

---

## Relationship Graph

### EntityRelation

```
EntityRelation
- id (UUID, PK)
- fromEntityType (enum: guide | concept | project | news | distributionEvent | video | sourceItem | sourceFeed)
- fromEntityId (UUID)
- toEntityType (enum: guide | concept | project | news | distributionEvent | video | sourceItem | sourceFeed)
- toEntityId (UUID)
- relationType (enum: see Appendix A)
- notes (text, nullable)
- createdAt (timestamp)
```

Rules:
- Unique constraint on (fromEntityType, fromEntityId, relationType, toEntityType, toEntityId)
- Enables future GraphRAG reasoning

---

## SystemConfig (Change Control)

A lightweight table for system settings and change control.

```
SystemConfig
- id (UUID, PK)
- key (string, unique)
- value (jsonb)
- updatedBy (enum: human | llm | system)
- updatedAt (timestamp)
```

Use cases:
- Active platforms
- Schema version tracking
- Ingestion toggles
- Feature flags

---

## App-Layer Validation Requirements

Some constraints are enforced in the application layer:

1. **Polymorphic target validation**
   - DistributionEvent/Video `primaryEntityType` restricted to: guide, concept, project, news
   - MetricSnapshot `targetEntityType` validated based on platform + metricType

2. **Publish gating**
   - Only humans can set `status=published`
   - Publishing sets `publishedAt` and logs `ENTITY_PUBLISHED`

3. **Archiving behavior**
   - Setting `status=archived` sets `archivedAt` and logs `ENTITY_ARCHIVED`

4. **Relationship existence**
   - EntityRelation endpoints validate both referenced entities exist

5. **MetricType canonical list**
   - App validates metricType against maintained list (see `08-METRIC-TYPE-VOCABULARY.md`)

6. **Distribution is manual only**
   - No API endpoints that post to external platforms
   - No credential storage for X, LinkedIn, etc.

---

## Enforcement Rules (For LLMs)

LLMs must:
- Treat IDs as canonical identity
- Use EntityRelation for all relationships
- Treat MetricSnapshot and EventLog as append-only
- Never infer state without DB records
- Never invent entities or metrics

---

## Appendix A: Controlled Enum Values

### RelationType (EntityRelation.relationType)

```
GUIDE_USES_CONCEPT
GUIDE_EXPLAINS_CONCEPT
GUIDE_REFERENCES_SOURCE

CONCEPT_RELATES_TO_CONCEPT

NEWS_DERIVED_FROM_SOURCE
NEWS_REFERENCES_SOURCE
NEWS_REFERENCES_CONCEPT

PROJECT_IMPLEMENTS_CONCEPT
PROJECT_REFERENCES_SOURCE
PROJECT_HAS_GUIDE

DISTRIBUTION_PROMOTES_GUIDE
DISTRIBUTION_PROMOTES_CONCEPT
DISTRIBUTION_PROMOTES_PROJECT
DISTRIBUTION_PROMOTES_NEWS

VIDEO_EXPLAINS_GUIDE
VIDEO_EXPLAINS_CONCEPT
VIDEO_EXPLAINS_PROJECT
VIDEO_EXPLAINS_NEWS
```

### EventType (EventLog.eventType)

```
ENTITY_CREATED
ENTITY_UPDATED
ENTITY_PUBLISH_REQUESTED
ENTITY_PUBLISH_REJECTED
ENTITY_PUBLISHED
ENTITY_ARCHIVED
ENTITY_VALIDATION_FAILED

SOURCE_CAPTURED
SOURCE_TRIAGED

RELATION_CREATED
RELATION_REMOVED

DISTRIBUTION_CREATED
DISTRIBUTION_PLANNED
DISTRIBUTION_PUBLISHED

VIDEO_CREATED
VIDEO_PUBLISHED

METRIC_SNAPSHOT_RECORDED

SYSTEM_CONFIG_CHANGED
```

---

## End of Document
