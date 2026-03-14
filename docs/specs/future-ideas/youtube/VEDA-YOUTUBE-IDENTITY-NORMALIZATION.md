# VEDA YouTube Identity Normalization — Binding Spec

## Purpose

This document defines the hard normalization contract for YouTube identity handling in VEDA.

It specifies: what input forms are accepted, what the canonical stored identity is for each entity class, how weaker forms resolve to durable identities, what happens when resolution fails, and what invariants future hammer tests must verify.

This is a pre-implementation spec. It does not authorize code changes yet.

---

## Core Principle

> **Normalize at the boundary or fail. Never store a weaker form in a durable identity field.**

YouTube has many ways to reference the same channel, video, or playlist. URLs change. Handles change. Custom URLs are not guaranteed stable. Display names change constantly.

VEDA must store one durable identity per real-world object in identity-bearing fields. Everything else is an alias, an input convenience, or observed metadata — never the durable anchor.

---

## Scope

This document covers normalization rules for three YouTube identity classes:

1. **Channel identity** — used in `CgSurface(type = youtube).canonicalIdentifier` and `YtSearchElement.channelId`
2. **Video identity** — used in `YtSearchElement.videoId`
3. **Playlist identity** — used in `YtSearchElement` when element type is playlist

Each class has a canonical stored form, accepted input forms, and explicit failure modes.

---

## Normalization Contexts

YouTube identity normalization happens in two distinct contexts with different rules:

### Context 1: Operator-initiated surface registration

When an operator registers a YouTube channel as a project brand surface via `CgSurface`, they may provide the channel reference in many forms. The system must resolve this to a `UC...` channel ID before persisting `canonicalIdentifier`.

This context allows interactive confirmation (confirm-gate pattern) and may involve an external API call for resolution.

### Context 2: Vendor payload extraction

When the normalizer extracts elements from a vendor SERP snapshot, it encounters channel IDs, video IDs, and playlist IDs embedded in the vendor's response fields. The normalizer must extract canonical IDs from whatever the vendor provides.

This context is non-interactive, deterministic, and must handle missing or malformed data gracefully without failing the entire snapshot.

---

## Channel Identity

### Canonical Stored Form

```
UC + 22 base64url characters
```

Example: `UCxxxxxxxxxxxxxxxxxxxxxx`

Total length: 24 characters. Prefix is always `UC`. Remainder is base64url (`[A-Za-z0-9_-]`).

This is the only form that may be stored in:
- `CgSurface(type = youtube).canonicalIdentifier`
- `YtSearchElement.channelId`

### Schema Enforcement

The `CreateCgSurfaceSchema` validation for YouTube `canonicalIdentifier` requires the `UC...` channel ID form. A DB audit confirmed zero existing rows with `@handle` in `canonicalIdentifier`, and the schema was tightened accordingly.

The current validation regex is: `^UC[A-Za-z0-9_-]{22}$`

This means:
- The Zod schema rejects any non-`UC...` value at the API boundary.
- Operators must resolve `@handle` and other weaker forms to a `UC...` channel ID before calling the surface registration endpoint.
- When a pre-resolution helper or enhanced registration flow is built (to accept handles as input and resolve them interactively), it must produce a `UC...` value before the surface write occurs.

The ownership join contract is enforced at the schema level, not deferred to observatory read time.

---

### Channel Input Forms — Operator Surface Registration

The following table defines every accepted input form for channel surface registration, ordered by resolution reliability.

#### Normalization Contract Table — Channels (Operator Input)

