# VEDA YouTube Observatory — Data Model Spec

## Purpose

This document translates the YouTube observatory concepts into explicit internal engineering contracts.

It answers: what becomes a table, what stays a blob, what is derived, what is unique, what gets EventLog coverage, and how YouTube observations attach to existing VEDA structures.

This is a pre-implementation spec. It does not authorize schema changes or endpoint work yet.

---

## Status

**Phase:** Pre-implementation design (future-ideas)

**Prerequisites already met:**
- Brand Surface Registry hardening complete
- `CgSurface(type = youtube)` is a valid surface type in the existing schema
- Channel-first identity direction decided
- Truth-surface decision made (vendor primary, API enrichment, UI validation)

**Decisions made in this document:**
- YouTube search is the v1 lens family; recommendation surfaces are deferred
- Extracted elements get first-class rows; blocks do not
- Enrichment from YouTube Data API is Phase 2; v1 uses vendor-provided metadata only
- YouTube query targets are a new table, not a modification of `KeywordTarget`

---

## Scope: v1 Is Search-First

The YouTube observatory v1 is limited to **YouTube search observations**.

YouTube recommendation surfaces (home feed, suggested videos, browse features) are explicitly deferred. They have different context models, different ranking mechanics, different personalization profiles, and no clear query anchor.

Rationale: a search observation has a query, which provides a natural unique key, a natural target model, and a natural comparison anchor for volatility and dominance metrics. Recommendation surfaces lack all of these. Attempting to model both in v1 would force premature abstraction.

This boundary may be revisited after the search observatory is stable.

---

## Architectural Approach: Follow SIL-1 Pattern

The YouTube observatory follows the SIL-1 pattern established by the SERP observatory:

- **Target model:** governance record declaring "we care about this query" (mutable)
- **Snapshot model:** immutable observation record capturing what we saw (append-only)
- **Raw payload preservation:** full vendor response stored as JSON for replay and future extraction
- **Extracted metadata:** selectively promoted to indexed columns for cross-snapshot diagnostics
- **Confirm gate:** operator-triggered ingest with dry-run path
- **Transaction + EventLog discipline:** co-located in `prisma.$transaction()`
- **Idempotent replay:** unique constraint → 200, no duplicate EventLog
- **Compute-on-read diagnostics:** no materialized volatility tables

The key structural departure from SIL-1: YouTube observations extract element-level rows alongside the snapshot, because YouTube diagnostics require efficient cross-snapshot queries on channel identity and element type that are impractical against JSON blobs.

---

## CgSurface Attachment Model

The existing `CgSurface(type = youtube)` is the **channel identity anchor**, not the parent of search observations.

YouTube search snapshots are **query-scoped observations**, not channel-scoped children. A snapshot captures what YouTube showed for a query — it may contain results from many channels, including channels the project does not own.

The attachment model is:

```
Project
  ├── CgSurface(type = youtube, canonicalIdentifier = "UCxxxxxx")
  │     ↑ "our YouTube channel(s)"
  │
  └── YtQueryTarget ("queries we track on YouTube")
        └── YtSearchSnapshot ("what we observed for a query at a point in time")
              └── YtSearchElement[] ("extracted items from the snapshot")
```

**Visibility and dominance metrics** are computed on read by matching `YtSearchElement.channelId` against the project's `CgSurface(type = youtube).canonicalIdentifier` values.

This mirrors the SERP pattern: `SERPSnapshot` does not FK to `CgSurface(type = website)`. The surfaces provide the "what's ours" context; the observations provide the "what did we see" truth.

No FK from `YtSearchSnapshot` or `YtSearchElement` to `CgSurface`. The join is soft, via `channelId` matching, which is correct because:
- The snapshot may contain channels that are not registered as project surfaces
- The snapshot must remain valid even if a CgSurface is added or removed later
- Hard FK coupling would create ordering constraints that do not reflect reality

### CgSurface Join Contract (Explicit)

For YouTube observatory ownership joins to work correctly, the following invariant must hold:

> **`CgSurface(type = youtube).canonicalIdentifier` must be a normalized YouTube channel ID in `UC...` form before it participates in any observatory ownership comparison.**

