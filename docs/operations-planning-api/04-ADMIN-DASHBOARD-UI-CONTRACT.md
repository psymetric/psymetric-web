# Admin Dashboard UI Contract (v1)

## Purpose
This document defines the **operator-facing UI behaviors** for the Admin Dashboard.

It exists to:
- keep UI behavior aligned with API contracts
- prevent workflow logic from drifting into the frontend
- make human-gated publishing explicit and unmistakable
- give LLMs a clear, bounded surface to assist without authority

The Admin Dashboard functions as a **custom CMS** that edits canonical DB state through defined APIs.

---

## Scope

This contract covers:
- required dashboard screens
- allowed user actions per screen
- UI → API call mapping
- validation, preview, and publishing gates
- error and feedback behavior

Out of scope:
- visual design and branding
- component library choices
- multi-operator roles (v1 assumes a single operator)

---

## Core Principles

1. **The UI never bypasses API rules.**
2. **All state transitions are explicit.**
3. **Publishing must feel deliberate.**
4. **Validation feedback must be actionable.**
5. **LLM assistance is visible and attributable.**

---

## Global Dashboard Requirements

### Authentication
- Dashboard access requires an authenticated operator session.
- Draft, inbox, and publish queue views are inaccessible when logged out.

### Lists, Search, and Filtering
All list views must support:
- search by title or slug
- filter by entity type
- filter by status
- sort by `updatedAt` (default)

### Save Model
- Draft edits are saved via an explicit **Save** action.
- Optional autosave is allowed but must surface last-saved timestamps.

### Notifications
- Success: brief confirmation toast.
- Error: persistent inline error with retry option.

### Event Timeline
- Entity pages show a read-only timeline of key events.
- Events are ordered chronologically and non-editable.

---

## Required Screens (v1)

### 1) Source Inbox

**Goal:** process captured material into usable drafts.

#### Views
- List SourceItems filtered by:
  - status (ingested / triaged / used / archived)
  - sourceType
- Default filter: `status = ingested`

#### Required Actions

1. **Capture Source**
   - Fields (v1):
     - `sourceType` (required; must match Prisma `SourceType` enum)
     - `url` (required)
     - `operatorIntent` (required)
     - `platform` (optional)
     - `notes` (optional)
   - API: `POST /api/source-items/capture`

2. **Change Source Status**
   - API: `PUT /api/source-items/{id}/status`

3. **Attach Source to Entity**
   - Create a relationship from the entity → source item
   - API: `POST /api/relationships`
     - `fromEntityType` = entity type (guide | concept | project | news)
     - `fromEntityId` = the entity's UUID
     - `toEntityType` = sourceItem
     - `toEntityId` = the SourceItem's UUID
     - `relationType` = canonical type (e.g., `GUIDE_REFERENCES_SOURCE`, `NEWS_REFERENCES_SOURCE`)
   - See `docs/07-RELATIONSHIP-AND-EVENT-VOCABULARY.md` for valid relation types

4. **Promote Source to Draft**
   - Choose entityType + title (+ optional conceptKind for concepts)
   - APIs:
     - Create entity: `POST /api/entities`
     - Attach source: `POST /api/relationships` (as described above)

Archived items must appear visually muted.

---

### 2) Entity Library

**Goal:** browse, locate, and manage all content entities.

#### Views
- List entities filtered by:
  - entityType (concept | guide | project | news)
  - status (draft | publish_requested | published | archived)
  - conceptKind (when entityType = concept)

#### Required Actions
- Open entity editor
- Create new draft entity (`POST /api/entities`)

#### Display Requirements
- Show title, entity type, status, updatedAt
- Display an **LLM-assisted** badge when applicable

---

### 3) Entity Editor

**Goal:** edit an entity safely and completely.

#### Sections

1. **Core Fields**
   - title, slug, summary/description
   - difficulty (required for guides and concepts)
   - conceptKind (concepts only)
   - comparisonTargets (comparison concepts only)
   - repoUrl (projects only)

2. **Body Content**
   - editor for main content (MDX or rich text)
   - contentRef if applicable

3. **Sources**
   - list attached SourceItems (via relationships)
   - attach additional sources (via `POST /api/relationships`)

4. **Relationships**
   - list existing relationships (from/to)
   - add relationship (target entity + relationType)
   - remove relationship

5. **Validation**
   - run validation
   - display results by category
   - clearly distinguish blocking errors vs warnings

6. **Events**
   - read-only event timeline

#### Required Actions

- **Save Draft**
  - API: `PUT /api/entities/{id}`
  - Include `llmAssisted: true` when applicable

- **Run Validation**
  - API: `POST /api/entities/{id}/validate`

- **Request Publish**
  - UI must require passing validation before enabling this action
  - API: `POST /api/entities/{id}/request-publish`
  - This is the only path into the Publish Queue

- **Manage Relationships**
  - Create: `POST /api/relationships`
  - Remove: `DELETE /api/relationships/{id}`

- **Archive Entity**
  - API: `POST /api/entities/{id}/archive`

#### LLM Assistance Rules (UI)
- LLM help is always operator-initiated.
- LLM output must be reviewed before saving.
- LLM assistance never auto-saves or changes status.

---

### 4) Publish Queue

**Goal:** enforce human publish gatekeeping.

#### Views
- List entities with `status = publish_requested`
- Show validation summary (must be passing to enter queue)

#### Required Actions

1. **Preview**
   - Opens rendered preview in a new tab
   - Must be authenticated and `noindex`
   - API (data/URL): `GET /api/entities/{id}/preview`

2. **Approve Publish**
   - Requires explicit confirmation
   - API: `POST /api/entities/{id}/publish`

3. **Reject Publish**
   - Optional rejection reason
   - API: `POST /api/entities/{id}/reject`

Entities exit the queue immediately after approval or rejection.

---

## Cross-Screen Rules

### Status Transitions
- `draft → publish_requested` only via Request Publish action
- `publish_requested → published` only via Approve Publish
- `publish_requested → draft` only via Reject Publish
- `any → archived` only via Archive action

No other transitions are permitted in the UI.

### Validation Gate
- UI must block publish requests if validation fails.
- Server-side failures must surface blocking errors clearly.

### Preview Gate
- Preview content is never public or indexable.

---

## Standard Error Handling (v1)

- 401 / 403 → session expired → redirect to login
- 404 → item not found → return to list
- 409 → state conflict → prompt refresh
- 429 → rate limited → retry suggestion
- 5xx → generic error + retry

Errors must never be silently swallowed.

---

## Invariants (Non-Negotiable)

- Publishing is human-gated
- UI cannot bypass API invariants
- LLM assistance is visible and attributable
- Preview is authenticated and noindex

---

## Status
This document defines the Admin Dashboard UI Contract for v1.

End of document.
