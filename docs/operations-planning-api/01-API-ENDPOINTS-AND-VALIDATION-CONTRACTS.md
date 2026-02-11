# API Endpoints & Validation Contracts

## Purpose
This document defines the **canonical API contracts** for PsyMetric.

It exists to:
- prevent dashboard and extension drift
- enforce system invariants at the API boundary
- make implementation predictable for humans and LLMs
- ensure validation happens before publishing, not after

This is a **v1 contract document**. If behavior is not defined here, it is out of scope.

---

## Guiding Principles

1. APIs enforce invariants — UIs do not.
2. All state changes are explicit and evented.
3. No endpoint performs irreversible actions without human intent.
4. Validation is deterministic and repeatable.
5. LLMs may propose data but never finalize state.

---

## Authentication & Identity (v1)

### Operator Identity
- v1 assumes a **single human operator**.
- Operator identity is derived from authenticated session (email or equivalent).
- All write actions record the operator as `actor = human`.

Extension and internal tools authenticate as the same operator.

---

## Common Response Schemas

### Success Response (Single Entity)

```json
{
  "data": {
    "id": "uuid",
    "...fields"
  }
}
```

### Success Response (List)

```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 42,
    "hasMore": true
  }
}
```

### Error Response

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Human-readable message",
    "details": [
      {
        "code": "RELATIONSHIP_MISSING",
        "field": "relationships",
        "message": "Guide must reference at least one Concept"
      }
    ]
  }
}
```

### HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success (read/update) |
| 201 | Created |
| 400 | Bad request / validation error |
| 401 | Unauthorized |
| 404 | Not found |
| 409 | Conflict (e.g., invalid state transition) |
| 429 | Rate limited |
| 500 | Server error |

---

## Pagination Contract

All list endpoints support pagination via query parameters:

```
?page=1&limit=20
```

**Parameters:**
- `page` — 1-indexed page number (default: 1)
- `limit` — items per page (default: 20, max: 100)

**Response includes:**
- `pagination.page` — current page
- `pagination.limit` — items per page
- `pagination.total` — total item count
- `pagination.hasMore` — boolean

---

## Source Capture Endpoints

### POST /api/source-items/capture

Creates a new SourceItem.

**Required Fields**
- `sourceType` (enum: rss | webpage | comment | reply | video | other)
- `url` (string)
- `operatorIntent` (string, required — why this was captured)

**Optional Fields**
- `platform` (enum: website | x | youtube | github | other)
- `notes` (string)

**Behavior**
- Creates SourceItem with status = `ingested`
- Generates `contentHash` from URL
- Logs `SOURCE_CAPTURED` event
- Rejects requests missing `operatorIntent`

**Response (201 Created)**
```json
{
  "data": {
    "id": "uuid",
    "sourceType": "webpage",
    "url": "...",
    "status": "ingested",
    "capturedAt": "ISO8601",
    "createdAt": "ISO8601"
  }
}
```

#### Duplicate URL Handling

`SourceItem.url` is unique. If a capture request is made with a URL that already exists:

- The existing SourceItem is reused. No new row is created.
- Status is **not** changed automatically.
- A new `SOURCE_CAPTURED` event is logged with `details.recapture = true`.
- The event details include the provided `operatorIntent`, `sourceType`, and optional `notes`.
- If `notes` is provided, it is appended to the existing SourceItem notes using a timestamped format (`[Recapture <ISO8601>]: <notes>`). Existing notes are never overwritten.

**Response behavior:**
- `201 Created` — new SourceItem was created
- `200 OK` — existing SourceItem was reused (recapture)

The response body shape is identical in both cases.

---

### GET /api/source-items

Lists SourceItems with filtering.

**Query Parameters**
- `status` (ingested | triaged | used | archived)
- `sourceType` (rss | webpage | comment | reply | video | other)
- `platform` (website | x | youtube | github | other)
- `page`, `limit`

**Response (200 OK)**
```json
{
  "data": [
    { "id": "...", "sourceType": "...", "status": "...", ... }
  ],
  "pagination": { ... }
}
```

---

### PUT /api/source-items/{id}/status

Updates SourceItem status (triage action).

**Required Fields**
- `status` (ingested | triaged | used | archived)

**Optional Fields**
- `notes` (string — triage reasoning)

**Behavior**
- Updates status
- Logs `SOURCE_TRIAGED` event

**Response (200 OK)**
```json
{
  "data": {
    "id": "uuid",
    "status": "triaged",
    "updatedAt": "ISO8601"
  }
}
```

---

## Entity Endpoints

### POST /api/entities

Creates a draft entity.

**Required Fields**
- `entityType` (concept | guide | project | news)
- `title` (string)

**Optional Fields**
- `slug` (string — auto-generated if omitted)
- `summary` (string)
- `difficulty` (beginner | intermediate | advanced)
- `conceptKind` (standard | model | comparison) — only for concepts
- `repoUrl` (string) — required for projects
- `llmAssisted` (boolean) — true if content was drafted with LLM assistance

**Behavior**
- Entity is created with status = `draft`
- Logs `ENTITY_CREATED` event
- If `llmAssisted` is true, stores `details.llmAssisted: true` in EventLog

**Response (201 Created)**
```json
{
  "data": {
    "id": "uuid",
    "entityType": "guide",
    "title": "...",
    "slug": "...",
    "status": "draft",
    "createdAt": "ISO8601"
  }
}
```

---

### GET /api/entities

Lists entities with filtering.

**Query Parameters**
- `entityType` (concept | guide | project | news)
- `status` (draft | publish_requested | published | archived)
- `conceptKind` (standard | model | comparison) — only for concepts
- `search` (string — matches title or slug)
- `page`, `limit`

**Response (200 OK)**
```json
{
  "data": [
    { "id": "...", "entityType": "...", "title": "...", "status": "...", ... }
  ],
  "pagination": { ... }
}
```

---

### GET /api/entities/{id}

Retrieves a single entity.

**Response (200 OK)**
```json
{
  "data": {
    "id": "uuid",
    "entityType": "guide",
    "title": "...",
    "slug": "...",
    "summary": "...",
    "status": "draft",
    "contentRef": "content/guides/my-guide.mdx",
    "createdAt": "ISO8601",
    "updatedAt": "ISO8601"
  }
}
```

---

### PUT /api/entities/{id}

Updates a draft entity.

**Rules**
- Only allowed when status = `draft`
- Partial updates permitted
- Validation may be triggered but does not auto-publish

**Optional Metadata**
- `llmAssisted` (boolean) — true if this update was drafted with LLM assistance

**Behavior**
- Logs `ENTITY_UPDATED` event
- If `llmAssisted` is true, stores `details.llmAssisted: true` in EventLog

**Response (200 OK)**
```json
{
  "data": {
    "id": "uuid",
    "...updated fields",
    "updatedAt": "ISO8601"
  }
}
```

---

### POST /api/entities/{id}/archive

Archives an entity.

**Rules**
- Allowed from any status except `archived`

**Behavior**
- Sets status = `archived`
- Sets `archivedAt` timestamp
- Logs `ENTITY_ARCHIVED` event

**Response (200 OK)**
```json
{
  "data": {
    "id": "uuid",
    "status": "archived",
    "archivedAt": "ISO8601"
  }
}
```

---

### GET /api/entities/{id}/events

Retrieves event history for an entity.

**Query Parameters**
- `limit` (default: 50, max: 100)

**Response (200 OK)**
```json
{
  "data": [
    {
      "id": "uuid",
      "eventType": "ENTITY_CREATED",
      "actor": "human",
      "timestamp": "ISO8601",
      "details": { "llmAssisted": true }
    }
  ]
}
```

---

### GET /api/entities/{id}/preview

Returns preview data for an entity (draft or published).

**Rules**
- Does not change entity state
- Returns rendered content structure for preview display

**Response (200 OK)**
```json
{
  "data": {
    "id": "uuid",
    "title": "...",
    "slug": "...",
    "previewUrl": "/preview/guides/my-guide",
    "content": { ... },
    "relationships": [ ... ],
    "validationStatus": "pass" | "fail"
  }
}
```

---

## Relationship Endpoints

### POST /api/relationships

Creates a relationship between entities.

**Required Fields**
- `fromEntityType` (guide | concept | project | news | distributionEvent | video)
- `fromEntityId` (UUID)
- `toEntityType` (guide | concept | project | news | sourceItem)
- `toEntityId` (UUID)
- `relationType` (see Doc 07 for canonical list)

**Optional Fields**
- `notes` (string)

**Behavior**
- Validates both entities exist
- Validates relationType is valid for the given entity type pair
- Logs `RELATION_CREATED` event

**Response (201 Created)**
```json
{
  "data": {
    "id": "uuid",
    "fromEntityType": "guide",
    "fromEntityId": "...",
    "toEntityType": "concept",
    "toEntityId": "...",
    "relationType": "GUIDE_USES_CONCEPT",
    "createdAt": "ISO8601"
  }
}
```

---

### GET /api/relationships

Lists relationships for an entity.

**Query Parameters**
- `entityId` (required — the entity to query relationships for)
- `direction` (from | to | both) — default: both
- `relationType` (optional filter)

**Response (200 OK)**
```json
{
  "data": [
    {
      "id": "uuid",
      "fromEntityType": "guide",
      "fromEntityId": "...",
      "toEntityType": "concept",
      "toEntityId": "...",
      "relationType": "GUIDE_USES_CONCEPT"
    }
  ]
}
```

---

### DELETE /api/relationships/{id}

Removes a relationship.

**Behavior**
- Deletes the relationship
- Logs `RELATION_REMOVED` event

**Response (200 OK)**
```json
{
  "data": {
    "id": "uuid",
    "deleted": true
  }
}
```

---

## Validation Endpoint

### POST /api/entities/{id}/validate

Runs validation checks without changing publish state.

**Validation Categories**
- Anatomy (required sections)
- Relationships (required links)
- Citations (where applicable)
- Metadata (SEO readiness)
- Content (contentRef validity)

**Behavior**
- Returns pass/fail + error list
- On failure, logs `ENTITY_VALIDATION_FAILED` event

**Response (200 OK)**
```json
{
  "data": {
    "status": "fail",
    "categories": {
      "anatomy": "pass",
      "relationships": "fail",
      "citations": "pass",
      "metadata": "pass",
      "content": "pass"
    },
    "errors": [
      {
        "code": "RELATIONSHIP_MISSING",
        "category": "relationships",
        "level": "BLOCKING",
        "message": "Guide must reference at least one Concept"
      }
    ]
  }
}
```

---

## Publish Request Flow

### POST /api/entities/{id}/request-publish

Submits an entity for review.

**Rules**
- Entity must be in `draft`
- Validation must pass (auto-runs if not recent)

**Behavior**
- Sets status = `publish_requested`
- Logs `ENTITY_PUBLISH_REQUESTED` event

**Response (200 OK)**
```json
{
  "data": {
    "id": "uuid",
    "status": "publish_requested",
    "updatedAt": "ISO8601"
  }
}
```

**Error (409 Conflict)**
```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Cannot request publish: validation failed",
    "details": [ ... ]
  }
}
```

---

### POST /api/entities/{id}/publish

Final publish action (human-only).

**Rules**
- Only allowed when status = `publish_requested`

**Behavior**
- Sets status = `published`
- Sets `publishedAt` timestamp
- Logs `ENTITY_PUBLISHED` event

**Response (200 OK)**
```json
{
  "data": {
    "id": "uuid",
    "status": "published",
    "publishedAt": "ISO8601",
    "canonicalUrl": "/guides/my-guide"
  }
}
```

---

### POST /api/entities/{id}/reject

Rejects a publish request.

**Optional Fields**
- `reason` (string — rejection explanation)

**Behavior**
- Sets status back to `draft`
- Logs `ENTITY_PUBLISH_REJECTED` event with reason

**Response (200 OK)**
```json
{
  "data": {
    "id": "uuid",
    "status": "draft",
    "updatedAt": "ISO8601"
  }
}
```

---

## Distribution Event Endpoints

### POST /api/distribution-events

Records manual distribution intent.

**Required Fields**
- `platform` (x | linkedin | other)
- `primaryEntityType` (guide | concept | project | news)
- `primaryEntityId` (UUID)
- `contentText` (string — draft post copy)

**Behavior**
- Creates DistributionEvent with status = `draft`
- No automation — no external posting
- Logs `DISTRIBUTION_CREATED` event

**Response (201 Created)**
```json
{
  "data": {
    "id": "uuid",
    "platform": "x",
    "status": "draft",
    "primaryEntityType": "guide",
    "primaryEntityId": "...",
    "createdAt": "ISO8601"
  }
}
```

---

### PUT /api/distribution-events/{id}

Updates a distribution event.

**Allowed Fields**
- `status` (draft | planned | published | archived)
- `contentText` (string)
- `externalUrl` (string — URL of actual post, set after manual posting)
- `postedAt` (ISO8601 — when operator manually posted)

**Rules**
- Setting status to `published` requires `externalUrl` and `postedAt`

**Behavior**
- Logs appropriate event:
  - `DISTRIBUTION_PLANNED` when status → planned
  - `DISTRIBUTION_PUBLISHED` when status → published

**Response (200 OK)**
```json
{
  "data": {
    "id": "uuid",
    "status": "published",
    "externalUrl": "https://x.com/...",
    "postedAt": "ISO8601",
    "updatedAt": "ISO8601"
  }
}
```

---

## Invariants (Non-Negotiable)

- No endpoint auto-publishes content
- Validation never mutates publish state
- All writes generate events
- LLMs cannot call publish endpoints
- Event types match canonical vocabulary (Doc 07)

---

## Status
This document defines the canonical API contract for v1.

End of document.