This means:
- The surface registration path must resolve any operator-provided alias (handle, URL) to a `UC...` channel ID before persisting `canonicalIdentifier`.
- The `CreateCgSurfaceSchema` Zod validation enforces `UC...` format for YouTube `canonicalIdentifier`. Non-`UC...` values (including `@handle`) are rejected at the API boundary.
- Observatory diagnostics that compute "project visibility" join `YtSearchElement.channelId` against `CgSurface.canonicalIdentifier` using exact string equality on the `UC...` form.
- This invariant is enforced at the schema validation level. The observatory trusts that surfaces are already normalized.

---

## Proposed Entities

### 1. `YtQueryTarget`

**Purpose:** Governance record declaring "we care about tracking this YouTube search query."

**Justification for new table (not reusing `KeywordTarget`):**
- `KeywordTarget` has no platform discriminator; adding one changes its unique key and affects all existing SERP hammer tests
- YouTube query targets may acquire YouTube-specific governance fields (e.g., category filter, Shorts inclusion preference) that do not apply to Google SERP targets
- Separate table preserves clean separation between the two observatory surfaces
- The `KeywordTarget` unique key `(projectId, query, locale, device)` is specific to Google SERP semantics; YouTube's context dimensions differ (`region` + `language` instead of `locale`)

**Fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| id | UUID | yes | PK |
| projectId | UUID | yes | FK → Project |
| query | String | yes | Normalized at API boundary (same `normalizeQuery` rules) |
| region | String | yes | e.g. "US", "GB" — YouTube uses region codes, not BCP-47 locales |
| language | String | yes | e.g. "en", "es" — YouTube language parameter |
| device | String | yes | "desktop" \| "mobile" — validated at API boundary |
| isPrimary | Boolean | no | Default false |
| notes | String | no | Operator notes |
| createdAt | DateTime | yes | |
| updatedAt | DateTime | yes | |

**Uniqueness:** `@@unique([projectId, query, region, language, device])`

**Duplicate handling:** 409 on duplicate.

This follows the `KeywordTarget` precedent: governance records use P2002 → `conflict()` (409) because the duplicate represents a genuine conflict (the operator is trying to declare intent that already exists), not a validation failure. The SIL-1 Ingest Discipline spec explicitly recommends 409 for governance records.

Note: `CgSurface` uses a different pattern (app-layer pre-check → 400), which is appropriate for its use case (duplicate surface keys are closer to a validation error). The YouTube query target is structurally closer to `KeywordTarget` than to `CgSurface`, so it follows the `KeywordTarget` convention.

**Design notes:**
- Uses `region` + `language` instead of `locale` because YouTube and its vendor APIs use separate region and language parameters, not a combined BCP-47 string. Forcing them into a single `locale` field would require parsing conventions that add complexity without value.
- Query normalization uses the existing `normalizeQuery()` helper (trim, collapse whitespace, lowercase).

---

### 2. `YtSearchSnapshot`

**Purpose:** Immutable observation record capturing a YouTube search result page for a query at a point in time.

**Justification for new table (not reusing `SERPSnapshot`):**
- Different context dimensions (region + language vs locale; different lens fields)
- Different payload source (YouTube vendor vs Google vendor)
- Different normalization and extraction logic
- Different element types (videos, shorts, channels, playlists vs organic/featured_snippet/etc.)
- Shared table would require type-discriminator gymnastics and weaken both models
- Separate table keeps each observatory's invariants clean and independently hammer-testable

**Fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| id | UUID | yes | PK |
| projectId | UUID | yes | FK → Project |
| query | String | yes | Normalized |
| region | String | yes | |
| language | String | yes | |
| device | String | yes | |
| capturedAt | DateTime | yes | Server-assigned |
| validAt | DateTime | no | Provider datetime if available; fallback to capturedAt at API boundary |
| rawPayload | Json | yes | Full vendor response, no truncation |
| payloadSchemaVersion | String | no | Vendor/API version identifier |
| source | String | yes | e.g. "dataforseo" |
| batchRef | String | no | Grouping identifier for batch operations |
| totalElements | Int | yes | Count of extracted elements (for quick diagnostics without payload parsing) |
| createdAt | DateTime | yes | |

