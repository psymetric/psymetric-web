# Extension Ingestion Architecture (Desktop + Android)

This document defines the architecture and operational constraints for the PsyMetric browser extension used for X (Twitter) ingestion.

This architecture supports:
- Chrome (desktop)
- Kiwi Browser (Android)

Firefox support may be considered later but is not required for Phase 1.

---

# 1. Supported Browsers (Phase 1)

## Desktop
- Google Chrome (Manifest V3)

## Android
- Kiwi Browser (Chromium-based, supports Chrome extensions)

Note:
Standard Chrome and Brave on Android do NOT support extensions.
Kiwi is required for mobile extension support in Phase 1.

---

# 2. Purpose of the Extension

The extension exists solely to reduce ingestion friction.

It does NOT:
- Publish content
- Mutate canonical entities
- Trigger autonomous workflows
- Perform background inference

It only:
- Captures X post data
- Sends structured payload to PsyMetric backend

---

# 3. Capture Requirements

On X (x.com), the extension must capture:

Required:
- url (canonical tweet URL)
- platform = "x"
- sourceType = "comment" or "reply" (based on context)
- operatorIntent (selected via preset or minimal input)
- capturedText (tweet body text)

Optional (Phase 1 nice-to-have):
- author handle
- visible metrics (likes, reposts)
- screenshot reference

Captured text must be included in the ingestion payload to avoid reliance on later scraping or X API access.

---

# 4. Backend Interaction

Extension calls:
POST /api/source-items/capture

Payload example:
{
  "sourceType": "comment",
  "url": "https://x.com/user/status/...",
  "platform": "x",
  "operatorIntent": "Draft concise engagement reply",
  "notes": "[X CAPTURE]\nAuthor: @user\nText: ..."
}

The backend:
- Deduplicates by URL
- Logs SOURCE_CAPTURED event
- Does not mutate canonical entities

---

# 5. Draft Reply Generation

Reply drafts are generated via server endpoint.

Drafts are stored in DraftArtifact table.

Rules:
- Drafts are scaffolding
- Drafts auto-expire (default: 30 days)
- Drafts never influence canonical knowledge
- Human must manually post reply on X

---

# 6. Mobile Workflow (Kiwi)

Workflow:
1. User scrolls X in Kiwi
2. Taps extension
3. Selects intent preset
4. Capture sent to PsyMetric
5. On next break, user opens dashboard and generates reply drafts
6. User manually posts reply

No copy/paste required.
No X API required in Phase 1.

---

# 7. Architectural Guardrails

- No autonomous posting
- No background scraping jobs
- No direct LLM access to X URLs
- All capture must include visible text at time of ingestion
- All actions must log EventLog entries

---

This document formalizes extension support for Kiwi (Android) as part of Phase 1 execution.
