# 01 — DB As Spine

## Purpose

This document defines the database as PsyMetric's canonical source of truth and specifies what must be stored, how it is referenced, and how the rest of the system (website, social platforms, GitHub, LLMs) depends on it.

---

## Core Principle

**If it isn't in the DB, it isn't real** (for PsyMetric).

The DB is authoritative for:
- what exists
- what status it is in
- what relates to what
- what was published where
- what happened over time (events + metrics)

Public surfaces render or reference DB state. They do not define it.

---

## Canonical Entities

PsyMetric tracks a small set of first-class entities. These are the "nodes" of the system.

### Content Entities
- **Guide:** tutorials, walkthroughs, applied learning
- **Concept:** definitions and mental models that guides/projects reference
- **Project:** a build/repo-backed artifact (reference implementation, demo)
- **NewsItem:** curated signals and updates (lightweight, human)

### Distribution Entities
- **DistributionEvent:** record of manual posts on X/LinkedIn/etc that reference PsyMetric content or projects
- **Video** (optional early): YouTube content tied to Guides/Projects/Concepts

**Note:** DistributionEvents track manual distribution only. The system does NOT auto-post.

### Source Entities
- **SourceItem:** an ingested external item (RSS entry, captured webpage/thread, etc.)
- **SourceFeed:** an RSS feed definition (or "source channel")

### Measurement Entities
- **MetricSnapshot:** time-based measurement facts (views, likes, stars, clicks) tied to a target

### Workflow Entities
- **EventLog:** append-only log of important actions and state transitions

---

## Required Global Fields (All Entities)

Every entity must include:
- `id` (UUID) — stable, never reused, never changes
- `createdAt`
- `updatedAt`
- `status` (at minimum: draft | publish_requested | published | archived)
- `title` (where applicable)
- `slug` (where applicable; slugs can change, IDs must not)

**Rule:** The system treats `id` as canonical identity, not slug.

---

## Relationships Are First-Class

Relationships are stored explicitly, not inferred.

Examples:
- Guide uses Concept
- Guide explains Concept
- Project implements Concept
- DistributionEvent promotes Guide
- DistributionEvent promotes Project
- Guide references SourceItem
- NewsItem derived from SourceItem

Store relationships as rows (edges), not as scattered text.

**Minimum fields for a relationship:**
- `id` (UUID)
- `fromEntityId`
- `toEntityId`
- `relationType`
- `createdAt`
- optional: `notes` (why this relationship exists)

---

## DB vs Object Storage: Storage Tiers

### What goes in the DB (always, lightweight)

Store in DB:
- metadata
- relationships
- statuses
- timestamps
- hashes
- pointers to heavy content

### What goes in object storage (heavy)

Store in object storage:
- full HTML/text snapshots of source content
- long-form raw captures
- large derived artifacts (exports, images, etc.) if needed later

DB stores:
- `snapshotRef` (object storage key / URL)
- `snapshotMime`
- `snapshotBytes`
- `contentHash` (hash of stored snapshot)

---

## RSS Ingestion Policy (DB + Object Storage)

### Always stored in DB for each RSS item
- url
- title
- publishedAt (if available)
- feedId
- ingestedAt
- status (ingested | triaged | used | ignored)
- contentHash (from snapshot or fetched body)
- snapshotRef (nullable)

### Full content snapshot stored in object storage when:
- triaged as keep or watch
- referenced/cited in a Guide/Project/Concept/NewsItem
- source is likely to disappear

### Retention defaults (can change later)
- ignored items: no snapshot (or delete within 7–30 days)
- keep/watch: retain snapshot 90–180 days
- used/cited: retain snapshot long-term

---

## Metrics as Facts (Not Conclusions)

All metrics are stored as time-based snapshots, not mutable counters.

**Example snapshots:**
- YouTube views at time T
- X post likes at time T
- GitHub stars at time T

**Minimum fields:**
- `id` (UUID)
- `targetEntityId` (e.g., DistributionEvent or Video or Project)
- `metricType` (views, likes, shares, stars, forks, clicks, etc.)
- `value` (number)
- `capturedAt` (timestamp)
- optional: `source` (platform API, manual, scrape)

**Rule:** "Viral" is not stored as a DB fact. It can be inferred by analysis later.

---

## Event Log (Traceability Backbone)

Important actions must be logged as append-only events:
- publish actions
- edits to published content
- relationship changes
- distribution actions
- key workflow state transitions

**Minimum fields:**
- `id` (UUID)
- `eventType`
- `entityId` (what it affected)
- `timestamp`
- `actor` (human, system, LLM)
- `details` (small JSON payload)

---

## LLM Interaction Rules (DB Truth)

LLMs may:
- read DB state
- generate drafts based on DB-linked content
- propose actions referencing entity IDs

LLMs must not:
- assert that something was published unless a DB record proves it
- create "facts" without writing a logged event and/or snapshot reference

When an LLM makes a claim about state, it should be able to point to:
- entity IDs
- event log entries
- metric snapshots
- source item references

---

## Future Readiness: Graph Intelligence (Non-Blocking)

This system is designed to support future graph-based reasoning (GraphRAG-like capabilities) by ensuring:
- stable IDs
- explicit relationship edges
- provenance via source links + hashes
- time-stamped metrics facts
- raw snapshots available for re-processing

No graph engine or vector store is required now.

---

## End of document