**Uniqueness:** `@@unique([projectId, query, region, language, device, capturedAt])`

**Invariants:**
- Immutable. No UPDATE.
- Transaction + EventLog atomicity for writes.
- Idempotent replay on unique constraint violation (200, no duplicate EventLog).
- `rawPayload` preserves full vendor response for replay and future re-extraction.

---

### 3. `YtSearchElement`

**Purpose:** Extracted element from a YouTube search snapshot, promoted to a first-class row for efficient cross-snapshot diagnostics.

**Justification for first-class rows (not leaving in rawPayload):**

This is the most important structural decision in this spec. The alternatives are:

**(a) Blob-only:** Store everything in `rawPayload`, compute all diagnostics by parsing JSON. This follows the SERP pattern.

**(b) First-class element rows:** Extract each result item to an indexed row alongside the blob.

**(c) First-class block + element rows:** Extract both block structure and elements.

**Why (b) is the right choice for YouTube:**

The core YouTube diagnostics require cross-snapshot queries that are structurally different from SERP diagnostics:

- "How often does channel X appear in position 1–5 across our tracked queries over 90 days?"
- "What is the channel concentration in top-10 results for query Y over time?"
- "What fraction of results for our queries are Shorts vs longform?"
- "Which videos persist across multiple snapshots for the same query?"

