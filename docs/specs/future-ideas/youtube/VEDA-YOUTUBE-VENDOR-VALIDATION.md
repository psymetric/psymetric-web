# VEDA YouTube Observatory — Vendor Payload Validation

## 1. Purpose

This document validates the provider payload assumptions that the YouTube data model (`VEDA-YOUTUBE-DATA-MODEL.md`) currently depends on before any schema or migration work begins.

It is not a research summary. It is a pre-implementation gate document. Its job is to distinguish what VEDA can safely model now from what must remain raw, and what still requires live payload inspection before any column or table is committed.

This document does **not** authorize schema changes, migrations, or implementation work.

---

## 2. Scope

**In scope:**

- DataForSEO YouTube Organic SERP as the declared primary vendor source
- Provider payload shape as relevant to `YtSearchSnapshot.rawPayload` and `YtSearchElement` extraction
- Field-level reliability assessment for identifier, structural, and metadata fields
- The first-class `YtSearchElement` row decision from the data model
- Block reconstruction feasibility
- Official cards and special module representation

**Out of scope:**

- YouTube Data API enrichment (Phase 2)
- Recommendation surface observation
- Autocomplete surface observation
- Pricing, quota, or DataForSEO operational concerns

---

## 3. Current Vendor Assumption

The data model currently assumes the following about DataForSEO YouTube Organic SERP payloads:

> Provider payloads are mostly flat item lists. Each item carries `rank_absolute`, `type`, and `block_name`. Video and channel identifiers are available on each item. An `is_shorts` flag is present on some items. A `check_url` field is available for verification. Block structure is not provider-native — it is a grouping reconstructed from `block_name` metadata hints, not from a real nested `blocks[]` structure.

The data model's architectural choices — first-class `YtSearchElement` rows, no first-class `Block` table, `blockType`/`blockRank` as element-level fields, `vendorFlags` as a safety valve — all depend on this assumption being correct.

This document assesses whether that assumption is sufficiently supported to proceed, or whether it must be verified before implementation begins.

---

## 4. Verified or Strongly Supported Payload Characteristics

The following characteristics are either confirmed by DataForSEO documentation, corroborated by multiple research sources, or follow necessarily from known DataForSEO patterns on other surfaces.

### 4.1 Flat item list structure

DataForSEO YouTube Organic SERP payloads return a flat array of result items. There is no native provider-side `blocks[]` array nesting items inside blocks. This is consistent with DataForSEO's approach on the Google Organic SERP surface, where the same flat-list-with-block-hints pattern is used.

**Status:** Strongly supported. The research documents reference DataForSEO's YouTube SERP items as a list with `block_name` annotations rather than a nested block structure. This is the assumption the data model was built on.

### 4.2 `rank_absolute` field

DataForSEO provides a `rank_absolute` field on each item representing the item's absolute position on the page across all result types. This maps directly to `YtSearchElement.rankAbsolute`.

**Status:** Confirmed by documentation. Multiple sources reference this field explicitly. It is the primary rank field and is the most reliable ranking signal in the payload.

### 4.3 `type` field (element type)

DataForSEO provides a `type` string on each item indicating the element type (e.g., video, channel, playlist, short). This is the basis for `YtSearchElement.elementType`.

**Status:** Confirmed. The data model's controlled vocabulary (`"video"`, `"short"`, `"channel"`, `"playlist"`, `"movie"`, `"ad"`, `"card"`, `"other"`) is derived from this field. The vendor may use different or additional type strings; the normalizer must map unknown types to `"other"`.

**Risk:** The exact vocabulary DataForSEO uses for `type` is not fully enumerated in available documentation. The normalizer must be written defensively with the full allowlist enforced at the application boundary.

### 4.4 `block_name` field

DataForSEO provides a `block_name` string on each item indicating which logical group or shelf the item belongs to (e.g., `"People also watched"`). This is the basis for `YtSearchElement.blockType`.

