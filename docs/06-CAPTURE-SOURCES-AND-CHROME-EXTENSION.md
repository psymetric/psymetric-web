06 — Capture Sources & Chrome Extension
Purpose

This document defines how PsyMetric captures external signals and human-selected context using multiple ingestion paths, with the Chrome extension as a primary manual capture tool.

Capture is treated as intentional signal collection, not automated scraping.

The goal is to:

preserve high-signal context

maintain traceability

avoid noisy or unethical data ingestion

support future platforms without redesign

Core Principle

Capture is selective and human-directed.

PsyMetric does not attempt to mirror platforms or ingest everything.
Only content that a human explicitly chooses to capture enters the system.

Capture Sources (Overview)

PsyMetric supports the following capture sources:

RSS feeds (automated, metadata-first)

Chrome extension (manual, high-signal)

Manual entry (fallback and correction path)

All captured items become SourceItem entities in the DB.

SourceItem (Canonical Capture Entity)

All captured external material is represented as a SourceItem.

Required DB Fields (SourceItem)

id (UUID)

sourceType (rss | webpage | comment | reply | video | other)

platform (x | youtube | website | github | other)

url

capturedAt

capturedBy (human)

contentHash

snapshotRef (nullable)

snapshotMime

snapshotBytes

notes (human context / why this was captured)

status (ingested | triaged | used | archived)

createdAt, updatedAt

Chrome Extension: Role & Scope

The Chrome extension is a manual capture and annotation tool.

It exists to:

capture specific external content

preserve context and intent

store durable snapshots

feed high-quality signals into the DB

It is not:

an automated scraper

a comment harvester

a metrics collector

a background listener

What the Chrome Extension Can Capture
1) Webpages & Articles

Examples:

blog posts

documentation pages

release notes

technical write-ups

Captured as:

sourceType = webpage

snapshot stored in object storage

URL + hash stored in DB

2) Social Posts (X, YouTube, others)

Examples:

X posts / threads

YouTube video pages

future platforms (TikTok, LinkedIn, etc.)

Captured as:

sourceType = webpage or video

platform recorded explicitly

snapshot preserved if relevant

The extension must not assume platform-specific structure.
Platform handling is declarative, not hard-coded.

3) Comments & Replies (Manual Only)

Comments and replies are captured only when a human explicitly selects them.

Use cases:

confusion signals

recurring misunderstandings

insightful feedback

edge cases worth documenting

Captured as:

sourceType = comment or reply

snapshot includes comment text + limited surrounding context

optional screenshot

Rule: Comments are qualitative sources, not engagement metrics.

4) GitHub Content (Optional)

Examples:

README files

issues

discussions

PR descriptions

Captured only when:

directly relevant to a Guide or Project

explicitly selected by a human

Snapshot Storage Rules
Object Storage (Heavy Content)

Snapshots may include:

HTML

extracted text

markdown

screenshots (PNG/JPEG)

Stored in object storage with:

stable key

hash verification

MIME type

Database (Lightweight)

DB stores:

pointer (snapshotRef)

hash

size

metadata

human notes

RSS Ingestion (Summary)

RSS ingestion is metadata-first.

DB stores metadata + URL + hash

full content snapshot stored only when:

triaged as keep/watch

referenced by published content

source is fragile

RSS items become SourceItems with:

sourceType = rss

(Full policy defined in Docs 01 and 05.)

Triage & Promotion Workflow

SourceItem is captured

Status = ingested

Human reviews and adds notes

Status updated to:

triaged

used (linked to Guide/Concept/News)

archived

Promotion never happens automatically.

Relationship to Canonical Content

SourceItems may be linked to:

Guides

Concepts

Projects

NewsItems

These relationships are explicit DB edges:

Guide REFERENCES SourceItem

NewsItem DERIVED_FROM SourceItem

LLM Usage Rules (Capture)

LLMs may:

summarize captured snapshots

extract key points

suggest where SourceItems fit

LLMs must:

reference SourceItem IDs

respect human notes and context

avoid treating captured material as exhaustive or representative

LLMs must not:

auto-capture content

auto-promote SourceItems

infer sentiment from limited samples

Platform-Agnostic Design

The Chrome extension must:

record platform as metadata

avoid hard-coded assumptions

support unknown platforms gracefully

Adding a new platform requires:

no schema change

only UI/config updates

Ethics & Compliance

Capture must:

respect platform terms

avoid private or gated content

avoid bulk harvesting

remain human-directed

If capture legality is uncertain, do not capture.

Change Control

Any change to:

capture scope

snapshot behavior

supported content types

must be documented and versioned.

End of document