These queries need indexed access to `channelId`, `videoId`, `elementType`, and `rankAbsolute` across all snapshots. Parsing JSON blobs for every snapshot in a 90-day window is neither practical nor deterministic (JSON path syntax varies across DB versions, and Prisma's JSON filtering is limited).

The SERP observatory avoids this because its core diagnostic (domain dominance) only needs the top 10 domains, which are pre-extracted to a small field. YouTube needs deeper element-level access.

**Why (c) is not justified for v1:**

The Translation Note establishes that vendor payloads are "mostly flat item lists with block metadata hints, not clean nested blocks[] structures." Blocks would be VEDA-reconstructed groupings from `block_name` annotations, not provider-native truth. Materializing a separate `Block` table for reconstructed groupings adds a table that does not protect an invariant — it is derived interpretation. Block metadata is better captured as fields on the element row (`blockType`, `blockRank`) and derived groupings computed on read.

If v2 diagnostics require block-level reasoning, a `YtSearchBlock` table can be added then. The element rows will not need to change.

**Fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| id | UUID | yes | PK |
| projectId | UUID | yes | FK → Project |
| snapshotId | UUID | yes | FK → YtSearchSnapshot |
| elementType | String | yes | Controlled vocabulary validated at extraction boundary (see note below) |
| rankAbsolute | Int | yes | 1-based position on the page across all result types |
| rankOrganic | Int | no | Position among non-paid elements only; null for ads |
| videoId | String | no | YouTube video ID (11 chars) when element is a video/short |
| channelId | String | no | YouTube channel ID (`UC...`) when extractable |
| channelName | String | no | Display name at time of observation |
| title | String | no | Element title at time of observation |
| url | String | no | Element URL at time of observation |
| isShort | Boolean | no | Explicit Shorts classification when vendor provides it |
| blockType | String | no | Vendor-reported block/group name (e.g. "People also watched") |
| blockRank | Int | no | Position within the block when vendor provides it |
| vendorFlags | Json | no | Additional vendor-specific metadata that does not justify its own column |
| createdAt | DateTime | yes | |

**`elementType` controlled vocabulary:**

`elementType` is stored as a `String` and validated at the normalizer/extraction boundary against a fixed internal allowlist. It is not a Prisma enum in v1.

The v1 allowlist is: `"video"`, `"short"`, `"channel"`, `"playlist"`, `"movie"`, `"ad"`, `"card"`, `"other"`.

This is the same approach used for `device` and `source` in SIL-1: the DB stores a string, the application layer enforces the vocabulary. This is intentional for v1 because:

- The vendor may introduce new element types that should be captured as `"other"` rather than rejected
- Enum promotion (moving from string with app-layer validation to a Prisma enum) can be considered once the vendor shape stabilizes and the actual vocabulary is confirmed through production use
- Premature enum creation for an external-vendor-dependent vocabulary risks enum migration churn

The normalizer must reject or map to `"other"` any vendor-reported type not in the allowlist. It must never pass through arbitrary vendor strings unchecked.

**Uniqueness:** `@@unique([snapshotId, rankAbsolute])`

Only one element can occupy a given absolute rank position within a snapshot. This enforces structural correctness and prevents duplicate extraction.

**Indexes:**
- `@@index([projectId, channelId])` — channel dominance queries
- `@@index([projectId, videoId])` — video persistence queries
- `@@index([projectId, snapshotId])` — snapshot element enumeration
- `@@index([projectId, elementType])` — type composition queries

**Invariants:**
- Immutable. Created in the same transaction as the parent snapshot.
- No independent EventLog per element — the snapshot's `YT_SEARCH_SNAPSHOT_RECORDED` event covers the batch.
- Elements are created only from vendor payload extraction, never directly by operator.
- Extraction is deterministic: same rawPayload → same element set.

---

## Entities NOT Proposed for v1

### Block table

**Not justified.** Vendor payloads provide flat items with block hints, not native block structures. Block grouping is VEDA reconstruction and should remain a derived view, not a materialized table. Block metadata is captured as fields on `YtSearchElement`.

### YouTube channel enrichment table

**Not justified for v1.** Enrichment from the YouTube Data API (subscriber counts, topic categories, channel statistics) is a Phase 2 concern. v1 uses vendor-provided metadata only. The existing `CgSurface(type = youtube)` already holds the channel identity; additional enrichment tables should wait until there is a concrete diagnostic that requires API-sourced metadata not available in vendor payloads.

### YouTube video enrichment table

**Not justified for v1.** Same reasoning as channel enrichment. Video metadata from the vendor payload is extracted into `YtSearchElement` fields. Dedicated video enrichment from the Data API is Phase 2.

### YouTube autocomplete/suggestion table

**Not justified for v1.** Autocomplete observation is a separate lens family with different context, different uniqueness semantics, and different diagnostic value. It should be specified separately if needed.

---

## Reuse vs New Justification

### `YtQueryTarget` — New table

| Question | Answer |
|---|---|
| Can `KeywordTarget` be reused? | Not cleanly. It lacks a platform discriminator, uses `locale` instead of `region` + `language`, and its unique key would need modification. |
| What invariant does the new table protect? | Platform-specific governance: YouTube queries have different context dimensions than Google SERP queries. |
| Why not a blob or derived? | Targets are mutable governance records that need uniqueness enforcement and independent lifecycle. |
| Hammer-testable? | Yes: create, duplicate → 409, cross-project → 404, normalization, deterministic listing. |

### `YtSearchSnapshot` — New table

| Question | Answer |
|---|---|
| Can `SERPSnapshot` be reused? | Not cleanly. Different context dimensions, different payload source, different extraction logic, different element types. Shared table requires discriminator columns and weakens both models. |
| What invariant does the new table protect? | Immutable YouTube search observations with YouTube-specific context and uniqueness semantics. |
| Why not a blob or derived? | It is the primary observatory record. Must be queryable, unique-constrained, and EventLog-covered. |
| Hammer-testable? | Yes: create, idempotent replay → 200, cross-project → 404, payload shape validation, deterministic listing. |

### `YtSearchElement` — New table

| Question | Answer |
|---|---|
| Can existing models handle this? | No. SERP observatory stores organic results only as extracted fields on the snapshot (topDomains). YouTube needs per-element rows for cross-snapshot diagnostic queries on channelId, videoId, and elementType. |
| What invariant does the new table protect? | Structural correctness: one element per absolute rank per snapshot. Deterministic extraction: same payload → same elements. |
| Why not leave in blob? | Cross-snapshot queries (channel dominance over 90 days, video persistence, type composition drift) require indexed access to element-level fields. JSON blob parsing at query time is impractical for these diagnostics. |
| Hammer-testable? | Yes: element count matches totalElements on snapshot, no duplicate rankAbsolute within snapshot, channelId/videoId format validation, cross-project isolation. |

### `CgSurface(type = youtube)` — Existing, no changes

| Question | Answer |
|---|---|
| Changes needed? | None. The existing CgSurface model with `canonicalIdentifier` for channel ID and the partial unique index on `(projectId, type, canonicalIdentifier)` already supports YouTube channel surfaces. Schema validation now enforces UC... format for YouTube canonicalIdentifier. |
| How is it used? | As the "what's ours" identity anchor. Visibility diagnostics join `YtSearchElement.channelId` against `CgSurface.canonicalIdentifier` at read time. The join contract requires `canonicalIdentifier` to be in `UC...` form (see CgSurface Join Contract section). |

---

## Enum Additions

### `EntityType` additions

```
ytQueryTarget
ytSearchSnapshot
```

`YtSearchElement` does **not** need an `EntityType` entry because it does not receive independent EventLog entries. Elements are covered by the parent snapshot's event.

### `EventType` additions

```
YT_QUERY_TARGET_CREATED
YT_SEARCH_SNAPSHOT_RECORDED
```

### `CgSurfaceType`

No additions needed. `youtube` already exists.

### `Platform`

No additions needed. `youtube` already exists.

### New enums

No new Prisma enum types are proposed. `elementType` and `device` are validated at the API/normalizer boundary as strings against a controlled vocabulary, consistent with the existing SIL-1 pattern (see `elementType` controlled vocabulary note above).

---

## Identity Normalization Contract

This section summarizes the normalization rules. The full normalization spec is in `VEDA-YOUTUBE-IDENTITY-NORMALIZATION.md`.

### Query normalization

Same as existing `normalizeQuery()`: trim, collapse whitespace, lowercase.

### Channel ID normalization

Canonical stored form: `UC...` (24-character YouTube channel ID).

Accepted operator input forms for channel surface registration are tiered by resolution reliability:

**Tier 1 — Direct extraction (no API call needed):**

| Input form | Resolution |
|---|---|
| `UCxxxxxxxxxxxxxxxxxxxxxx` | Store directly after format validation |
| `https://youtube.com/channel/UCxxxxxx` | Extract `UC...` from URL path |

These are reliable because the `UC...` channel ID is explicitly present in the input.

**Tier 2 — API-dependent resolution (requires YouTube Data API call):**

| Input form | Resolution |
|---|---|
| `@handle` | Resolve to `UC...` via YouTube Data API `channels.list` with `forHandle` parameter |
| `https://youtube.com/@handle` | Extract `@handle` from URL, then resolve as above |

These require a live API call and can fail if the handle does not exist or the API is unavailable. The confirm-gate pattern should preview the resolved identity before writing.

**Tier 3 — Weak or legacy forms (may not reliably resolve):**

| Input form | Resolution |
|---|---|
| `https://youtube.com/c/customname` | Attempt API resolution; custom URLs are not guaranteed to resolve via `channels.list` in all cases. May require operator confirmation or fallback to manual `UC...` entry. |
| `https://youtube.com/user/legacyname` | Legacy format. Attempt API resolution via `forUsername` parameter where supported. May not resolve for all channels. |

These forms should be supported on a best-effort basis. If resolution fails, the operator should be informed and asked to provide the `UC...` channel ID directly.

**Hard rule:** If resolution to `UC...` fails for any input form, the registration is rejected. No surface is created with a non-canonical channel identifier. The `@handle` form is never stored as `canonicalIdentifier` — it is an input alias only. The Zod schema enforces this at the API boundary.

**Important:** Channel ID resolution requires a YouTube Data API call for Tier 2 and Tier 3 inputs. This means surface registration is the one place where the YouTube Data API is needed in v1 (not for enrichment, just for identity resolution). The confirm-gate pattern should apply: the operator submits an input form, the system resolves it to a `UC...` ID and previews the resolved identity, the operator confirms before the surface is created.

### Video ID normalization

Canonical stored form: 11-character YouTube video ID (e.g., `dQw4w9WgXcQ`).

Extraction from vendor payloads should use the vendor's direct video ID field when available. If only a URL is available, extract via regex: `/(?:v=|\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/`.

If extraction fails, the element is still stored (with `videoId` null) — the element's position and type are still valuable for composition and ranking diagnostics even without a resolved video identity.

### Playlist ID normalization

Canonical stored form: YouTube playlist ID string (e.g., `PLxxxxxx`).

Same extraction approach as video ID: prefer vendor's direct field, fall back to URL extraction.

---

## Immutable Observation vs Mutable State

| Entity | Mutability | Rationale |
|---|---|---|
| `YtQueryTarget` | Mutable | Governance record. `isPrimary`, `notes` may be updated. |
| `YtSearchSnapshot` | Immutable | Observation record. Append-only. No UPDATE. |
| `YtSearchElement` | Immutable | Extracted from immutable snapshot. No UPDATE. |
| `CgSurface(type = youtube)` | Mutable | Surface registration record. `label`, `enabled`, `canonicalUrl` may be updated. `canonicalIdentifier` should be treated as effectively immutable after resolution — changing it would mean the surface is a different channel. |

---

## Route Classes

### Justified for v1

**`POST /api/youtube/query-targets`** — Create a YouTube query target.
- Confirm-gate: not needed (no external call, no cost)
- Pattern: Zod validation → normalize query → uniqueness check → transaction + EventLog → 201 or 409

**`GET /api/youtube/query-targets`** — List YouTube query targets for project.
- Deterministic ordering: `[{ createdAt: "desc" }, { id: "desc" }]`
- Filters: region, language, device, isPrimary

**`POST /api/youtube/search-snapshot`** — Capture a YouTube search snapshot.
- Confirm-gate: yes (vendor call has cost)
- `confirm=false`: returns cost estimate only. Does not call the vendor. Does not write to the database. Does not create any side effects. This is a pure read path.
- `confirm=true`: triggers vendor call → normalize → extract elements → transaction (snapshot + elements + EventLog) → 201
- Recent-window idempotency check runs before the vendor call (same pattern as SERP). If a recent snapshot exists for the same query/context, it is returned without calling the vendor.
- Provider error → 502 with `provider_error` classification (not a system failure, not a hammer failure)

**`GET /api/youtube/search-snapshots`** — List YouTube search snapshots for project.
- Deterministic ordering: `[{ capturedAt: "desc" }, { id: "desc" }]`
- Filters: query, region, language, device, from/to date range
- Optional `includeElements` flag (default false) to include extracted elements

### Not justified for v1

**No dedicated channel enrichment endpoint.** Enrichment from YouTube Data API is Phase 2.

**No dedicated video enrichment endpoint.** Same.

**No element-level CRUD endpoints.** Elements are created atomically with their parent snapshot and are never independently mutated.

**No YouTube-specific surface registration endpoint.** The existing `POST /api/content-graph/surfaces` already supports `type: "youtube"` with `canonicalIdentifier`. Channel ID resolution (handle → UC...) may require a pre-resolution helper route or an enhancement to the existing surface route, but this should be specified in the identity normalization doc, not here.

---

## Hammer-Verifiable Invariants

### Project isolation
- YtQueryTarget created in project A is not visible to project B
- YtSearchSnapshot created in project A is not visible to project B
- Cross-project access returns 404

### Uniqueness enforcement
- Duplicate YtQueryTarget → 409
- Duplicate YtSearchSnapshot (same unique key) → 200 idempotent replay
- No duplicate rankAbsolute within a YtSearchElement set for a given snapshot

### Query normalization
- Input `"  Best CRM Software  "` → stored as `"best crm software"`
- Two targets that normalize to the same query → 409 on second

### Snapshot immutability
- No UPDATE path exists for YtSearchSnapshot or YtSearchElement
- Re-observation creates a new snapshot, not a modification

### Transaction + EventLog atomicity
- YtQueryTarget creation emits `YT_QUERY_TARGET_CREATED` in the same transaction
- YtSearchSnapshot creation emits `YT_SEARCH_SNAPSHOT_RECORDED` in the same transaction
- Idempotent replay does NOT emit a duplicate EventLog entry

### Confirm-gate discipline
- `confirm=false` returns cost estimate without writing or calling vendor
- `confirm=false` produces no side effects of any kind
- `confirm=true` performs vendor call and write

### Element extraction determinism
- Same `rawPayload` → same extracted element set
- `totalElements` on snapshot matches actual element row count
- `elementType` values are always members of the controlled vocabulary allowlist

### Deterministic ordering
- All list endpoints use explicit orderBy with id tiebreak
- Two identical list requests return identical ordering

### CgSurface join correctness
- `CgSurface(type = youtube).canonicalIdentifier` is in `UC...` form (enforced by schema validation)
- Ownership diagnostics correctly match element channelId against surface canonicalIdentifier

### Validation
- Invalid device → 400
- Invalid region/language → 400
- Malformed JSON → 400
- Missing required fields → 400

---

## Compute-on-Read Diagnostics (Not Materialized)

The following diagnostics are enabled by this data model but are NOT stored in tables:

- **Channel dominance:** concentration of top-N results by channel across snapshots for a query over time — computed by querying `YtSearchElement` rows where `rankAbsolute <= N` and grouping by `channelId`
- **Video persistence:** which videos appear consistently for a query across snapshots — computed by querying `YtSearchElement` rows grouped by `videoId` across snapshot dates
- **Type composition drift:** fraction of results that are Shorts vs longform vs channels vs playlists — computed by grouping `YtSearchElement` rows by `elementType`
- **Result set overlap:** Jaccard similarity between element sets of consecutive snapshots for the same query — computed by comparing videoId/channelId sets
- **Project visibility:** how often the project's own channels appear in results — computed by joining `YtSearchElement.channelId` against `CgSurface(type = youtube).canonicalIdentifier` where `canonicalIdentifier` is in `UC...` form

All of these are compute-on-read. No materialized analytics tables.

---

## Vendor Payload Handling

### Storage

The full vendor response is stored in `YtSearchSnapshot.rawPayload` without truncation. This is identical to the SERP pattern.

### Extraction

A normalizer function (analogous to `normalizeDataForSeoSerp`) extracts elements from the vendor payload and produces the `YtSearchElement` rows written in the same transaction as the snapshot.

The normalizer is a pure function: vendor response → extracted elements + snapshot metadata. No DB access. No side effects.

The normalizer must validate each element's `elementType` against the controlled vocabulary allowlist. Unknown vendor types should be mapped to `"other"`, not passed through as raw vendor strings.

### Vendor shape assumptions

Based on current research, the vendor (DataForSEO YouTube Organic SERP) provides:
- Flat item list with `rank_absolute`, `type`, `block_name`
- Video/channel identifiers on each item
- `is_shorts` flag on some items
- `check_url` for verification

The normalizer must handle missing or unexpected fields gracefully, consistent with the existing SERP normalizer pattern.

A vendor validation document (`VEDA-YOUTUBE-VENDOR-VALIDATION.md`) should confirm the actual payload shape before implementation begins.

---

## Phase 2 Outlook (Not Authorized)

Phase 2 may introduce:
- `YtChannelEnrichment` — API-sourced channel metadata snapshots
- `YtVideoEnrichment` — API-sourced video metadata snapshots
- `YtSearchBlock` — if block-level diagnostics become necessary
- Recommendation surface observation (separate lens family)
- `elementType` enum promotion (if vendor vocabulary has stabilized)

These are not specified here and must not be pre-built.

---

## Summary

The YouTube observatory v1 data model introduces three new tables:

| Table | Role | Mutability |
|---|---|---|
| `YtQueryTarget` | Governance: "queries we track on YouTube" | Mutable |
| `YtSearchSnapshot` | Observation: "what we saw for a query at a point in time" | Immutable |
| `YtSearchElement` | Extraction: "each item from a snapshot, indexed for cross-snapshot diagnostics" | Immutable |

It reuses without modification:
- `CgSurface(type = youtube)` for channel identity
- `Project` for project scoping
- `EventLog` for mutation audit
- `normalizeQuery()` for query normalization
- Confirm-gate and idempotency patterns from the SERP observatory

It explicitly defers:
- YouTube Data API enrichment tables
- Block-level materialized tables
- Recommendation surface observation
- Autocomplete observation

The single most important invariant: **every YouTube search observation is an immutable, project-scoped, lens-declared, EventLog-covered snapshot with deterministically extracted element rows.**