| Input form | Example | Resolution method | Canonical stored identity | Confirmation required | Failure behavior |
|---|---|---|---|---|---|
| Bare channel ID | `UCxxxxxxxxxxxxxxxxxxxxxx` | Format validation only (regex: `^UC[A-Za-z0-9_-]{22}$`) | Store directly | No | Reject if format invalid |
| `/channel/` URL | `https://youtube.com/channel/UCxxxxxxxxxxxxxxxxxxxxxx` | Extract `UC...` from URL path segment after `/channel/` | Extracted `UC...` value | No | Reject if extracted value fails format validation |
| `@handle` (bare) | `@mkbhd` | YouTube Data API call: `channels.list` with `forHandle` parameter | Resolved `UC...` value | Yes — preview resolved identity before write | Reject registration. Inform operator. Suggest providing `UC...` directly. |
| `@handle` URL | `https://youtube.com/@mkbhd` | Extract handle from URL path, then resolve as above | Resolved `UC...` value | Yes | Same as bare `@handle` |
| `/c/` custom URL | `https://youtube.com/c/mkbhd` | Attempt YouTube Data API resolution. Custom URLs have no guaranteed API resolution path — `channels.list` does not have a `forCustomUrl` parameter. Resolution may require a search or scrape, which is unreliable. | Resolved `UC...` value if resolution succeeds | Yes | If resolution fails: reject registration. Inform operator that `/c/` URLs cannot be reliably resolved. Ask for `UC...` channel ID or `@handle` instead. |
| `/user/` legacy URL | `https://youtube.com/user/marquesbrownlee` | Attempt YouTube Data API resolution via `channels.list` with `forUsername` parameter. This is a legacy format; `forUsername` support may be incomplete for newer channels. | Resolved `UC...` value if resolution succeeds | Yes | If resolution fails: reject registration. Inform operator that `/user/` is a legacy format with limited API support. Ask for `UC...` channel ID or `@handle` instead. |
| Bare display name | `Marques Brownlee` | **Not accepted.** Display names are not unique, not stable, and not resolvable to a single channel. | N/A | N/A | Reject with clear error: "Display names are not accepted as channel identity. Provide a channel ID (UC...), @handle, or channel URL." |
| Ambiguous URL | `https://youtube.com/somepath` | **Not accepted** unless path matches a recognized pattern above. | N/A | N/A | Reject with clear error: "Unrecognized YouTube URL format." |

#### Resolution Tiers Summary

**Tier 1 — Direct extraction (no API call, high confidence):**
- Bare `UC...` ID
- `/channel/UC...` URL

**Tier 2 — API-dependent (requires live YouTube Data API call, medium confidence):**
- `@handle` (bare or URL)

**Tier 3 — Weak/legacy (API resolution may fail, low confidence):**
- `/c/` custom URL
- `/user/` legacy URL

**Not accepted:**
- Display names
- Unrecognized URL patterns
- Bare strings that are not `UC...` IDs or `@handle` form

#### Confirmation Flow

For Tier 2 and Tier 3 inputs, the registration flow must follow the confirm-gate pattern:

1. Operator submits input form
2. System attempts to resolve to `UC...` channel ID
3. If resolution succeeds: preview the resolved identity (channel ID, channel title if available) and ask operator to confirm
4. If resolution fails: reject with an informative error; do not create the surface
5. On confirmation: persist `canonicalIdentifier` as the resolved `UC...` value

The operator never sees `@handle` stored as `canonicalIdentifier`. The stored value is always the resolved `UC...` ID.

---

### Channel Identity — Vendor Payload Extraction

When the normalizer extracts channel identity from vendor SERP payloads:

| Vendor field | Expected form | Extraction rule |
|---|---|---|
| Direct channel ID field | `UC...` | Validate format (`^UC[A-Za-z0-9_-]{22}$`). Store if valid. |
| Channel URL field | `https://youtube.com/channel/UC...` or similar | Extract `UC...` from URL. Validate format. Store if valid. |
| Channel URL with `@handle` | `https://youtube.com/@handle` | **Do not attempt API resolution during extraction.** Store `channelId` as null for this element. The handle may be stored in `channelName` or `vendorFlags` for reference, but it must not be stored in `channelId`. |
| No channel identity available | — | Store `channelId` as null. Element is still valuable for ranking and composition diagnostics. |

**Hard rule for extraction:** The normalizer must never make an API call. It is a pure, deterministic function. If the vendor does not provide a `UC...` channel ID (directly or in a `/channel/` URL), `channelId` is null.

This means some elements may have null `channelId` even though the vendor knows which channel produced the video. That is acceptable: the raw payload preserves the vendor's full response, and future enrichment (Phase 2) can resolve channel identities via the YouTube Data API.

---

## Video Identity

### Canonical Stored Form

```
11 base64url characters
```

Example: `dQw4w9WgXcQ`

Character set: `[A-Za-z0-9_-]`. Length: exactly 11.

This is the only form that may be stored in `YtSearchElement.videoId`.

### Video Input Forms — Vendor Payload Extraction

