00 — System Overview
Purpose

This document defines the core system model for PsyMetric.

PsyMetric is an AI / LLM learning brand built as a database-centric knowledge and distribution system, where:

The database is the canonical source of truth

Public surfaces (website, GitHub, social media) are projections of that truth

Large Language Models (LLMs) act as operators and assistants that reason over the database, not free-form content

This document exists to prevent ambiguity, drift, and improvisation by humans or AI agents interacting with the system.

What PsyMetric Is

PsyMetric is:

A learning-focused AI brand

A system for creating guides, tutorials, concepts, projects, and news

A platform that emphasizes clarity, traceability, and durability

A DB-backed system where all content, distribution, and metrics are connected

The system is designed so that:

At any moment, an LLM can query the database and answer:

What content exists

What was published where

What projects are active

What social posts reference what content

What has changed over time

What PsyMetric Is Not

PsyMetric is not:

A research lab

A benchmarking or evaluation authority

A claims-based comparison platform

A content farm driven by SEO or trends alone

PsyMetric does not publish performance claims, rankings, or superiority assertions.
Its value comes from explanation, demonstration, and applied learning.

Core Architectural Principle

The database is the spine of the system.

Everything else depends on it.

Canonical Truth

The database holds the authoritative records for:

Content entities

Projects

Social posts

GitHub repositories

Metrics snapshots

Status and lifecycle information

Relationships between all of the above

If something is not in the database, it is considered non-canonical.

System Surfaces

PsyMetric operates across multiple surfaces, all connected through the database.

1. Website

Hosts guides, tutorials, concepts, project pages, and news

Renders content based on DB records and structured content files

Does not own truth — it displays it

2. GitHub

Hosts project code and reference implementations

Each repository is linked to:

One or more projects in the DB

Related guides and concepts

GitHub is the canonical home for code, not the site

3. Social Media

Used for distribution, discovery, and discussion

Posts are tracked as first-class entities in the DB

Every post links back to a canonical guide, project, or concept

4. Chrome Extension

Used for signal capture

Captures:

Articles

Threads

Repos

Notes

Contextual metadata

Writes directly to the database as raw, traceable input

5. RSS and External Feeds

Used as passive signal sources

Items are ingested into the DB for triage, not auto-published

Role of LLMs in the System

LLMs are core participants, not accessories.

LLMs may:

Read from the database

Summarize system state

Draft content based on DB records

Propose actions or next steps

Analyze metrics and trends

LLMs may not:

Invent system state

Assume content was published without DB confirmation

Make claims not grounded in DB records

Modify canonical records without explicit rules and approval

All LLM outputs should be traceable back to:

Database entities

Logged actions

Known system state

Traceability by Design

Every meaningful action in the system is designed to be traceable:

Every guide, concept, project, and news item has a DB record

Every social post references a canonical content entity

Every GitHub repo is linked to a project record

Metrics are stored as time-based snapshots, not mutable counters

Changes are logged with timestamps and context

This allows:

Historical reconstruction

Auditability

AI-assisted reasoning without hallucination

System Evolution

This document defines foundational invariants.

Future additions (new platforms, new content types, new automation) must:

Preserve the DB-as-spine principle

Maintain traceability

Avoid breaking canonical references

If a future change conflicts with this document, this document wins unless explicitly amended.

Audience

This document is written for:

The project owner

Future collaborators

AI systems (LLMs) operating within the project context

It is intentionally explicit, boring, and precise.

That is a feature, not a bug.

End of document