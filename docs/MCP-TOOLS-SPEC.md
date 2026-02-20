# MCP Tools Specification (Phase 1 Read-Only Bridge)

**Version:** 1.0  
**Status:** Phase 1 — VS Code Operator Surface + MCP Read-Only Bridge  
**Scope:** Read-only MCP bridge to backend APIs  
**Last Updated:** 2026-02-20

---

## 1. Overview

This specification defines the **read-only MCP tool interface** for Phase 1 of PsyMetric. These tools provide structured access to backend APIs via the Model Context Protocol.

### Phase 1 Scope

- **Read-only operations only** — No write capabilities
- **Backend API access only** — No direct database access
- **Project-scoped operations** — All queries respect project isolation
- **Deterministic behavior** — Explicit ordering, no implicit sort, stable pagination

### Architecture

```
MCP Client (VS Code Extension)
    ↓
MCP Server (Tool Handler)
    ↓ HTTP
Backend API (Next.js API Routes)
    ↓
PostgreSQL (Canonical State)
```

The MCP server is a **thin adapter layer**. All authorization, validation, and business logic remain in the backend API.

---

## 2. Project Scoping Rules

### Request Headers

Every MCP tool request **must** include project identification via one of:

| Header | Format | Example |
|--------|--------|---------|
| `x-project-id` | UUID | `00000000-0000-4000-a000-000000000001` |
| `x-project-slug` | Lowercase alphanumeric + hyphens | `psymetric` |

If neither header is provided, the backend falls back to `DEFAULT_PROJECT_ID` (currently `00000000-0000-4000-a000-000000000001`).

### Resolution Behavior

The backend resolves `projectId` via `resolveProjectId()` in this priority order:

1. `x-project-id` header (validated as UUID)
2. `x-project-slug` header (slug → UUID lookup)
3. `projectId` cookie
4. `DEFAULT_PROJECT_ID`

### Cross-Project Isolation

- All queries are scoped by `projectId`
- Cross-project entity references return `404 NOT_FOUND` (existence not confirmed)
- No data leakage across projects

---

## 3. Determinism Rules

### Ordering Guarantees

All list operations **must** specify explicit ordering. No implicit database ordering is allowed.

**Standard patterns:**

| Operation Type | Primary Order | Tie-Breaker | Example |
|----------------|---------------|-------------|---------|
| Chronological lists | `createdAt desc` | `id desc` | Entities, quotable blocks, relationships |
| Alphabetical lists | `slug asc` | `id asc` | Projects |
| Date-range lists | `dateStart desc`, `dateEnd desc` | `query asc`, `pageUrl asc`, `id desc` | Search performance |

Ordering is **immutable** — filters do not alter sort order.

### Pagination

All list operations return paginated results with this envelope:

```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "hasMore": true
  }
}
```

**Constraints:**
- `page`: 1-indexed (minimum 1)
- `limit`: 1-100 (default 20)
- `total`: Total count matching filter criteria
- `hasMore`: `true` if `page * limit < total`

---

## 4. Error Envelope