| Vendor field | Expected form | Extraction rule |
|---|---|---|
| Direct video ID field | `dQw4w9WgXcQ` | Validate format (`^[A-Za-z0-9_-]{11}$`). Store if valid. |
| `watch` URL | `https://youtube.com/watch?v=dQw4w9WgXcQ` | Extract from `v` query parameter. Validate format. Store if valid. |
| Short URL | `https://youtu.be/dQw4w9WgXcQ` | Extract from path. Validate format. Store if valid. |
| Shorts URL | `https://youtube.com/shorts/dQw4w9WgXcQ` | Extract from path segment after `/shorts/`. Validate format. Store if valid. |
| Embed URL | `https://youtube.com/embed/dQw4w9WgXcQ` | Extract from path segment after `/embed/`. Validate format. Store if valid. |
| No video ID extractable | — | Store `videoId` as null. Element is still stored — position, type, and channel identity remain valuable. |

### Extraction Regex

When the vendor provides only a URL (no direct ID field), the following regex extracts the video ID:

```
/(?:v=|\/(?:shorts|embed)\/|youtu\.be\/)([A-Za-z0-9_-]{11})/
```

This handles `watch?v=`, `/shorts/`, `/embed/`, and `youtu.be/` forms. It does not attempt to extract from unrecognized URL patterns.

### Video Identity in Operator Contexts

v1 does not require operators to input video IDs directly. Videos appear only as extracted elements from vendor snapshots. If a future phase introduces operator-facing video reference (e.g., "mark this video as ours"), the same canonical form applies: bare 11-character video ID, with URL extraction as a convenience.

---

## Playlist Identity

### Canonical Stored Form

```
PL + variable-length alphanumeric string
```

Example: `PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf`

Prefix is always `PL`. Remainder is alphanumeric with hyphens and underscores. Total length varies (typically 24–48 characters).

Note: YouTube also has system-generated playlists with prefixes like `UU` (uploads), `LL` (liked), `FL` (favorites). These are channel-scoped and may appear in vendor payloads. The normalizer should store them as-is if format-valid, but they are not the same as user-created `PL` playlists.

### Playlist Input Forms — Vendor Payload Extraction

| Vendor field | Expected form | Extraction rule |
|---|---|---|
| Direct playlist ID field | `PLxxxxxx` | Validate format (`^[A-Za-z0-9_-]{10,}$` — minimum length to exclude noise). Store if valid. |
| Playlist URL | `https://youtube.com/playlist?list=PLxxxxxx` | Extract from `list` query parameter. Validate format. Store if valid. |
| No playlist ID extractable | — | Store without playlist identity. Element position and type remain valuable. |

### Playlist Identity in Operator Contexts

v1 does not require operators to input playlist IDs. Playlists appear only as extracted elements from vendor snapshots.

---

## Query Normalization

Query normalization for YouTube query targets follows the existing `normalizeQuery()` contract established in SIL-1:

1. Trim leading/trailing whitespace
2. Collapse internal whitespace to single spaces
3. Lowercase

This is the same function used for `KeywordTarget` and `SERPSnapshot` queries. No YouTube-specific modifications are needed.

The normalized form is stored in `YtQueryTarget.query` and `YtSearchSnapshot.query`. The original un-normalized input is not preserved in the database (consistent with SIL-1 doctrine).

---

## URL Handling Doctrine

URLs appear in multiple contexts in the YouTube observatory. The rules differ by context.

### URLs as operator input (surface registration)

URLs are accepted as a convenience input for channel surface registration. The system extracts the durable identity from the URL and stores only the extracted identity. The URL itself is not stored in `canonicalIdentifier`.

If the operator wants to store a human-readable channel URL for reference, `CgSurface.canonicalUrl` exists for that purpose. This is a presentation field, not an identity field.

### URLs as vendor payload data

Vendor payloads may include URLs for videos, channels, and playlists. The normalizer extracts durable IDs from these URLs when possible. The URLs themselves may be stored in `YtSearchElement.url` as observed metadata — this is reference data, not identity data.

`YtSearchElement.url` is a snapshot of what the vendor reported at observation time. It may change, break, or redirect. It must never be used as a join key or identity anchor.

### URLs as element references

`YtSearchElement.url` stores the vendor-reported URL for the element at observation time. This is useful for operator review and verification (e.g., clicking through to confirm what the vendor reported). It is not used for any identity comparison, uniqueness enforcement, or observatory join.

---

## What Is Never a Durable Identity

The following are explicitly not durable YouTube identities and must never be stored in identity-bearing fields:

