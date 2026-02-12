# Source Capture & Inbox

## Purpose
This document defines **how external material enters the PsyMetric system** before becoming content.

It exists to:
- keep provenance explicit
- prevent idea and link sprawl
- support LLM-assisted drafting without drift
- reduce cognitive load for the operator

This document describes *capture and triage*, not publishing.

---

## Core Principle

**Nothing becomes content without first becoming a SourceItem.**

All external material—videos, articles, threads, repos, notes—enters the system through a controlled capture step.

Source capture creates traceability and preserves intent.

---

## What Counts as a Source

A Source is any external or semi-external artifact that may inform content.

Examples:
- A YouTube video you created
- An article or blog post
- A research paper
- A GitHub repository
- A long social media thread
- A personal note or rough idea with a URL

Sources do not need to be high quality to be captured. They need to be *remembered*.

---

## SourceItem (Conceptual Model)

A SourceItem represents a captured source in the database.

Minimum required fields:
- `sourceType` (video, article, repo, thread, note, other)
- `url` (optional for notes)
- `title`
- `description` or operator notes
- `status`
- `capturedAt`

Optional fields:
- platform (youtube, website, github, etc.)
- snapshot reference
- tags or rough topics

SourceItems are internal-only and never published directly.

---

## Source Lifecycle States

SourceItems move through a simple lifecycle:

- `ingested` – captured, not yet reviewed
- `triaged` – reviewed and kept for potential use
- `used` – referenced by at least one entity
- `archived` – intentionally not used

State changes are logged as events.

---

## Capture Methods

### Manual Capture (Primary)

Via the Admin Dashboard:
- paste a URL
- optionally auto-fetch title/metadata
- add brief human context ("why this matters")
- save as `ingested`

This is the default and preferred method.

---

### Assisted Capture (Optional)

Future automation may:
- extract metadata from URLs
- create snapshots
- suggest candidate Concepts or News items

Automation must not skip human intent capture.

---

## Inbox / Triage Queue

The Inbox is a filtered view of SourceItems with status `ingested` or `triaged`.

Primary operator actions:
- keep (move to `triaged`)
- ignore (move to `archived`)
- promote (create draft entity)
- attach to existing entity

The Inbox is for decision-making, not writing.

---

## Promotion Rules

Promoting a SourceItem means using it to create or enrich content.

Allowed promotion actions:
- Create Concept draft inspired by source
- Create Guide draft
- Create News draft
- Attach source to existing entity

Promotion always preserves a link to the SourceItem.

---

## Relationship to Content Entities

- SourceItems may be attached to one or more entities
- Entities may reference multiple SourceItems
- Referencing a SourceItem updates its status to `used`

Sources support content; they do not define it.

---

## LLM Involvement

LLMs may:
- summarize SourceItems
- suggest candidate entities
- draft content *based on* SourceItems

LLMs may not:
- invent sources
- promote sources without operator intent
- change SourceItem status to published

---

## Anti-Patterns (Explicitly Forbidden)

- Creating content directly from memory without capture
- Letting links live only in prose or chat logs
- Treating SourceItems as publishable content
- Bulk auto-ingestion without review

---

## Invariants

- All content traces back to at least one SourceItem
- Source capture precedes drafting
- Inbox decisions are explicit and logged

If a future workflow conflicts with this document, this document wins unless explicitly amended.

---

## Status
This document defines canonical source capture and inbox behavior.

Next operations-planning documents will define:
- Admin dashboard scope
- LLM-assisted operations
- Publish review and gating

End of document.

