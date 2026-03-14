# VEDA YouTube Observatory — Spec Translation Note

## Purpose

This note translates the current YouTube research and architecture work into the next concrete documentation step.

The current YouTube docs are strong conceptually, but they are not yet fully implementation-safe.

The gap is no longer broad research.
The gap is now **spec translation**.

That means turning the existing ideas into explicit internal contracts that can safely drive schema, routes, hammer tests, and observatory behavior.

---

## Current state

The following has already been established with reasonable confidence:

- YouTube should be modeled as a **channel-first observatory**, not a video-first observatory.
- `CgSurface(type = youtube)` is the future identity anchor.
- URLs must not become the durable identity anchor.
- Channel ID (`UC...`) is the preferred durable channel identity.
- Video ID is the preferred durable video identity.
- Playlist ID is the preferred durable playlist identity.
- Vendor payloads appear to be **mostly flat lists with block metadata hints**, not clean nested `blocks[]` structures.
- YouTube search and recommendation surfaces should not be treated as the same observatory lens family.

This is enough to stop doing broad exploratory work.
It is **not** enough to begin schema or migration work safely.

---

## What “spec translation” means here

Spec translation means converting the current concept docs into explicit engineering contracts.

That includes answering questions like:

- what becomes a table
- what remains a raw payload blob
- what is an immutable snapshot
- what is mutable enrichment
- what is the FK relationship to `CgSurface(type = youtube)`
- what is unique
- what is project-scoped
- what gets EventLog coverage
- what input forms are accepted
- what identities are normalized before persistence
- what failure modes are allowed vs rejected

The next documents should reduce ambiguity, not create new prose.

---

## The three missing translation layers

### 1. Data model translation

The current docs describe observatory concepts such as:

- query lens
- snapshot
- block
- element
- enrichment

But those concepts are not yet mapped onto concrete VEDA storage contracts.

The next data-model doc must decide:

- whether YouTube blocks are stored as first-class rows or derived groupings
- whether elements are first-class rows or payload-derived projections
- how YouTube observations attach to project scope
- how YouTube observations attach to `CgSurface(type = youtube)`
- whether channel/video enrichment is snapshot-like or mutable state
- how uniqueness and dedupe work across observations

This is the single biggest missing piece.

---

### 2. Identity normalization translation

The current docs correctly prefer durable IDs over URLs, but they do not yet define the hard normalization contract.

The next identity doc must explicitly define:

- accepted operator input forms for channels
  - `UC...`
  - `@handle`
  - `/channel/...`
  - `/user/...`
  - `/c/...`
  - raw URLs
- how each input form resolves to canonical stored identity
- what the canonical stored identity is for:
  - channels
  - videos
  - playlists
- which forms are aliases only
- which forms are never treated as durable identity
- what happens when resolution fails

This must be written as a practical normalization contract, not as a narrative essay.

---

### 3. Vendor-shape translation

The research suggests that vendor payloads do not naturally match the idealized internal architecture.

This means VEDA must explicitly define how vendor payloads are translated into observatory structures.

The next vendor-validation doc should answer:

- what real provider fields are available
- which identifiers are stable
- whether block reconstruction is reliable
- whether “official cards” or other special modules are actually represented
- what is unsupported or too ambiguous for v1
- what fields are display metadata only vs safe structural metadata

This prevents VEDA from designing a schema around imaginary payloads.

---

## Most important implementation warning

The current Google SERP observatory stores payloads largely as `rawPayload` JSON and computes diagnostics on read.

That pattern may not transfer cleanly to YouTube.

The YouTube observatory is structurally more complex because it likely needs to reason about:

- block composition
- typed elements
- channel appearances across positions and blocks
- video appearances across time and contexts
- special surfaces such as shorts, channels, playlists, and possible official cards

Before migrations begin, VEDA must decide whether the YouTube observatory should be:

- mostly blob-based with selective extraction, or
- structurally relational for blocks/elements, or
- hybrid

Choosing this carelessly would create painful refactoring later.

---

## Recommended next documents

In priority order, the next missing docs should be:

### 1. `VEDA-YOUTUBE-DATA-MODEL.md`
This should define:

- core entities/tables
- keys and uniqueness rules
- project scoping
- `CgSurface` attachment path
- immutable observation vs mutable enrichment
- EventLog additions
- compute-on-read boundaries

### 2. `VEDA-YOUTUBE-IDENTITY-NORMALIZATION.md`
This should define:

- input forms
- canonical stored identities
- alias handling
- failure modes
- required normalization timing

### 3. `VEDA-YOUTUBE-VENDOR-VALIDATION.md`
This should define:

- actual provider payload shape
- what is reliable
- what is weak or missing
- what the internal translation layer must compensate for

### 4. `VEDA-YOUTUBE-OPERATOR-WORKFLOW.md`
This should define:

- how operator registers a YouTube surface
- when confirmation is required
- when normalization occurs
- how snapshot capture is initiated
- what the expected review loop looks like

---

## Practical next-step recommendation

Before writing schema or migrations, the team should create the YouTube data model spec first.

That document should be written using:

- the existing YouTube docs in this folder
- the recent architecture audit
- the recent implementation-oriented research
- the already-hardened Brand Surface Registry as the identity boundary

The purpose of that doc is to turn the current YouTube work from **strong ideas** into **explicit internal contracts**.

---

## Summary

The YouTube work has passed the broad research phase.

The remaining job is not “understand YouTube more.”
It is:

> translate the current architecture and research into concrete VEDA specs before implementation begins.

The most important next artifact is:

`VEDA-YOUTUBE-DATA-MODEL.md`

That document should become the bridge between the future-ideas folder and actual subsystem implementation.