| Form | Why it is not durable | Where it may appear |
|---|---|---|
| `@handle` | Handles can be changed by the channel owner. A handle today may belong to a different channel tomorrow. | Accepted as input for surface registration (resolved to `UC...` before storage). May appear in `channelName` or `vendorFlags` as observed metadata. |
| Channel display name | Not unique. Not stable. Two channels can have the same display name. | May appear in `YtSearchElement.channelName` as observed metadata. |
| `/c/` custom URL slug | Not reliably resolvable via API. May change. | Accepted as Tier 3 input for surface registration (resolved to `UC...` if possible). |
| `/user/` legacy username | Legacy format. Limited API support. | Accepted as Tier 3 input for surface registration (resolved to `UC...` if possible). |
| Any full YouTube URL | URLs encode transport and presentation, not identity. URL formats change over time. | May be stored in `CgSurface.canonicalUrl` (reference only) or `YtSearchElement.url` (observed metadata only). |
| Video title | Not unique. Not stable. | May appear in `YtSearchElement.title` as observed metadata. |

---

## Format Validation Rules

### Channel ID format

```
^UC[A-Za-z0-9_-]{22}$
```

Total length: 24. Prefix: `UC`. Remainder: 22 base64url characters.

### Video ID format

```
^[A-Za-z0-9_-]{11}$
```

Total length: 11. All base64url characters.

### Playlist ID format

```
^[A-Za-z0-9_-]{10,}$
```

Minimum length: 10. Typically starts with `PL`, `UU`, `LL`, or `FL`. All base64url characters.

The minimum length of 10 prevents short noise strings from being accepted as playlist IDs. The actual typical length is 24–48 characters.

---

## Hammer-Verifiable Invariants

### Channel identity invariants

- `CgSurface(type = youtube).canonicalIdentifier` always matches `^UC[A-Za-z0-9_-]{22}$` (when non-null)
- No `CgSurface(type = youtube)` has `@handle` form in `canonicalIdentifier`
- Two different input forms that resolve to the same `UC...` ID produce the same `canonicalIdentifier` (no duplicates for the same real channel)
- The partial unique index on `(projectId, type, canonicalIdentifier)` prevents duplicate channel surfaces within a project

### Video identity invariants

- `YtSearchElement.videoId` always matches `^[A-Za-z0-9_-]{11}$` (when non-null)
- The same video appearing in different snapshots has the same `videoId` value (deterministic extraction)
- Video URLs are never stored in `videoId`

### Playlist identity invariants

- Playlist IDs stored on elements match `^[A-Za-z0-9_-]{10,}$` (when stored)
- Playlist URLs are never stored as the identity value

### Extraction determinism

- The normalizer is a pure function: same vendor payload → same extracted identities
- No API calls during extraction
- Missing or malformed vendor data → null identity fields, not extraction failure

### Cross-context consistency

- A `UC...` channel ID extracted from a vendor payload element matches the same `UC...` value stored in `CgSurface.canonicalIdentifier` for the same real-world channel
- This is the foundation of the ownership join. If this fails, project visibility diagnostics produce wrong results.

---

## Implementation Sequencing Note

The following must be true before the YouTube observatory goes live:

1. **Surface registration for `type = youtube` enforces `UC...` resolution before persisting `canonicalIdentifier`.** The Zod schema has been tightened to reject non-`UC...` values. When Tier 2/3 input support is added (handle resolution), it must resolve to `UC...` before the write.

2. **The vendor payload normalizer must be implemented as a pure function with no API calls.** Channel IDs that cannot be extracted from the vendor payload are stored as null and left for future enrichment.

These are not optional. They are prerequisites for correct observatory behavior.

---

## Summary

| Identity class | Canonical stored form | Format validation | Stored in | Input resolution allowed | API call during extraction |
|---|---|---|---|---|---|
| Channel | `UC` + 22 base64url chars | `^UC[A-Za-z0-9_-]{22}$` | `CgSurface.canonicalIdentifier`, `YtSearchElement.channelId` | Yes (surface registration only) | Never (extraction is pure) |
| Video | 11 base64url chars | `^[A-Za-z0-9_-]{11}$` | `YtSearchElement.videoId` | N/A (v1 has no operator video input) | Never |
| Playlist | `PL` / `UU` / etc + variable chars | `^[A-Za-z0-9_-]{10,}$` | `YtSearchElement` (via vendorFlags or future field) | N/A (v1 has no operator playlist input) | Never |

The single governing rule:

> **Durable identity fields store only canonical IDs. Everything else — handles, URLs, display names, custom slugs — is either resolved to a canonical ID at the boundary or stored separately as observed metadata. No exceptions. No "we'll normalize later."**