**Status:** Confirmed by documentation. The research documents reference `block_name` as an available field. However, this is a grouping annotation, not a structural container. Block reconstruction from `block_name` is an inference step, not a provider-native truth surface (see Section 7).

### 4.5 `is_shorts` flag

DataForSEO provides an `is_shorts` boolean flag on items that are YouTube Shorts. This maps to `YtSearchElement.isShort`.

**Status:** Confirmed by documentation. This is one of the more reliable element-classification fields in the payload. It removes ambiguity between short-form and long-form video items when the vendor provides it.

**Risk:** The flag may not be present on all items. Its absence should be treated as `null` (unknown), not `false` (confirmed non-Short). The normalizer must handle missing `is_shorts` explicitly.

### 4.6 `check_url` field

DataForSEO provides a `check_url` field on each item, which is a URL that can be used for manual spot-checking and verification against the live YouTube UI.

**Status:** Confirmed. The data model does not store `check_url` as a first-class column, but it is available in `rawPayload` and can be used during development validation.

### 4.7 Video identifiers on video-type items

DataForSEO is expected to provide video IDs or video URLs for items of video and short type. These are the basis for `YtSearchElement.videoId` extraction.

**Status:** Strongly supported by inference from known DataForSEO patterns. The exact field names (direct `video_id` vs URL fields requiring extraction) are not fully confirmed. The identity normalization spec already defines the extraction fallback chain (URL regex extraction if no direct ID field is present).

**Risk:** If DataForSEO does not provide a direct `video_id` field and provides only a URL, the normalizer must use URL extraction. URL extraction is reliable for standard `watch?v=` and `/shorts/` URL forms but may fail for unusual URL shapes.

### 4.8 Channel identifiers on video-type items

DataForSEO is expected to provide channel IDs or channel URLs for items that belong to a channel.

**Status:** Partially supported. Channel URLs in `https://youtube.com/channel/UC...` form are the most likely delivery format. If the vendor provides a `/channel/UC...` URL, the normalizer can extract the `UC...` channel ID directly. If the vendor provides a `/@handle` URL instead, `channelId` must be stored as null per the identity normalization contract (no API resolution during extraction).

**Risk:** This is a meaningful gap. If DataForSEO delivers channel identity via `@handle` URLs for some items, those items will have null `channelId` in `YtSearchElement`. This weakens channel dominance queries for those items. The prevalence of this case is not known without live payload inspection.

---

## 5. Weak or Uncertain Payload Characteristics

The following characteristics are inferred, partially documented, or structurally uncertain. They must not be treated as reliable for first-class schema design without live payload validation.

### 5.1 `rank_group` / `rank_within_block`

The existence and semantics of a within-block rank field are not fully confirmed by available documentation. The data model proposes `YtSearchElement.blockRank` for this purpose.

**Status:** Uncertain. DataForSEO surfaces on other verticals use `rank_group` for within-block positioning, but this field's presence and behavior on the YouTube Organic SERP surface has not been confirmed from available documentation.

**Consequence:** `blockRank` should remain a nullable field and the normalizer should treat it as optional. If the vendor does not provide it, the element is still stored with a null `blockRank`.

### 5.2 `channel_name` / `channel_title` field

Display names for channels on result items are expected but not explicitly confirmed as a top-level field.

**Status:** Inferred. Most SERP vendors include channel display names on video result items. The data model proposes `YtSearchElement.channelName` for this purpose. If the field is absent at the item level, it may need to be derived from nested metadata.

**Consequence:** `channelName` is observable metadata only — display names change and are never used as identity. Its absence does not break any invariant.

### 5.3 `title` field on all element types

Titles are expected on video and short items. Their presence on channel, playlist, movie, and ad items is not fully confirmed.

**Status:** Strongly expected but not confirmed across all element types. The normalizer must handle null titles gracefully.

### 5.4 `url` field format consistency