All errors use this canonical structure:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message"
  }
}
```

### Error Codes

| Code | HTTP Status | When Used |
|------|-------------|-----------|
| `BAD_REQUEST` | 400 | Invalid input (malformed UUID, invalid enum, missing required field) |
| `UNAUTHORIZED` | 401 | Missing or invalid authentication credentials |
| `FORBIDDEN` | 403 | Valid credentials but insufficient permissions |
| `NOT_FOUND` | 404 | Resource does not exist OR cross-project access attempted |
| `CONFLICT` | 409 | Resource conflict (e.g., duplicate slug) |
| `SERVER_ERROR` | 500 | Internal server error |

**Cross-project access security:** When attempting to access an entity belonging to a different project, the backend returns `404 NOT_FOUND` without confirming the entity's existence. This prevents project enumeration attacks.

---

## 5. Phase 1 Explicit Exclusions (Non-Goals)

The following are **explicitly out of scope** for Phase 1:

- ❌ Write tools (create, update, delete)
- ❌ LLM broker integration
- ❌ Background jobs or scheduled ingestion
- ❌ Automated ingestion workflows
- ❌ Caching layers
- ❌ Patch generation or auto-apply systems
- ❌ Draft artifact manipulation
- ❌ Direct database access from MCP

These may be introduced in future phases with explicit roadmap amendments.

---

## 6. Tool Definitions

### Tool 1: `list_projects`

**Purpose:** List all projects accessible to the current user.

**Input Schema:**

```typescript
{
  page?: number;      // 1-indexed, default 1, min 1
  limit?: number;     // default 20, min 1, max 100
}
```

**Output Schema:**

```typescript
{
  data: Array<{
    id: string;           // UUID
    slug: string;         // URL-safe identifier
    name: string;
    description: string | null;
    createdAt: string;    // ISO 8601
    updatedAt: string;    // ISO 8601
  }>,
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  }
}
```

**Ordering Guarantee:** `slug asc, id asc`

**Error Conditions:**
- `BAD_REQUEST`: Invalid `page` or `limit` values

**Backend Endpoint:** `GET /api/projects`

**Notes:**
- Returns all projects (no user-level access control in Phase 1)
- Future phases will filter by user permissions

---

### Tool 2: `search_entities`

**Purpose:** Search and filter entities within a project.

**Input Schema:**

```typescript
{
  projectId: string;         // UUID, required
  entityType?: "guide" | "concept" | "project" | "news";
  status?: "draft" | "publish_requested" | "published" | "archived";
  conceptKind?: "standard" | "model" | "comparison";  // Only valid for concepts
  search?: string;           // Searches title and slug (case-insensitive contains)
  page?: number;             // 1-indexed, default 1
  limit?: number;            // default 20, max 100
}
```

**Output Schema:**

```typescript
{
  data: Array<{
    id: string;                // UUID
    projectId: string;         // UUID
    entityType: "guide" | "concept" | "project" | "news";
    title: string;
    slug: string;
    summary: string | null;
    difficulty: "beginner" | "intermediate" | "advanced" | null;
    conceptKind: "standard" | "model" | "comparison" | null;
    repoUrl: string | null;    // Projects only
    status: "draft" | "publish_requested" | "published" | "archived";
    canonicalUrl: string | null;
    lastVerifiedAt: string | null;  // ISO 8601
    createdAt: string;         // ISO 8601
    updatedAt: string;         // ISO 8601
  }>,
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  }
}
```

**Ordering Guarantee:** `createdAt desc, id desc`

**Error Conditions:**
- `BAD_REQUEST`: Invalid UUID format for `projectId`
- `BAD_REQUEST`: Invalid enum value for `entityType`, `status`, `conceptKind`
- `NOT_FOUND`: Project does not exist

**Backend Endpoint:** `GET /api/entities`

**Notes:**
- `search` performs case-insensitive substring match on `title` and `slug`
- Filtering does not change ordering
- `conceptKind` is only relevant when `entityType=concept`

---

### Tool 3: `get_entity`

**Purpose:** Retrieve a single entity by ID with full details.

**Input Schema:**

```typescript
{
  projectId: string;  // UUID, required
  entityId: string;   // UUID, required
}
```

**Output Schema:**

```typescript
{
  data: {
    id: string;
    projectId: string;
    entityType: "guide" | "concept" | "project" | "news";
    title: string;
    slug: string;
    summary: string | null;
    difficulty: "beginner" | "intermediate" | "advanced" | null;
    conceptKind: "standard" | "model" | "comparison" | null;
    repoUrl: string | null;
    status: "draft" | "publish_requested" | "published" | "archived";
    canonicalUrl: string | null;
    lastVerifiedAt: string | null;
    createdAt: string;
    updatedAt: string;
  }
}
```

**Error Conditions:**
- `BAD_REQUEST`: Invalid UUID format
- `NOT_FOUND`: Entity does not exist OR belongs to different project (no existence confirmation)

**Backend Endpoint:** `GET /api/entities/:id`

**Notes:**
- Returns `404` for cross-project access without confirming entity existence
- Single-entity response (no pagination envelope)

---

### Tool 4: `get_entity_graph`

**Purpose:** Retrieve an entity with its relationship graph up to a specified depth.

**Input Schema:**

```typescript
{
  projectId: string;       // UUID, required
  entityId: string;        // UUID, required
  depth?: 1 | 2;           // Default 1, max 2
  relationshipTypes?: string;  // Comma-separated list of RelationType values
}
```

**Valid Relationship Types:**
```
GUIDE_USES_CONCEPT, GUIDE_EXPLAINS_CONCEPT, GUIDE_REFERENCES_SOURCE,
CONCEPT_RELATES_TO_CONCEPT, CONCEPT_REFERENCES_SOURCE,
NEWS_DERIVED_FROM_SOURCE, NEWS_REFERENCES_SOURCE, NEWS_REFERENCES_CONCEPT,
PROJECT_IMPLEMENTS_CONCEPT, PROJECT_REFERENCES_SOURCE, PROJECT_HAS_GUIDE,
DISTRIBUTION_PROMOTES_GUIDE, DISTRIBUTION_PROMOTES_CONCEPT,
DISTRIBUTION_PROMOTES_PROJECT, DISTRIBUTION_PROMOTES_NEWS,
VIDEO_EXPLAINS_GUIDE, VIDEO_EXPLAINS_CONCEPT,
VIDEO_EXPLAINS_PROJECT, VIDEO_EXPLAINS_NEWS
```

**Output Schema:**

```typescript
{
  data: {
    rootEntity: {
      id: string;
      projectId: string;
      entityType: string;
      title: string;
      slug: string;
      summary: string | null;
      difficulty: string | null;
      conceptKind: string | null;
      repoUrl: string | null;
      status: string;
      canonicalUrl: string | null;
      lastVerifiedAt: string | null;
      createdAt: string;
      updatedAt: string;
    },
    relationships: Array<{
      id: string;
      relationType: string;
      fromEntityId: string;
      toEntityId: string;
      notes: string | null;
      createdAt: string;
      relatedEntity: {
        id: string;
        entityType: string;
        title: string;
        slug: string;
        status: string;
      } | null;
    }>,
    depth: 1 | 2;
  }
}
```

**Ordering Guarantee:** 
- Relationships: `createdAt desc, id desc`
- Entity IDs sorted deterministically (`id asc`) before fetch

**Depth Semantics:**
- `depth=1`: Returns direct relationships where root entity is `fromEntityId` OR `toEntityId`
- `depth=2`: Expands one hop further — relationships of depth-1 entities (within project boundaries)

**Error Conditions:**
- `BAD_REQUEST`: Invalid UUID format
- `BAD_REQUEST`: Invalid `depth` value (must be 1 or 2)
- `BAD_REQUEST`: Invalid relationship type in filter
- `NOT_FOUND`: Entity does not exist OR belongs to different project

**Backend Endpoint:** `GET /api/entities/:id/graph`

**Notes:**
- Graph traversal respects project boundaries (no cross-project edges)
- If `relationshipTypes` filter is empty or omitted, all types are included
- Related entities include minimal fields only (id, entityType, title, slug, status)
- Deterministic BFS expansion with stable ordering at each step

---

### Tool 5: `list_search_performance`

**Purpose:** List Google Search Console performance records for a project.

**Input Schema:**

```typescript
{
  projectId: string;        // UUID, required
  query?: string;           // Case-insensitive substring match
  pageUrl?: string;         // Case-insensitive substring match
  entityId?: string;        // UUID, exact match
  dateStart?: string;       // ISO 8601 date (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ssZ)
  dateEnd?: string;         // ISO 8601 date (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ssZ)
  page?: number;            // 1-indexed, default 1
  limit?: number;           // default 20, max 100
}
```

**Output Schema:**

```typescript
{
  data: Array<{
    id: string;              // UUID
    projectId: string;       // UUID
    entityId: string | null; // UUID, linked entity if matched
    pageUrl: string;
    query: string;           // Search query from GSC
    impressions: number;     // Search impressions
    clicks: number;          // Click count
    ctr: number;             // Click-through rate (0.0-1.0)
    avgPosition: number;     // Average SERP position (>0)
    dateStart: string;       // ISO 8601
    dateEnd: string;         // ISO 8601
    capturedAt: string;      // ISO 8601
  }>,
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  }
}
```

**Ordering Guarantee:** `dateStart desc, dateEnd desc, query asc, pageUrl asc, id desc`

**Error Conditions:**
- `BAD_REQUEST`: Invalid UUID format for `projectId` or `entityId`
- `BAD_REQUEST`: Invalid ISO date format for `dateStart` or `dateEnd`
- `BAD_REQUEST`: `dateStart > dateEnd` when both provided
- `NOT_FOUND`: Project does not exist

**Backend Endpoint:** `GET /api/seo/search-performance`

**Notes:**
- Date filters accept `YYYY-MM-DD` (date-only) or `YYYY-MM-DDTHH:mm:ssZ` (UTC timestamp)
- Locale formats and non-UTC timezone offsets are rejected
- `entityId` is nullable — not all URLs map to entities
- Ordering is stable across pagination
- GSC data typically has ~3 day delay (Google-side limitation)

---

### Tool 6: `list_quotable_blocks`

**Purpose:** List quotable citation blocks for GEO optimization within a project.

**Input Schema:**

```typescript
{
  projectId: string;                  // UUID, required
  entityId?: string;                  // UUID, filter by parent entity
  claimType?: "statistic" | "comparison" | "definition" | "howto_step";
  topicTag?: string;                  // Case-insensitive substring match
  verifiedUntilBefore?: string;       // ISO 8601 date
  verifiedUntilAfter?: string;        // ISO 8601 date
  page?: number;                      // 1-indexed, default 1
  limit?: number;                     // default 20, max 100
}
```

**Output Schema:**

```typescript
{
  data: Array<{
    id: string;                       // UUID
    projectId: string;                // UUID
    entityId: string;                 // UUID of parent entity
    text: string;                     // Self-contained statement (25-50 words)
    claimType: "statistic" | "comparison" | "definition" | "howto_step";
    sourceCitation: string | null;    // External source reference
    verifiedUntil: string | null;     // ISO 8601, when claim expires
    topicTag: string | null;          // Concept label for grouping
    createdAt: string;                // ISO 8601
    updatedAt: string;                // ISO 8601
  }>,
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  }
}
```

**Ordering Guarantee:** `createdAt desc, id desc`

**Error Conditions:**
- `BAD_REQUEST`: Invalid UUID format for `projectId` or `entityId`
- `BAD_REQUEST`: Invalid `claimType` enum value
- `BAD_REQUEST`: Invalid ISO date format for verification filters
- `NOT_FOUND`: Project does not exist

**Backend Endpoint:** `GET /api/quotable-blocks`

**Notes:**
- Quotable blocks are canonical GEO citation assets (not draft artifacts)
- `text` should be self-contained and extractable without surrounding context
- Date filters on `verifiedUntil` enable freshness tracking
- `topicTag` enables concept-based grouping and retrieval

---

## 7. UUID Validation

All UUID parameters must match this pattern:

```
^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$
```

(Case-insensitive, standard RFC 4122 format)

Invalid UUIDs return `BAD_REQUEST` error.

---

## 8. ISO Date Validation

Date parameters accept two formats only:

| Format | Pattern | Example |
|--------|---------|---------|
| Date-only | `YYYY-MM-DD` | `2025-02-20` |
| UTC timestamp | `YYYY-MM-DDTHH:mm:ss.sssZ` | `2025-02-20T14:30:00.000Z` |

**Rejected formats:**
- Locale formats (MM/DD/YYYY, DD.MM.YYYY)
- Timezone offsets other than Z (+00:00, -05:00, etc.)
- Timestamps without Z suffix

Invalid dates return `BAD_REQUEST` error.

---

## 9. Enum Validation

All enum parameters must match exact values from the canonical lists in `src/lib/validation.ts`:

**Entity Types:** `guide`, `concept`, `project`, `news`

**Entity Statuses:** `draft`, `publish_requested`, `published`, `archived`

**Concept Kinds:** `standard`, `model`, `comparison`

**Difficulties:** `beginner`, `intermediate`, `advanced`

**Claim Types:** `statistic`, `comparison`, `definition`, `howto_step`

**Relationship Types:** (18 types, see Tool 4 documentation)

Invalid enum values return `BAD_REQUEST` with message listing valid options.

---

## 10. Summary

This specification defines **6 read-only MCP tools** for Phase 1:

| Tool | Purpose | Backend Endpoint |
|------|---------|------------------|
| `list_projects` | List accessible projects | ✅ `GET /api/projects` |
| `search_entities` | Search/filter entities | ✅ `GET /api/entities` |
| `get_entity` | Get single entity details | ✅ `GET /api/entities/:id` |
| `get_entity_graph` | Get entity with relationship graph | ✅ `GET /api/entities/:id/graph` |
| `list_search_performance` | List GSC performance data | ✅ `GET /api/seo/search-performance` |
| `list_quotable_blocks` | List GEO citation blocks | ✅ `GET /api/quotable-blocks` |

**Key Principles:**
- Read-only operations only
- Project-scoped queries with isolation enforcement
- Deterministic ordering with tie-breakers
- Standard error and pagination envelopes
- Explicit validation (no silent failures)

---

**End of MCP Tools Specification v1.0**
