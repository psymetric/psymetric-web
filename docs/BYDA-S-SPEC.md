# BYDA-S — Controlled Semantic Engine (Hardened v1.1)

**Status:** Phase 3 — Next Active Development  
**Last updated:** February 15, 2026 (Hardened Revision)  
**Depends on:** Phase -1 multi-project hardening complete (✅), SYSTEM_INVARIANTS enforced  
**Related:** `docs/04-LLM-OPERATING-RULES.md`, `docs/07-RELATIONSHIP-AND-EVENT-VOCABULARY.md`, `docs/ROADMAP.md`

---

## 1. Purpose

BYDA-S is a structured audit framework that evaluates entity quality across 8 semantic layers and produces actionable, human-reviewable patch proposals.

It exists to: **Audit, Score, Propose, Wait.**

It does not exist to: **Optimize automatically, Publish content, React to metrics, Mutate state without approval, Generate articles.**

BYDA-S is analytical scaffolding. Humans are the decision layer. The database is canonical truth.

---

## 2. Architectural Constraints (System-Level)

BYDA-S must respect all global invariants:

- All canonical mutations occur inside a single `prisma.$transaction()`.
- All writes require `projectId`.
- No cross-project reads or writes.
- Every mutation logs an EventLog entry using canonical `EventType` values.
- No schema drift introduced by audit features (Phase 3-A is schema-neutral).
- No canonical mutation may occur during audit execution.

Audits are read-only with respect to canonical entities. Patch application is explicit and atomic.

---

## 3. Core Rules (Non-Negotiable)

### Rule 1 — Audits Are Canonical-Read-Only

`POST /api/audits/run` performs **zero canonical mutations** (no Entity/Relation changes).

**Storage:** An audit may be persisted as a `DraftArtifact` record for traceability.

**Schema note (current reality):** `DraftArtifactKind` is currently limited (e.g. `x_reply`). Until a dedicated kind exists, BYDA-S audits are stored using the existing kind and are tagged in `llmMeta.kind = "byda_s_audit"`.

### Rule 2 — Explicit Human Approval Required

No patch may be applied automatically.
No "apply all" shortcut in v1.
Each patch ID must be explicitly selected.

### Rule 3 — Evidence Over Inference

Every gap must reference concrete evidence:

- `SourceItem.id`
- `MetricSnapshot.id`
- Existing relationship
- Missing deterministic requirement

If no evidence exists:
- `evidenceRef = null`
- Severity is automatically capped at `LOW` by backend validation.

### Rule 4 — Deterministic Reproducibility (Best-Effort)

Given identical:
- entity state
- relationship set
- evidence IDs
- metric IDs
- promptVersion
- model snapshot identifier (not alias)

The audit should produce identical output.

Temperature fixed at `0.1`.
Prompt versions are file-versioned.
Model snapshot identifier recorded.
Checksum recorded.

### Rule 5 — Cost & Abuse Controls

- Checksum-based caching (24h TTL)
- Max 10 audits per project per hour
- Display estimated token cost before execution
- Cache invalidated automatically on model snapshot change

---

## 4. Severity Enforcement Rules (Backend Hard Guardrails)

The backend validates and enforces severity constraints:

- S0 failures → always `BLOCKING`
- Published entity with zero relationships → `BLOCKING`
- Fabricated metric claims → `BLOCKING`
- Missing concept definition block → `HIGH`
- Any gap with invalid `evidenceRef` → downgraded to `LOW`

The LLM may suggest severity. The backend is authoritative.

---

## 5. Patch Vocabulary (Strict Allowlist)

Allowed patch types:

- `PATCH_FIELD`
- `CREATE_RELATIONSHIP`
- `REMOVE_RELATIONSHIP`
- `CREATE_ENTITY`
- `RECORD_DISTRIBUTION`
- `REQUEST_PUBLISH`

Prohibited:

- `PUBLISH`
- `DELETE`
- `ARCHIVE`
- Schema changes
- Metric fabrication

### Field Allowlist for PATCH_FIELD

Only these fields may be modified:

- title
- summary
- contentRef
- canonicalUrl
- difficulty
- repoUrl

Backend validates field name strictly.

### Relationship Type Enforcement

Relationship patches must specify a `relationType` that is a valid `RelationType` enum value. Unknown values are rejected by backend validation per `docs/07-RELATIONSHIP-AND-EVENT-VOCABULARY.md`.

