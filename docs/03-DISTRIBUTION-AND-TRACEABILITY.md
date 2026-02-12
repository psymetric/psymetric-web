# 03 — Distribution & Traceability

## Purpose

This document defines how PsyMetric distributes content across external platforms (social media, GitHub, video) without losing coherence, memory, or accountability.

Distribution is treated as a first-class, traceable activity, not an afterthought.

The goal is that at any point—human or LLM—you can answer:

- What was published?
- Where was it distributed?
- What canonical content did it reference?
- What happened after it was distributed?

---

## Core Principle

**Distribution does not create content.**  
**It references canonical content.**

Distribution events, videos, and announcements never exist in isolation.  
They are distribution artifacts tied back to Guides, Concepts, Projects, or News.

**IMPORTANT:** DistributionEvents track **manual distribution only**. The system does NOT auto-post to any external platform. Operators manually post content, then record the event here for traceability.

---

## Distribution Entities

### DistributionEvent

A DistributionEvent represents a record of content being manually posted to an external platform.

Examples:
- X / Twitter post
- LinkedIn post
- Short-form announcement

**Required DB Fields (DistributionEvent)**

- id (UUID)
- platform (x | linkedin | other)
- externalUrl (nullable until manually posted)
- status (draft | planned | published | archived)
- postedAt (timestamp, nullable until manually posted)
- contentText (the post copy)
- primaryEntityType (guide | concept | project | news)
- primaryEntityId (UUID)
- createdAt, updatedAt

**Status meanings:**
- `draft` — copy being prepared
- `planned` — operator intends to post manually (NOT automation)
- `published` — operator confirmed manual post occurred
- `archived` — no longer relevant

**Rule:** Every DistributionEvent must reference exactly one primary entity via `primaryEntityType` + `primaryEntityId`.

---

### Video (Optional / Later)

A Video entity represents long-form or short-form video content (e.g., YouTube).

Videos follow the same traceability rules as DistributionEvents.

**Required DB Fields (Video)**

- id (UUID)
- platform (youtube | other)
- externalUrl
- status
- publishedAt
- primaryEntityType (guide | concept | project | news)
- primaryEntityId (UUID)
- createdAt, updatedAt

---

## GitHub Integration (Projects)

GitHub repositories are treated as canonical code artifacts, not just links.

**Rules:**
- Every Project must link to exactly one primary GitHub repo.
- GitHub repos do not create Projects automatically.
- Projects define intent; repos supply implementation.

**Tracked GitHub Metadata (DB):**
- repoUrl
- repoDefaultBranch
- license (if available)

**GitHub Metrics (via MetricSnapshot):**
- stars
- forks
- watchers
- issues (open/closed counts)

Metrics are always time-stamped snapshots.

---

## Traceability Rules (Non-Negotiable)

### Rule 1: Canonical Reference

Every distribution artifact (DistributionEvent, Video) must reference:
- a Guide, OR
- a Project, OR
- a Concept, OR
- a NewsItem

No orphaned posts.

### Rule 2: One-to-Many Allowed

One canonical entity may have:
- many DistributionEvents
- many Videos
- many MetricSnapshots

But the reverse is not allowed:
- distribution artifacts must have one canonical anchor.

### Rule 3: Event Logging

Distribution actions must be logged in the EventLog.

Examples:
- `DISTRIBUTION_CREATED`
- `DISTRIBUTION_PLANNED`
- `DISTRIBUTION_PUBLISHED`
- `VIDEO_PUBLISHED`

Event logs are append-only.

---

## Metrics Collection

Metrics are captured as facts, not judgments.

**MetricSnapshot Rules:**
- Metrics are stored per platform
- Metrics are tied to a specific entity (DistributionEvent, Video, Project)
- Metrics are never overwritten—only appended

**Example MetricSnapshot:**
```
targetEntityType: distributionEvent
targetEntityId: <DistributionEvent ID>
metricType: views
value: 12,403
capturedAt: 2026-02-04T12:00Z
source: manual
```

---

## Distribution Workflow (Typical)

1. Canonical content exists (Guide / Project / Concept / News)
2. DistributionEvent draft is created referencing that entity
3. DistributionEvent is reviewed (human or LLM-assisted)
4. Status set to `planned` when ready for manual posting
5. **Operator manually posts to external platform**
6. Operator updates status to `published`, fills in `externalUrl` and `postedAt`
7. EventLog records the publish action
8. Metrics are periodically captured (manually or via API)
9. Metrics inform future planning (not automatic decisions)

---

## Relationship Examples

- DistributionEvent → DISTRIBUTION_PROMOTES_GUIDE → Guide
- DistributionEvent → DISTRIBUTION_PROMOTES_PROJECT → Project
- Video → VIDEO_EXPLAINS_CONCEPT → Concept
- Project → PROJECT_HAS_GUIDE → Guide

All relationships are explicit DB edges.

---

## What Distribution Is Not Allowed To Do

Distribution must not:
- auto-post to any external platform
- store credentials for external platforms
- redefine canonical content
- introduce new claims not present in the canonical entity
- imply evaluation, benchmarking, or superiority
- exist without DB traceability

---

## Why This Matters

This structure allows:
- clear attribution
- historical reconstruction
- AI-assisted analysis without hallucination
- future reasoning about what worked and why

It ensures PsyMetric behaves like a system, not a collection of disconnected posts.

---

## Interaction With LLMs

LLMs may:
- draft DistributionEvent copy
- suggest distribution timing
- summarize metrics

LLMs must:
- reference canonical entity IDs
- confirm DB state before asserting publication
- log proposed actions for human review

LLMs may not:
- assume distribution occurred without EventLog evidence
- post content to external platforms

---

## Change Control

Any change to:
- distribution rules
- required fields
- traceability guarantees

must be documented via a Meta record and reflected here.

---

## End of document