URLs are expected on each item but their format may vary by element type (video watch URLs, channel URLs, playlist URLs, Shorts URLs). Consistent URL format across all element types is not confirmed.

**Status:** Inferred. The normalizer must handle multiple URL forms per the identity normalization extraction rules.

### 5.5 Payload completeness at different result positions

DataForSEO payloads may have richer metadata on top-ranked items than on lower-ranked items. Completeness degradation at lower positions is not documented.

**Status:** Unknown. This is a live payload inspection concern.

### 5.6 Ads in the payload

DataForSEO may or may not include in-feed video ads in the YouTube Organic SERP payload. If ads are included, their `type` value, identifier fields, and rank semantics are uncertain.

**Status:** Uncertain. The data model's `elementType` allowlist includes `"ad"` and `"card"` to accommodate this, but the actual vendor representation of ads has not been confirmed. The normalizer must handle ad-type items without crashing if identifier fields are absent.

---

## 6. Identifier Availability and Reliability

### 6.1 `rank_absolute`

**Reliability:** High. This is a core DataForSEO field. It is the primary rank anchor for `YtSearchElement` and is the basis for the `@@unique([snapshotId, rankAbsolute])` constraint.

### 6.2 `videoId` (extracted from vendor payload)

**Reliability:** Medium-high for video and short items. Direct field availability is unconfirmed; extraction from URL is the fallback. The 11-character video ID format is stable and extraction is reliable from standard YouTube URL forms. Failures are possible for unusual URL formats, in which case `videoId` is stored as null.

### 6.3 `channelId` (extracted from vendor payload)

**Reliability:** Medium, with a significant conditional risk. If the vendor provides `/channel/UC...` URLs, extraction is reliable. If the vendor provides `/@handle` URLs for channel identity, `channelId` must be null per the normalization contract. The prevalence of `@handle`-only channel URL delivery in DataForSEO YouTube payloads is **the single most important gap requiring live payload inspection** (see Section 10).

### 6.4 `elementType` (from vendor `type` field)

**Reliability:** High for the field's existence; medium for its controlled vocabulary mapping. The vendor will provide a type string; the normalizer maps it to VEDA's allowlist. Unknown vendor types fall through to `"other"`.

### 6.5 `blockType` (from vendor `block_name` field)

**Reliability:** Medium. `block_name` is confirmed as a field, but its values are vendor-defined display strings (e.g., `"People also watched"`) that may be localized, change over releases, or be absent for items in the default organic list. Storing `blockType` as an optional string in `vendorFlags` or as a nullable column is appropriate. It must never be used as a join key or identity field.

### 6.6 `isShort` (from vendor `is_shorts` flag)

**Reliability:** High when present. The flag is confirmed. Absence must be treated as null, not false.

---

## 7. Block Reconstruction Feasibility

The data model's decision is: **no first-class `YtSearchBlock` table in v1**. Block grouping is reconstructed on read from `blockType` and `blockRank` fields on `YtSearchElement` rows.

This decision is validated by the following analysis.

### 7.1 The provider does not supply a native block structure

DataForSEO YouTube Organic SERP payloads are flat item lists. There is no `blocks[]` array. Block grouping is conveyed through per-item `block_name` annotation. This is confirmed by the research documents and consistent with DataForSEO's pattern on other surfaces.

**Consequence:** Any block-level representation in VEDA would be a reconstruction, not a provider-native truth. Materializing a `YtSearchBlock` table would be storing a derived interpretation as if it were observed fact. This would be wrong epistemically and fragile in practice.

### 7.2 `block_name` values are localized and unstable

`block_name` strings like `"People also watched"` are display-facing labels. They may be localized for non-English queries, may change across DataForSEO API versions, and may not be consistently present on all items. Using them as structured keys for a `Block` table would create normalization and stability problems.

**Consequence:** `blockType` stored as a nullable string on `YtSearchElement` is the correct approach. It preserves the vendor's annotation without promoting it to a structural table that would be fragile to vendor drift.