---

## 6. AuditReport Schema (Revised)

Stored as JSON (typically in `DraftArtifact.content`).

Added metadata extraction for future analytics.

```json
{
  "schemaVersion": "1.1",
  "entityId": "uuid",
  "projectId": "uuid",
  "overallScore": "GOOD",
  "blockingCount": 0,
  "highCount": 1,
  "medCount": 2,
  "lowCount": 0,
  "auditedAt": "ISO8601",
  "promptVersion": "byda-s.audit.v1.3",
  "modelVersion": "claude-sonnet-4-5-YYYYMMDD",
  "checksum": "sha256",
  "layers": { "S0": { "score": "...", "gaps": [] } }
}
```

`overallScore` and severity counts are duplicated outside nested layers for efficient querying without JSON parsing.

---

## 7. Patch Application Contract (Injection-Safe)

`POST /api/audits/apply`

### Apply Request Shape

The apply endpoint accepts **only**:

- `projectId`
- `auditDraftId`
- `approvedPatchIds[]`

The client **must not** submit patch objects.

### Provenance Binding

Backend loads the stored AuditReport from `auditDraftId` and:

- Verifies `projectId` matches
- Verifies checksum and model/prompt metadata
- Verifies each `approvedPatchId` exists in the stored report
- Rejects any "orphan" patch ID

### Validation steps before transaction

1. DraftArtifact belongs to same project.
2. Approved patch IDs exist in stored AuditReport.
3. Patch types are in allowlist.
4. Target entities exist and share same `projectId`.
5. Field allowlist enforced.
6. MetricSnapshot IDs validated if referenced.
7. Relationship reciprocity not auto-assumed — only created if explicitly proposed.

### Execution

All approved patches executed inside one `prisma.$transaction()`.
If any validation fails → full rejection.
No partial apply.

### Event Logging (Schema-Accurate)

Because `EventType` is an enum, BYDA-S uses existing canonical event types:

- `ENTITY_UPDATED` for field patches
- `RELATION_CREATED` / `RELATION_REMOVED` for relationship patches
- `DRAFT_CREATED` when the AuditReport DraftArtifact is created

Each event includes `{ auditDraftId, checksum, promptVersion, modelVersion, approvedPatchIds }` in `details`.

---

## 8. Checksum Definition (Explicit)

```
checksum = SHA256(
  promptVersion +
  modelVersion +
  sorted(entityJSON) +
  sorted(relationshipIDs) +
  sorted(evidenceIDs) +
  sorted(metricIDs)
)
```

Checksum excludes:
- audit timestamp
- ordering artifacts

Any change in inputs invalidates cache.

---

## 9. Broker Responsibilities (Clarified)

Broker handles:
- Model routing
- Prompt loading
- Response schema validation
- Retry once on malformed JSON
- Token usage logging
- Rate limiting

Broker does NOT:
- Apply patches
- Modify severity
- Decide which layers to run

**Authority boundary:** Backend calls broker. MCP does not call broker directly.

---

## 10. Phase Hard Gate

Phase 3-A (S0 only) must satisfy:

- DraftArtifact storage working
- VS Code rendering working
- Apply flow working
- Event logging verified
- Transaction atomicity verified

Only after this passes may any LLM layer be activated.

---

## 11. Autonomy Creep Controls

- No scheduled audits in v1
- No background optimization
- No cross-project audits
- No auto-approval workflows
- Layer set fixed to S0–S7 in v1

Any new layer requires spec amendment.

---

## 12. Future Schema Expansion (Deferred)

When BYDA-S is proven end-to-end, consider **minimal** schema expansions:

- Add dedicated `DraftArtifactKind` value for BYDA-S audits
- Add dedicated `EventType` values for audit run/apply **only if** first-class querying is needed

These changes are out of scope until implementation pressure justifies a migration.

---

## 13. Non-Goals (Reaffirmed)

BYDA-S will not:

- Predict rankings
- Guarantee traffic
- Replace editorial thinking
- Act as a growth engine
- Modify schema dynamically
- Operate across projects

---

## 14. Summary

BYDA-S is a controlled, deterministic audit engine.

It respects:

- Project isolation
- Transaction atomicity
- Event logging invariants
- Human authority
- Cost discipline

It strengthens semantic integrity without surrendering control to automation.

End of hardened revision.
