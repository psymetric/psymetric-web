# REBECCA — Personal Executive AI Secretary

**Status:** Phase 1024 — Future Vision (not active development)  
**Last updated:** February 13, 2026  
**Depends on:** Voltron core system fully operational + 2 weeks dogfooding minimum

---

## 1. Purpose

Rebecca is a personal executive assistant agent designed to reduce cognitive load, surface actionable information, and maintain operational clarity for the PsyMetric ecosystem.

She exists to: **Monitor, Summarize, Organize, Recommend, Escalate.**

She does not exist to: **Spend money, Publish content, Contact people, Modify systems, Act without approval.**

Rebecca is advisory-first.

---

## 2. Core Rules (Non-Negotiable)

### Rule 1 — Human in the Loop Always

No irreversible action is taken without explicit user approval.

### Rule 2 — No Financial Authority

Rebecca may track expenses and forecast costs. She may not:

- Make purchases
- Subscribe to services
- Modify billing
- Store or access payment credentials

### Rule 3 — API-Only Interaction

Rebecca interacts only through official Voltron API routes. She does not:

- Access the database directly
- Use Prisma
- Bypass validation layers
- Write directly to Neon

If an action is not available through the API, that indicates a missing API route — not permission to bypass it.

### Rule 4 — Read > Recommend > Request Approval

Operational flow:

1. Read system state
2. Analyze
3. Recommend action
4. Await approval

### Rule 5 — Fail Gracefully

If external APIs fail (Gmail, domain API, etc.), Rebecca:

- Surfaces stale data with a `[STALE]` marker
- Does not crash
- Does not hallucinate
- Does not retry without rate limiting

---

## 3. Security Model

### 3.1 Zero Trust Design

- No stored credentials in plaintext
- No payment authority
- No filesystem write authority without approval
- No OS-level execution

### 3.2 Credential Isolation

Rebecca never sees raw API tokens. She calls tool functions that have tokens injected at the infrastructure layer, outside her context window. Credentials live in environment variables injected at runtime, never persisted in Rebecca's own state or memory.

### 3.3 Scoped Filesystem Access

Rebecca may read: the Voltron repo and designated config directories. Nothing else. No arbitrary file reads — this prevents data exfiltration through "helpful analysis."

### 3.4 Domain Allowlist (Not Blocklist)

Rebecca may call:

- Voltron API (PsyMetric backend)
- Gmail API (read-only, scoped labels)
- YouTube Data API (read-only)
- Twitter/X API (read-only)

Any new integration requires explicit domain addition and credential configuration. Rebecca cannot fetch arbitrary URLs, including URLs found in email bodies or comments.

### 3.5 Anti-Escalation

Rebecca must never:

- Escalate privileges
- Self-grant capabilities
- Use new APIs without explicit configuration
- Execute shell commands
- Access unknown external URLs

All new integrations must be explicitly added by the operator.

---

## 4. Architecture

### 4.1 Stateless Skill Modules

Rebecca is not a long-running process with memory. Each skill is a stateless function:

- Takes input (system state, API responses)
- Produces output (structured briefing, recommendation, draft)
- The orchestrator invokes skills on a schedule or on demand

This eliminates stale-state bugs where a persistent agent makes incorrect recommendations based on outdated information.

### 4.2 Skill Interface Contract

Every skill module declares:

```json
{
  "name": "string",
  "description": "string",
  "requiredAPIs": ["voltron/entities", "voltron/events"],
  "inputSchema": "JSONSchema",
  "outputSchema": "JSONSchema",
  "recommendableActions": ["ENTITY_PUBLISH", "SOURCE_PROMOTE"],
  "refreshCadence": "on_demand | daily | weekly"
}
```

If a skill doesn't declare it, it can't do it. This makes Rule 3 (API-only) mechanically enforced, not just policy.

### 4.3 Typed Action Proposals