### 7.3 Block reconstruction from `block_name` is feasible for diagnostic purposes

Grouping `YtSearchElement` rows by `blockType` at read time produces a reasonable derived block view. This is adequate for diagnostic queries like "what fraction of results appear in a People-also-watched shelf." It is not observatory-grade structural truth.

**Consequence:** Block-level diagnostics can be built as compute-on-read groupings against `YtSearchElement`. No materialized block table is needed for v1 diagnostics.

### 7.4 Trustworthiness of reconstructed blocks

Block reconstruction from `block_name` should be treated as **low-fidelity structural inference**, not as verified page structure. Specifically:

- Items without a `block_name` (which may represent the primary organic result list) cannot be reliably distinguished from items whose `block_name` simply was not populated by the vendor.
- The ordering of items within a reconstructed block is `rank_absolute`-derived, not confirmed by a provider-native within-block rank.
- Two items with the same `block_name` in the same snapshot are assumed to be in the same block, but this assumption is not provably correct across all vendor payload shapes.

**Conclusion:** Block reconstruction is feasible and adequate for v1 diagnostics. It must be documented as a derived interpretation, not as verified page truth.

---

## 8. Implications for `YtSearchElement` First-Class Row Decision

The data model's most important architectural decision is that extracted elements get first-class rows in `YtSearchElement`. This decision is validated here against actual provider payload shape.

### 8.1 The flat item list structure supports first-class element rows

Because the provider payload is a flat list of items (not a nested `blocks[].elements[]` structure), the natural extraction unit is the individual item. Each item maps directly to one `YtSearchElement` row. This is a clean, low-impedance translation.

**Verdict:** The flat payload structure supports the first-class element row decision cleanly.

### 8.2 The diagnostic requirements justify indexed extraction

The cross-snapshot diagnostic queries that motivated first-class element rows — channel dominance over 90 days, video persistence across snapshots, type composition drift — require indexed access to `channelId`, `videoId`, `elementType`, and `rankAbsolute`. These cannot be efficiently served by JSON blob parsing at query time in a production observatory.

**Verdict:** The diagnostic requirements remain valid and independently justify first-class rows regardless of payload shape.

### 8.3 The payload shape does not justify a first-class Block table

The flat payload with `block_name` annotations does not provide a provider-native block structure. A first-class `YtSearchBlock` table would be storing VEDA-reconstructed groupings as if they were observed provider truth. This is the scenario the data model explicitly chose to avoid.

**Verdict:** The decision to omit a first-class `Block` table is validated. `blockType` and `blockRank` as nullable fields on `YtSearchElement` is the correct approach.

### 8.4 The `YtSearchElement` first-class row decision remains justified

The combination of flat provider payload structure (which maps cleanly to one-row-per-item) and cross-snapshot diagnostic requirements (which require indexed access) together justify the first-class element row decision. This decision is not based on an imaginary nested provider payload. It is based on the actual payload shape plus real observatory query needs.

**Verdict: The `YtSearchElement` first-class row decision remains justified and is validated against the actual provider payload shape.**

---

## 9. Fields Safe for First-Class Extraction vs Fields That Should Remain Raw

### 9.1 Fields safe for first-class extraction

These fields are reliable enough to justify indexed columns on `YtSearchElement`:

| Field | Column | Justification |
|---|---|---|
| Absolute rank | `rankAbsolute` | Core DataForSEO field, confirmed, basis for uniqueness constraint |
| Element type | `elementType` | Confirmed as available; normalizer enforces controlled vocabulary |
| Video ID | `videoId` | Extractable from standard URL forms; null on failure |
| Channel ID | `channelId` | Extractable from `/channel/UC...` URL; null if vendor provides `@handle` |
| Shorts flag | `isShort` | Confirmed when present; nullable |
| Channel display name | `channelName` | Expected on video items; nullable; observable metadata only |
| Element title | `title` | Expected on most items; nullable; observable metadata only |
| Element URL | `url` | Expected; nullable; observed metadata only, never identity |
| Block type annotation | `blockType` | From `block_name`; nullable; low-fidelity grouping hint |

