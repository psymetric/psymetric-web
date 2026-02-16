# PsyMetric Roadmap (Binding)

This roadmap is the **single source of truth for scope**.

Rules:
- If it’s not in the current active phase, it is out of scope.
- Any scope change requires an explicit roadmap edit.
- System invariants are non‑negotiable: project isolation, transactional mutations, event logging, determinism, API-only assistants.

Related specs:
- `docs/BYDA-S-SPEC.md`
- `docs/VSCODE-EXTENSION-SPEC.md`
- `docs/04-LLM-OPERATING-RULES.md`
- `docs/07-RELATIONSHIP-AND-EVENT-VOCABULARY.md`

---

## Phase -1 — Multi-Project Hardening Milestone (DONE)

Objective: make cross-project contamination structurally impossible and CI/build stable.

Delivered:
- `projectId` on major tables + composite uniqueness scoped by `projectId`
- PostgreSQL trigger enforcement preventing cross-project `EntityRelation`
- Deterministic DB hammer verifying:
  - uniqueness probes
  - event existence
  - transaction rollback atomicity
  - cross-project violation blocking
- CI guardrail: lint + build + prisma generate with dummy DB URLs
- Build-time DB access fixes for public pages

Exit criteria: Actions green, hammer passes, repo stable. ✅

---

## Phase 0 — AI News Launch Loop (ACTIVE)

Objective: establish a repeatable, traceable **ingest → interpret → draft → publish** loop for AI News.

Scope:
- Source capture (manual first; extension capture as available)
- News entity creation/editing (project-scoped)
- Publish lifecycle (human-only)
- Event timeline visibility
- Basic metrics snapshot recording (manual)

Non-goals:
- No autonomous publishing
- No LLM-driven mutation
- No BYDA-S audits required to ship news

Exit criteria:
- Consistent news cadence
- No orphaned entities (all project-scoped)
- Publish workflow reliable
- Public `/news` index + detail pages stable and indexable

---

## Phase 1 — Operator Surface + MCP Read-Only Bridge (NEXT)

Objective: prove the VS Code operator surface and MCP plumbing **without any write capability**.

Scope (MCP tools: read-only only):
- `list_projects`
- `search_entities`
- `get_entity`
- `get_entity_graph` (depth-limited)

Constraints:
- MCP validates request shape (UUID format, required fields), backend remains authoritative.
- No LLM broker.
- No caching.
- No evidence ingest.
- No patch apply.

Exit criteria:
- Tool input/output schemas defined (JSON schema or equivalent)
- Standard error schema defined
- VS Code extension can call all read tools against backend
- projectId scoping verified end-to-end

---

## Phase 2 — BYDA-S Phase 3-A (S0) With Zero LLM (NEXT)

Objective: implement the audit storage + rendering + apply pipeline **without LLM involvement**.

Scope:
- S0-only audit generator (deterministic, rules-based)
- Store AuditReport as `DraftArtifact` (no schema migration required)
- VS Code webview displays AuditReport and proposed patches (even if empty)
- Apply endpoint exists and is fully transactional, but only supports strictly validated patch types

Constraints:
- All writes inside `prisma.$transaction()`
- Every applied mutation emits canonical EventLog entries
- Apply accepts **only** `auditDraftId + approvedPatchIds[]` and loads patches from stored report (no client-injected patch objects)

Exit criteria:
- DraftArtifact storage verified
- VS Code rendering verified
- Apply flow verified with atomic rollback behavior
- Event logging verified

---

## Phase 3 — LLM Broker Integration for BYDA-S (Read + Propose Only)

Objective: enable LLM-assisted audits that generate structured reports and patch proposals, while keeping mutation human-gated.

Scope:
- Backend calls broker; MCP does not call broker directly
- Prompt versioning + model snapshot version capture
- Deterministic checksum spec implemented and enforced
- Cache-by-checksum (bounded TTL)
- Strict output schema validation (reject malformed JSON)

Constraints:
- Audits may write DraftArtifact, but must not mutate canonical entities
- Any proposed patch must carry evidence references or be severity-capped by backend rules

Exit criteria:
- Stable audit generation for one entity type
- Caching works and is safe across model/version changes
- Cost controls (rate limit + daily budget guard) in place

---

## Phase 4 — Patch Apply Expansion (Still Human-Gated)

Objective: expand supported patch vocabulary while preserving safety.

Scope:
- Expand allowlisted patch types (only those mapped to backend-validated operations)
- Idempotency guards for apply
- Stale-audit detection (entity version / updatedAt gating)

Constraints:
- No auto-apply
- No background runs
- No cross-project operations

Exit criteria:
- Apply can safely handle common remediation actions
- No injection vectors (patch IDs must exist in stored audit)

---

## Phase 5 — Structured Education Layer (Concepts / Guides / Wiki)

Objective: expand beyond News into evergreen education and internal semantic cohesion.

Scope:
- Concepts + Guides + Projects as first-class canonical entities
- Wiki projection and relationship-driven navigation
- Internal linking discipline enforced by validation rules

Exit criteria:
- Canonical knowledge graph growing steadily
- No orphan pages; relationships intentional and project-scoped

---

## Phase 6 — Experiments Layer

Objective: publish structured experiments (e.g., BYDA validation) without destabilizing canonical education.

Scope:
- Experiments entity type (or modeled as Projects with a strict template)
- Versioned experiment logs
- Cross-links into Concepts/Guides/Projects

Exit criteria:
- Repeatable experiment format
- Clear separation of experimental claims vs canonical knowledge

---

## Phase 7 — GraphRAG / Advanced Retrieval (FUTURE)

Preconditions:
- Mature entity graph
- Consistent evidence ingestion
- Stable audit and apply flows

Constraints:
- Retrieval assists drafting and audit; it does not bypass human approval.

---

## Phase 8 — OpenClaw Assistant / Agent Orchestration (FUTURE)

Preconditions:
- All assistants operate via API only
- Mature dataset + strong invariants
- Proven safe apply workflow

Constraints:
- No autonomous publishing
- No uncontrolled state mutation

---

## Current Status Snapshot (Update as work completes)

- Multi-project hardening: ✅ done
- Phase 0 (AI News): 🟡 in progress
- MCP read-only bridge: ⏳ next
- BYDA-S S0 pipeline: ⏳ planned
