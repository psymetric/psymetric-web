# Social Reply Draft System (Phase 1 Foundation)

This document defines the minimal, Phase 1-compliant pattern for generating and managing reply drafts for social platforms.

It is designed to:
- reduce operator friction
- preserve epistemic clarity
- keep drafts explicitly non-canonical
- support multiple platforms over time without schema churn

Derived from:
- docs/ROADMAP.md (Phase 1 Draft System)
- docs/04-LLM-OPERATING-RULES.md
- docs/05-PUBLISHING-AND-INDEXING-RULES.md

---

# 1. Core Principle

Drafts are scaffolding.

They are:
- temporary
- human-gated
- non-canonical
- excluded from intelligence layers

Only canonical Entities + SourceItems + EventLog are truth layers.

---

# 2. Data Model

Draft replies are stored in `DraftArtifact`.

Required fields (already implemented):
- kind
- status
- content
- sourceItemId
- createdBy
- expiresAt
- deletedAt (soft delete)

---

# 3. Platform Strategy

## Phase 1
- X (Twitter) reply drafts (`kind = x_reply`)

## Phase 1+ (planned)
- YouTube comment replies
- Other platforms when feasible

Key rule:
- The platform-specific content MUST be captured at ingestion time into SourceItem (URL + visible text/context)
- The system must not depend on later scraping of platform URLs

---

# 4. DraftArtifact.kind Extension Policy

DraftArtifact.kind is intentionally a small, controlled enum.

When adding new platforms, add kinds only when there is immediate Phase leverage.

Examples (future, not implemented yet):
- youtube_comment_reply
- reddit_comment_reply
- linkedin_comment_reply

Guardrail:
- Do not add kinds preemptively.
- Add only when the platform ingestion + drafting workflow is being implemented.

---

# 5. Draft Lifecycle

- Drafts are created via an operator action (e.g., "Generate Reply")
- Drafts are reviewed by a human
- Human posts manually on the platform
- Drafts are archived (soft deleted) once no longer needed
- Drafts auto-expire after ~30 days

Soft delete policy:
- `deletedAt` is set when archived/expired
- Draft content may optionally be tombstoned later (content cleared) if required

---

# 6. Event Logging

All meaningful draft actions must be evented:

- `DRAFT_CREATED`
  - entityType: sourceItem
  - entityId: sourceItemId
  - details: { draftId | draftIds }

- `DRAFT_EXPIRED`
  - entityType: sourceItem
  - entityId: sourceItemId
  - details: { draftId }

Archiving drafts may be logged as:
- `ENTITY_UPDATED` (sourceItem) with details { draftId, action: "archived" }

---

# 7. Human-Gated Posting

The system must never auto-post.

Draft generation is assistance.
Publishing/distribution remains a human action.

---

# 8. Recommended Operator UX (Inbox)

For any SourceItem with a supported platform:
- Generate Reply button
- Show drafts inline
- Copy button
- Archive draft button
- (Optional) Archive all drafts for the item

Mobile-first requirement:
- large tap targets
- minimal steps
- one-screen triage

---

# 9. Notes on Future YouTube Support

YouTube comment capture must store:
- video URL
- comment permalink (if available)
- channel/author handle (best effort)
- visible comment text

Reply drafts follow the same scaffolding policy as X.

---

This system is intentionally minimal and Phase 1 compliant.