### 9.2 Fields that should remain in `vendorFlags` or raw payload

These fields are too unstable, localized, display-only, or uncertain to justify dedicated columns:

| Field / concept | Reason to keep raw |
|---|---|
| `block_name` localized strings | Localized, vendor-defined display strings; not stable across languages or API versions |
| Within-block rank (`rank_group`) | Existence and semantics uncertain; keep in `vendorFlags` if present |
| Thumbnail URLs | Display-only; change frequently; not needed for observatory diagnostics |
| Duration / view count / like count | If present in SERP payload, these are point-in-time snapshots of engagement metadata; they belong in Phase 2 enrichment, not in SERP element rows |
| Snippet / description text | Display-only; not needed for structure or ranking diagnostics |
| Ad-specific fields | Type of ad, bid metadata, etc. — too uncertain and surface-specific to model in v1 |
| Special module fields | Official card fields, panel fields, shelf fields — representation uncertain; keep in rawPayload |

**`vendorFlags` usage contract:** Any field extracted from the vendor payload that does not have a dedicated column should be stored in `YtSearchElement.vendorFlags` as a JSON object. This preserves the data without promoting it to a column that would require schema migration to remove.

---

## 10. Open Validation Gaps Requiring Live Payload Inspection

The following questions cannot be answered from documentation and research alone. They require inspection of actual DataForSEO YouTube Organic SERP API responses before schema work begins.

### Gap 1 — Channel URL format (critical)

**Question:** Does DataForSEO deliver channel identity as `/channel/UC...` URLs (allowing direct `UC...` extraction) or as `/@handle` URLs (forcing null `channelId` per normalization rules)?

**Why it matters:** If a significant fraction of video items deliver channel identity only via `@handle` URLs, the channel dominance and project visibility diagnostics will be degraded for those items. The severity of this gap is unknown without live payload inspection.

**Action required:** Inspect at least one real DataForSEO YouTube Organic SERP response for multiple queries and check the channel URL field format for each result item.

### Gap 2 — Direct video ID field vs URL-only delivery

**Question:** Does DataForSEO provide a direct `video_id` field on video items, or is video ID only recoverable via URL extraction?

**Why it matters:** URL extraction is reliable for standard URL forms but introduces a processing step that could fail for unusual URL formats. A direct ID field is preferred.

**Action required:** Inspect a live payload and check for the presence of a dedicated video ID field.

### Gap 3 — `rank_group` / within-block rank field existence

**Question:** Does DataForSEO provide a within-block rank field (analogous to `rank_group` on other surfaces) for YouTube SERP items?

**Why it matters:** If the field exists, `YtSearchElement.blockRank` can be populated reliably. If it does not exist, `blockRank` will always be null and block-level rank ordering can only be inferred from `rankAbsolute` within grouped items.

**Action required:** Inspect a live payload for `rank_group` or equivalent field presence on items that share a `block_name`.

### Gap 4 — `block_name` presence on all items vs only shelf items

**Question:** Does `block_name` appear on all items (including items in the primary organic result list) or only on items that are in named shelves or modules?

**Why it matters:** If the primary organic list items have no `block_name` (or a generic placeholder), reconstructed block grouping will distinguish "primary organic" from "shelf" items naturally. If all items have a `block_name`, the grouping semantics must be interpreted differently.

**Action required:** Inspect a live payload and check `block_name` presence and values across organic vs shelf items.

### Gap 5 — Official cards and special modules representation

**Question:** Does DataForSEO include Official Cards, information panels, breaking news panels, or other structured non-organic modules in the YouTube SERP payload? If so, how are they typed and what fields do they carry?

