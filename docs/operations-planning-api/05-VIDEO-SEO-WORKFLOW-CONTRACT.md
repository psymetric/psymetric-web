# Video SEO Workflow Contract (v1)

## Purpose
This document defines the **internal, human-in-the-loop Video SEO workflow** used by the PsyMetric operator.

It exists to:
- align humans and LLMs on how Video SEO is executed
- turn an informal checklist into a structured, repeatable process
- keep YouTube interaction manual and compliant
- enable future automation without changing intent

This workflow is **personal/internal**. It is not a public product, feature, or promise.

---

## Scope

This contract covers:
- how video metadata is prepared after upload
- how keywords are imported and structured
- how LLMs assist step-by-step
- how outputs are reviewed and applied manually

Out of scope:
- auto-posting to YouTube or other platforms
- ranking guarantees or performance claims
- feedback loops based on views or revenue

**Deferred (v1):**
- Keyword/task management API endpoints — v1 operates with manual CSV upload + stored outputs
- TaskDefinitions entity — not part of the v1 schema (see Evolution Path)

---

## Core Principles

1. **Humans publish; systems prepare.**
2. **LLMs execute tasks, not goals.**
3. **Every step is optional and reviewable.**
4. **No step mutates external platforms automatically.**
5. **Traceability matters more than speed.**

---

## Inputs

For each video, the operator provides:

### Required
- Video URL (YouTube)
- Short content summary (human-written or LLM-assisted)

### Optional
- Keyword CSV export (e.g., SEMrush)
- Notes on tone, audience, or constraints

Keyword files are treated as **raw input artifacts**, not authoritative truth.

---

## Keyword Import & Structuring

### Keyword Import

- CSV files are uploaded and stored as-is
- Keywords are parsed into structured records
- Original values are preserved for auditability

### Keyword Structuring (Human + LLM)

Keywords are organized into:
- **Primary keyword** (single main intent)
- **Supporting keywords** (reinforce intent)
- **Semantic keywords** (topic neighbors)
- **Negative / excluded keywords** (optional)

Keyword assignment is a **proposal**, not a decision, until accepted by the operator.

---

## Task-Based Execution Model

Video SEO is executed as a **series of discrete tasks** derived from a checklist.

Each task:
- has defined inputs
- produces a single output
- is executed independently
- requires explicit acceptance to persist

### Example Tasks
- Select primary keyword
- Generate title candidates
- Draft description opening paragraph
- Expand description semantically
- Propose chapter structure

Tasks may be skipped without penalty.

---

## LLM Assistance Rules

LLMs may:
- propose keyword groupings
- generate draft text for a single task
- explain reasoning behind suggestions

LLMs may NOT:
- auto-accept outputs
- auto-advance tasks
- apply changes externally

When LLM output is saved, the system records:
- `llmAssisted: true`
- model identifier
- instruction/version reference (if applicable)

---

## Outputs

The workflow produces **draft metadata**, including:
- title (candidates + selected)
- description text
- optional tags, hashtags, chapters, pinned comment text

Outputs are copy/paste-ready but **not auto-applied**.

---

## Manual Application

The operator:
- copies finalized outputs
- pastes them into YouTube Studio manually
- confirms completion in the dashboard

This step is intentionally manual to:
- maintain platform compliance
- preserve human judgment
- avoid silent state divergence

---

## Completion Recording (Optional)

After manual updates in YouTube Studio, the operator may record completion internally by either:

- Updating the associated **Video** entity (e.g., notes field, or a future `seoCompletedAt` timestamp)
- Relying on normal entity update events (`ENTITY_UPDATED` in EventLog) generated when saving the Video record in the dashboard

**Note:** No `DistributionEvent` is required for YouTube in v1. The `DistributionPlatform` enum (`x | linkedin | other`) does not include YouTube. Video entities and their EventLog entries provide sufficient traceability.

This records *what was done*, not *what it achieved*.

---

## Invariants (Non-Negotiable)

- No automated posting or editing of YouTube
- No ranking or performance claims
- No background execution without review
- Manual acceptance required for every task output

---

## Evolution Path

### Phase 1 (Now)
- Checklist spreadsheet defines tasks
- Keyword CSVs are raw inputs
- LLM assists one task at a time

### Phase 2 (Later)
- Tasks encoded as TaskDefinitions in DB
- Structured audit and reuse

**Note:** TaskDefinitions entity is deferred and not part of the v1 schema.

### Phase 3 (Optional)
- Selective automation of *non-decision* steps

Automation is opt-in, reversible, and attributable.

---

## Status
This document defines the canonical Video SEO workflow for v1.

End of document.