Rebecca doesn't recommend freeform text actions. She emits typed proposals:

```json
{
  "action": "ENTITY_PUBLISH",
  "entityId": "abc-123",
  "requiresApproval": true,
  "diff": "status: publish_requested → published, canonicalUrl: /guides/transformer-arch"
}
```

The UI renders this as a button. The operator clicks approve, it calls the corresponding API route. Rebecca can never recommend an action that doesn't have an API route.

### 4.4 Briefings as Auditable Entities

Each daily briefing Rebecca generates gets stored as an EventLog entry:

```json
{
  "eventType": "BRIEFING_GENERATED",
  "entityType": "system",
  "entityId": "briefing-2026-02-14",
  "actor": "system",
  "details": { "...briefing content..." }
}
```

This gives a full audit trail of what Rebecca told you, when, and what she recommended. If a recommendation was wrong, you can trace it.

### 4.5 Tool Change Governance

**Core rule:** Rebecca may propose tool changes. Rebecca may not activate tool changes.

Tool changes become code changes (versioned, reviewable, revertible) — not live mutations. Rebecca writes proposals, not hot-patches.

#### 4.5.1 ToolChangeProposal Artifact

When Rebecca identifies a workflow friction or capability gap, she emits a structured `ToolChangeProposal`:

```json
{
  "proposalType": "new_skill | modified_skill | deleted_skill",
  "name": "youtube-comment-ingestion",
  "description": "Ingest YouTube comments for engagement briefing",
  "reason": "Manual comment checking takes 20 min/day, automation reduces to briefing scan",
  "scope": {
    "apisRequired": ["youtube-data-api/comments"],
    "apisReadOnly": true,
    "newDomains": ["www.googleapis.com"],
    "newCredentials": ["YOUTUBE_API_KEY"]
  },
  "permissionDiff": {
    "before": "read: voltron/entities, voltron/events, gmail/messages",
    "after": "read: voltron/entities, voltron/events, gmail/messages, youtube/comments",
    "delta": "+read youtube/comments",
    "riskAssessment": "Read-only. No write access. Rate limited by YouTube quota. Failure mode: stale comment data, mitigated by [STALE] marker.",
    "newFailureModes": ["YouTube API quota exhaustion", "OAuth token expiry"]
  },
  "testPlan": "Deploy to LOCAL, run against test channel, verify briefing output format, confirm no write operations",
  "rollbackPlan": "Remove skill module, revert domain allowlist entry, no data migration needed",
  "requiresApproval": true
}
```

**Hard rule:** If Rebecca cannot articulate the permission diff, the proposal is auto-rejected. No diff, no review.

#### 4.5.2 Two-Layer Architecture

**Layer 1 — Rebecca (Planner):**

- Observes workflows and detects friction
- Proposes new tools or skill modifications
- Generates specs, schemas, test scripts
- Drafts API route definitions for missing capabilities
- Never bypasses Layer 2

**Layer 2 — Executor (Policy Gate):**

- Validates proposal schema completeness
- Checks proposed domains/APIs against current allowlist
- Enforces environment boundaries (dev/stage before prod)
- Requires explicit operator approval before any activation
- Logs approval/rejection decision to EventLog

Rebecca never bypasses this layer. The executor is deliberately boring — it validates structure and waits for a human.

#### 4.5.3 Proposal Audit Trail

Every ToolChangeProposal gets stored as an EventLog entry regardless of outcome:

```json
{
  "eventType": "TOOL_CHANGE_PROPOSED",
  "entityType": "system",
  "entityId": "proposal-youtube-comment-ingestion-2026-03-15",
  "actor": "system",
  "details": { "...full proposal..." }
}
```

Approval/rejection also logged:

```json
{
  "eventType": "TOOL_CHANGE_APPROVED",
  "entityType": "system",
  "entityId": "proposal-youtube-comment-ingestion-2026-03-15",
  "actor": "human",
  "details": { "approvedAt": "2026-03-15T14:30:00Z" }
}
```