**Why it matters:** Official Cards are a documented YouTube search page feature that inject channel/entity-specific modules. If DataForSEO captures them, they must be handled by the normalizer. If DataForSEO does not capture them, they are silently absent from VEDA's observations, which must be documented as a known observatory limitation.

**Action required:** Inspect a live payload for queries known to trigger Official Cards (e.g., popular music artist queries) and determine whether the card appears in the item list and with what type value.

### Gap 6 — Ad representation and field shape

**Question:** Does DataForSEO include in-feed video ads in the YouTube Organic SERP payload? If so, what `type` value is used and what identifier fields (if any) are present?

**Why it matters:** Ads must be distinguished from organic elements for `rankOrganic` calculation. If ads are included with identifiers, the normalizer must extract them correctly. If ads are included without identifiers, they are still stored (type=`"ad"`, null IDs).

**Action required:** Inspect a live payload for a query category where in-feed ads are common and determine ad item representation.

### Gap 7 — Payload completeness at lower rank positions

**Question:** Do items at rank positions 15–30 have the same field completeness as items at positions 1–10?

**Why it matters:** If the vendor truncates or degrades metadata on lower-ranked items, the normalizer must handle this gracefully and the observatory must document the completeness boundary.

**Action required:** Inspect a live payload and check field completeness across the full result set.

---

## 11. Final Recommendation

### What is safe to model now

The following can be designed and schema-prepared with confidence:

- `YtSearchSnapshot` — the snapshot model is independent of specific payload field shapes
- `YtQueryTarget` — not payload-dependent
- `YtSearchElement` with the following confirmed fields: `rankAbsolute`, `elementType`, `videoId` (nullable), `channelId` (nullable), `isShort` (nullable), `channelName` (nullable), `title` (nullable), `url` (nullable), `blockType` (nullable), `vendorFlags` (JSON)
- The normalizer architecture as a pure function with a controlled vocabulary allowlist and graceful null handling for missing fields

### What should remain raw until live payload inspection

The following must not become first-class columns or schema commitments until the gaps in Section 10 are resolved:

- `blockRank` — confirm `rank_group` or equivalent field exists before adding column
- Any Official Card or special module fields — confirm representation before any typed handling
- Ad-specific fields — confirm ad item shape before typed handling

### Whether to proceed to schema work

**Do not begin migrations before resolving Gap 1 (channel URL format).** This is the highest-risk open question and directly affects the reliability of the observatory's primary ownership diagnostic (project visibility via `channelId` matching). If DataForSEO delivers channel identity via `@handle` URLs for a large fraction of results, the observatory will have structurally degraded channel diagnostics from day one, and this must be a known and documented limitation before schema work begins.

All other gaps are important but do not block the schema decision. They affect normalizer implementation details, not core table structure.

### Summary judgment

The current `YtSearchElement` first-class row decision is **validated** against the actual provider payload shape. The data model's architectural choices are sound given the available evidence. One live payload inspection session — focused on channel URL format, video ID field presence, `block_name` coverage, and Official Card representation — is the required next step before migrations are written.

---

## Document Metadata

**Status:** Pre-implementation gate document. Does not authorize schema or migration work.

**Phase:** Future-ideas / pre-implementation design

**Predecessor documents:**
- `VEDA-YOUTUBE-DATA-MODEL.md`
- `VEDA-YOUTUBE-IDENTITY-NORMALIZATION.md`
- `VEDA-YOUTUBE-TRUTH-SURFACE-DECISION.md`
- `VEDA-YOUTUBE-SPEC-TRANSLATION-NOTE.md`
- `VEDA-YOUTUBE-OBSERVATORY-CHANNEL-FIRST-NOTE.md`
- `YouTube Search Structure and Ranking Behavior for a SERP-Style Observatory.md`

**Next required action:** Live DataForSEO YouTube Organic SERP payload inspection (see Section 10, Gap 1 as priority).
