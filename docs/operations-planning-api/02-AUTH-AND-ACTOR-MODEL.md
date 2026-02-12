# Auth & Actor Model (v1)

## Purpose
This document defines **who is allowed to act**, **how actions are attributed**, and **what trust assumptions exist** in PsyMetric.

It exists to:
- keep authority boundaries explicit
- prevent accidental automation
- ensure auditability of all actions
- keep v1 simple without painting us into a corner

If behavior is not defined here, it is out of scope.

---

## Core Principles

1. **Humans have authority.**
2. **LLMs assist but never decide.**
3. **Systems enforce but never invent intent.**
4. **Every write action is attributable.**

---

## Actor Types

The system recognizes three actor types:

### 1) Human (Operator)
- A real person using the dashboard or tools
- The only actor allowed to:
  - request publish
  - approve publish
  - reject publish
  - record distribution intent

All monetization, publishing, and distribution decisions originate here.

---

### 2) LLM (Assistant)
- A connected language model operating under constraints
- May:
  - draft content
  - propose edits
  - suggest relationships
  - assist with validation explanations

- May NOT:
  - publish content
  - change publish status
  - delete entities
  - record distribution
  - call irreversible endpoints

LLM actions are always mediated by a human or system gate.

---

### 3) System
- Deterministic code paths (cron, hooks, validation engines)
- May:
  - enforce rules
  - block invalid actions
  - log events

- May NOT:
  - create intent
  - override human decisions
  - fabricate content

---

## Authentication Model (v1)

### Assumptions
- Single primary operator
- Email-based authentication (or equivalent)
- No role hierarchy in v1

Authentication exists to:
- identify the operator
- protect write endpoints
- attribute actions in EventLog

---

## Authorization Rules

### Read Access
- Public content: anonymous read
- Draft content: authenticated operator only

### Write Access
- All write endpoints require authenticated operator
- LLMs never authenticate directly

---

## Event Attribution

Every write action records:
- `actorType` (human | llm | system)
- `actorId` (user id, model id, or system identifier)

Examples:
- Human publishes guide → `actorType = human`
- LLM drafts content → `actorType = llm`
- Validator blocks publish → `actorType = system`

---

## LLM-Assisted Actions (v1)

LLMs do not call the API directly. LLM assistance is tracked via request metadata and stored in EventLog details.

**Workflow for LLM-assisted drafting:**

1. Human initiates request via dashboard (e.g., "Help me draft this section")
2. Dashboard calls LLM (client-side or via server endpoint)
3. LLM returns suggested content
4. Human reviews, edits, and saves the draft
5. Dashboard calls API with human auth and passes `llmAssisted: true` in request body:
   - `POST /api/entities` — include `llmAssisted: true` in Optional Fields
   - `PUT /api/entities/{id}` — include `llmAssisted: true` in Optional Metadata
6. API creates EventLog entry with:
   - `actor: human`
   - `details.llmAssisted: true`
   - `details.llmModel: "claude-3"` (optional, if dashboard tracks model)

**Rules:**
- The human is always the actor of record for saved content
- LLM assistance is metadata, not a separate actor
- `llmAssisted` is for attribution only — it MUST NOT affect publish gating, bypass validation, or change actorType
- Dashboard must track LLM usage and pass `llmAssisted` flag when applicable
- This flag enables "LLM Draft Attribution" display in the dashboard (see Doc 07-ADMIN-DASHBOARD-SCOPE)

**What this means:**
- LLMs never have API credentials
- LLMs never make direct API calls
- All LLM output passes through human review before persistence
- Auditability is preserved (we know what was LLM-assisted via EventLog)

---

## Extension Authentication

Chrome extension behavior:
- Shares the operator's authenticated session via browser cookies
- Requires the operator to be logged into the dashboard in the same browser
- Cannot act without explicit user interaction
- Cannot perform background actions

Extension may:
- capture sources
- submit operator intent notes

Extension may NOT:
- publish
- schedule distribution
- modify entities

If cookie-sharing is problematic in implementation:
- Extension may use a short-lived token issued after dashboard login
- Token scope is limited to capture endpoints only

---

## Invariants (Non-Negotiable)

- No anonymous writes
- No LLM-authenticated writes
- No automated publishing
- No background distribution

Violations of these invariants are bugs, not features.

---

## Future Considerations (Deferred)

Explicitly out of scope for v1:
- Multiple operators
- Role hierarchies
- Team permissions
- API tokens for third parties

These can be added later without breaking v1 assumptions.

---

## Status
This document defines the canonical auth and actor model for v1.

End of document.
