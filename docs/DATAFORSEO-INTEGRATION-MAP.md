# PsyMetric — DataForSEO Integration Map (v1)

**Version:** 1.0
**Status:** Phase 0-SEO (parallel track within Phase 0)
**Depends on:** SEO-RECORDING-SPEC.md

---

## 1. Purpose

This document defines how PsyMetric integrates with DataForSEO while preserving:

- Project isolation
- Deterministic behavior
- Strict event logging
- No automation without approval
- No schema drift

All DataForSEO writes must:
- Include `projectId`
- Execute inside `prisma.$transaction()`
- Emit EventLog entries in the same transaction
- Respect rate limits and spend caps

---

## 2. Architectural Positioning

DataForSEO is an **external research provider**, not a source of canonical truth.

Canonical data models:
- `Entity`
- `EntityRelation`
- `MetricSnapshot`
- `SearchPerformance`
- `QuotableBlock`

Research / intermediate artifacts:
- `DraftArtifact`

DataForSEO never writes directly to canonical content entities.

---

## 3. Deduplication Strategy

All DataForSEO responses are hashed before storage.

`contentHash = SHA256(JSON.stringify({ provider, endpoint, query, location, language, device, date }))`

Before calling DataForSEO:
1. Compute hash
2. Check DraftArtifact for existing `(projectId, contentHash, kind)`
3. If found and not expired → reuse
4. If expired → create new record

Index required on `DraftArtifact.contentHash`.

---

## 4. Rate Limiting (SystemConfig)

Rate limits are enforced **before API call**.

SystemConfig keys (global keys with per-project overrides supported in JSON):

- `dataforseo_keyword_daily_cap`
- `dataforseo_serp_daily_cap`
- `dataforseo_ai_keyword_daily_cap`
- `dataforseo_llm_mentions_weekly_cap`
- `dataforseo_llm_responses_daily_cap`
- `dataforseo_backlinks_monthly_cap`

---

## 5. Per-Project Daily Spend Cap (SystemConfig Convention)

SystemConfig is global, not project-scoped.

Per-project spend caps use JSON overrides.

Key: `dataforseo_daily_budget_usd`

Example value:

```json
{
  "default": 2.00,
  "overrides": {
    "<projectId-uuid>": 1.50
  }
}
```

Resolution logic:
- If `overrides[projectId]` exists → use override
- Else → use `default`

Spend check happens before API call.

Spend-limit blocks are logged:

```json
{
  "eventType": "SYSTEM_CONFIG_CHANGED",
  "entityType": "project",
  "entityId": "<projectId-uuid>",
  "details": {
    "capKey": "dataforseo_daily_budget_usd",
    "attemptedCostUsd": 0.12,
    "remainingBudgetUsd": 0.08,
    "workflow": "W4"
  }
}
```

---

## 6. Security

- API keys stored server-side only
- Never exposed to client
- All DataForSEO calls executed in backend route handlers

---

## 7. Determinism Guarantees

- No background automation
- No scheduled tasks without explicit roadmap change
- No mutation without human trigger
- All state changes event-logged

---

End of document.