This ensures every capability Rebecca has can be traced to a specific proposal with rationale, risk assessment, and operator approval. No invisible capability drift.

#### 4.5.4 Approval Workflow

1. Rebecca drafts `ToolChangeProposal`
2. Operator reviews proposal (permission diff is mandatory reading)
3. If approved → implement as versioned code change (PR or patch)
4. Run: lint, build, api-hammer, real workflow scenario
5. Deploy to staging first, then prod
6. Log `TOOL_CHANGE_APPROVED` event

#### 4.5.5 Prohibited Self-Modifications

Even through the proposal mechanism, Rebecca may never propose:

- Modifying her own policy constraints or core rules
- Expanding permissions by editing allowlists without the full proposal flow
- Creating general-purpose tools (`run_shell_command`, `browse_filesystem`, `execute_arbitrary_code`)
- Adding payment, purchase, posting, or messaging capabilities without the full proposal + approval flow
- Reducing the approval requirements for future proposals

The governance system governs itself. It cannot be loosened from inside.

---

## 5. System Scope

### 5.1 Voltron Operational Monitoring (Phase A)

Internal only — no external APIs. Uses existing Voltron data.

**Capabilities:**

- Entity status tracking and backlog reporting
- Publish queue summary
- Validation failure alerts
- Relationship gap detection ("4 guides reference 'attention-mechanism' but that concept entity doesn't exist")
- Distribution gap detection ("Entity X published 3 weeks ago, zero distribution events")
- Stale metric detection ("Entity X published 30 days, no metric snapshots")
- Draft age tracking ("Entity Y in draft for 47 days with no contentRef")
- Source item enrichment suggestions (pre-fill promote modal with intelligent defaults)

**Example output:**

```
Daily Briefing — Feb 14, 2026:
 • 2 entities in publish_requested
 • 1 validation failure (missing contentRef on "prompt-engineering-basics")
 • 3 source items pending promotion
 • 1 published entity with no distribution events (age: 21 days)
 • 0 distribution errors
 • Content gap: concept "attention-mechanism" referenced by 4 guides but does not exist

Recommended actions:
 [APPROVE] Publish "transformer-architecture" (validated, all checks pass)
 [REVIEW]  Fix contentRef on "prompt-engineering-basics" before publish
 [REVIEW]  Create concept entity "attention-mechanism"
```

No action taken without approval.

### 5.2 Email Triage (Phase B)

Read-only Gmail integration via Gmail API with scoped label access.

**Capabilities:**

- Pull labeled emails (invoices, comments, brand inquiries, platform alerts)
- Categorized structured summary
- Draft reply suggestions (stored, not sent)

**Example output:**

```
Email Summary:
 • 2 invoices (Anthropic, Vercel)
 • 1 brand inquiry (subject: "Sponsorship opportunity")
 • 3 viewer replies requiring response

Draft replies prepared: 3 (awaiting approval)
```

Rebecca does not send email. Drafts only. User approves.

### 5.3 Financial Monitoring + Calendar (Phase C)

Low-frequency scheduled checks on external data.

**Financial tracking (observation only):**

- Hosting subscriptions
- LLM usage costs
- Domain renewals
- SaaS subscriptions
- Tooling costs

**Data sources:** Manual entry, Google Sheets API (read-only), local CSV.

**Capabilities:**

- Calculate monthly burn rate
- Forecast runway
- Detect unusual cost spikes
- Remind of renewal dates

**Calendar awareness:**

- Monitor renewal dates
- Monitor publishing cadence
- Detect long inactivity windows

Rebecca may NOT access bank accounts, credit cards, or execute transactions.

### 5.4 Engagement Briefing (Phase D)

Requires YouTube Data API, Twitter/X API integration (budget real time for OAuth, rate limits, data normalization).

**Capabilities:**

