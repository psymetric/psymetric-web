# Phase 1 — Option A Verification Checklist (X Operator Loop)

**Scope:** Phase 1, **Option A: Tighten X Operator Loop**.

This checklist is intended to be run at a **Phase checkpoint**. It verifies the end-to-end operator workflow and the required DB + EventLog side-effects.

**Loop:** Capture (X) → Generate reply drafts → Copy → Manually post → Archive drafts

---

## Ground Rules

- Drafts are **non-canonical** scaffolding (DraftArtifact never influences canonical Entities).
- No autonomous posting (human-gated only).
- All meaningful draft actions are **evented**.

---

## A. Pre-flight

1. **Deploy health**
   - App loads on Vercel.
   - No DB connection errors in function logs.

2. **DB connectivity**
   - Confirm API routes that touch Prisma return 2xx (no initialization/auth failures).

---

## B. Capture (X)

**Goal:** SourceItem is created with captured context (no later scraping dependency).

1. Capture a new X post via dashboard capture UI.
2. Verify SourceItem:
   - A new row exists.
   - `url` is present and deduplicated.
   - `operatorIntent` is present.
   - `contentHash` is present.
   - `status` is appropriate (`ingested` initially).
3. Verify EventLog:
   - `SOURCE_CAPTURED` exists for the SourceItem (if implemented in the capture route).

**Record:** captured SourceItem id: `______________`

---

## C. Generate reply drafts

**Goal:** Batch draft generation via query params; correct DraftArtifact rows; single DRAFT_CREATED event.

### C1. Default generation
1. Trigger “Generate Reply” for the SourceItem without specifying params.
2. Verify DraftArtifact:
   - Exactly **1** created.
   - `kind = x_reply`
   - `status = draft`
   - `sourceItemId = <sourceItem.id>`
   - `deletedAt = null`
   - `expiresAt ~= now + 30 days`
   - Content includes SourceItem URL.
3. Verify EventLog:
   - Exactly **one** `DRAFT_CREATED` event for this action.
   - `details` contains:
     - `draftIds: ["..."]`
     - `count: 1`
     - `style: "short"`

### C2. Variants + style
1. Call:
   - `POST /api/source-items/:id/draft-replies?count=3&style=thread`
2. Verify:
   - Exactly **3** new DraftArtifacts created.
   - Each has `kind=x_reply`, `status=draft`, `deletedAt=null`, `expiresAt` set.
   - Content is thread-shaped (e.g., `1/4`, `2/4`, etc.) and includes SourceItem URL.
3. Verify EventLog:
   - Exactly **one** `DRAFT_CREATED` event for this batch.
   - `details` contains:
     - `draftIds` length = 3
     - `count: 3`
     - `style: "thread"`

### C3. Validation failures
1. Call:
   - `POST /api/source-items/:id/draft-replies?count=0`
   - `POST /api/source-items/:id/draft-replies?count=6`
   - `POST /api/source-items/:id/draft-replies?count=2.2`
   - `POST /api/source-items/:id/draft-replies?style=long`
2. Verify:
   - Each returns **400** with a clear message.
   - No DraftArtifact rows are created.
   - No `DRAFT_CREATED` event is logged.

---

## D. List drafts

**Goal:** GET returns active drafts only (soft-deleted excluded).

1. Call:
   - `GET /api/source-items/:id/draft-replies`
2. Verify:
   - Returns drafts for `sourceItemId`.
   - Excludes `deletedAt != null`.
   - Sort order: newest first.

---

## E. Copy

**Goal:** Operator can copy draft content.

1. Use UI “Copy” on a draft.
2. Verify:
   - Clipboard contains the full draft content.
   - No server-side mutation occurs.

---

## F. Manual post (human-gated)

**Goal:** Confirm the system has **no auto-post** behavior.

1. Verify there is **no code path** that posts to X automatically.
2. Operator posts manually in X.

---

## G. Archive drafts

**Goal:** Archiving soft-deletes the draft and logs an event.

1. Archive a draft via UI (or `POST /api/drafts/:id/archive`).
2. Verify DraftArtifact:
   - `status = archived`
   - `deletedAt = now`
3. Verify EventLog:
   - An `ENTITY_UPDATED` event exists for `entityType=sourceItem` with:
     - `details: { draftId, action: "archived" }`

---

## H. Expiry sweep (DRAFT_EXPIRED)

**Goal:** Expired drafts are archived and emit `DRAFT_EXPIRED`.

> Route: `POST /api/drafts/expire`

### H1. No-op run
1. Call `POST /api/drafts/expire` when no drafts are expired.
2. Verify:
   - Response `expiredCount: 0`
   - No DraftArtifacts changed.
   - No `DRAFT_EXPIRED` events created.

### H2. Expire a draft (controlled)
1. Pick a draft and temporarily set `expiresAt` into the past (DB admin / SQL).
2. Call `POST /api/drafts/expire`.
3. Verify:
   - DraftArtifact updated:
     - `status = archived`
     - `deletedAt = now`
   - EventLog contains `DRAFT_EXPIRED`:
     - `entityType = sourceItem`
     - `entityId = <draft.sourceItemId>`
     - `details: { draftId: <draft.id> }`

---

## I. Smoke regression

- Generating drafts still works after archiving.
- GET drafts list reflects archives (archived drafts disappear).
- No unexpected 500s in Vercel logs.

---

## Notes / Findings

- Date run: `______________`
- Operator: `______________`
- Findings:
  - 
  - 