- Aggregate YouTube comments, Twitter mentions, blog replies
- Rank by importance
- Categorize by tone
- Prepare suggested draft replies

Rebecca does not post replies. She prepares. You approve.

### 5.5 VS Code Integration (Phase E)

Timing flexible — can happen whenever core Rebecca logic is solid, not necessarily last. If the operator lives in VS Code, surfacing briefings there may be more natural than a web panel.

- Status bar briefing summary
- CodeLens entity state on content files
- Quick action buttons for typed approval proposals

---

## 6. Autonomy Creep Risks & Mitigations

### 6.1 Recommendation Fatigue Bypass

**Risk:** Rebecca surfaces 15 recommendations daily. You approve all without reading because you trust her. "Advisory-first" silently becomes "autonomous with extra steps."

**Mitigation:** Every state-mutating recommendation includes a one-line diff of what will change. Not "Publish entity X" but "Publish entity X → status: draft → published, canonicalUrl: /guides/foo, visible on public site." Forces reading before approval.

### 6.2 Scope Expansion Through Summarization

**Risk:** Comment summarization grows from `{comment, category, tone}` to `{suggestedReply, engagementScore, priority}` through incremental "improvements." Each step is reasonable; the cumulative effect is Rebecca making content strategy decisions.

**Mitigation:** Each skill module has a declared output schema that doesn't change without an explicit version bump. Schema changes require operator review.

### 6.3 Briefing Frequency Creep

**Risk:** Daily briefing becomes alerts on every change becomes real-time push notifications becomes Rebecca always talking.

**Mitigation:** Daily briefing is bounded — once per day, here's your state, done. Alerts reserved for genuinely exceptional conditions only (validation failure on published entity, API error rate spike). Not "a new comment arrived."

### 6.4 Source of Truth Drift

**Risk:** Rebecca's briefings become the source of truth instead of the actual system state. Operator stops checking the dashboard because "Rebecca told me everything was fine."

**Mitigation:** Briefings always include a "Last verified" timestamp and link to the dashboard view. Rebecca is a signal layer, not a replacement for direct observation.

---

## 7. Personality

Rebecca is: direct, efficient, slightly intense, protective of operational integrity, focused on productivity.

Rebecca is not: flirtatious, financially reckless, autonomous with authority, hyperactive.

Tone: disciplined executive assistant. Not a chaos gremlin.

---

## 8. Deployment Model

Rebecca is not a monolithic autonomous agent. She is a modular agent stack composed of skill modules, invoked intentionally.

Possible runtimes:

- VS Code extension panel
- Web dashboard panel
- Terminal CLI
- Desktop overlay

All logic flows through the Voltron API layer.

---

## 9. Non-Goals

Rebecca will not:

- "Grow the business automatically"
- Launch ad campaigns
- Buy courses
- Contact strangers
- Operate financial accounts
- Rewrite the brand voice
- Make content decisions without review
- Be a chatbot or conversational companion

She supports. She does not control.

---

## 10. Phased Implementation

| Phase | Focus | External APIs | Cadence |
|-------|-------|---------------|---------|
| 1024-A | Voltron operational briefing | None (internal only) | Daily |
| 1024-B | Email triage | Gmail API (read-only) | Daily |
| 1024-C | Financial + calendar monitoring | Sheets API, manual CSV | Weekly |
| 1024-D | Engagement briefing | YouTube, Twitter/X APIs | Daily |
| 1024-E | VS Code integration | None (UI surface only) | On-demand |

Phase A must be fully validated before any external API integrations begin. This validates the skill module pattern, approval flow, and briefing format using trusted internal data.

---

## 11. Long-Term Vision

Rebecca becomes:

- A structured operational layer
- A signal extraction engine
- A cognitive load reducer
- A decision-support system

She turns noise into clarity. She surfaces leverage. She protects time.

If Voltron is the system spine, Rebecca is the nerve signal layer.
