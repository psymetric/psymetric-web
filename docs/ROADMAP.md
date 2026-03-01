# PsyMetric Roadmap (Binding)

This roadmap is the **single source of truth for scope**.

Rules:
- If it's not in the current active phase, it is out of scope.
- Any scope change requires an explicit roadmap edit.
- System invariants are non‑negotiable: **project isolation**, **transactional mutations + event logging**, **determinism**, **API-only assistants**.

Related specs:
- `docs/BYDA-S-SPEC.md`
- `docs/VSCODE-EXTENSION-SPEC.md`
- `docs/04-LLM-OPERATING-RULES.md`
- `docs/07-RELATIONSHIP-AND-EVENT-VOCABULARY.md`
- `docs/specs/SIL-1-OBSERVATION-LEDGER.md`

---

## Current System State Snapshot

> This section reflects the actual implemented state of `main` as of the last documentation reconciliation.
> It is the authoritative reference for what exists, what does not exist, and what is intentionally deferred.

### What Exists

**Core Architecture**
- Multi-project isolation via `resolveProjectId()` header scoping
- `projectId` on all domain tables
- Cross-project non-disclosure (404)
- `prisma.$transaction()` wrapping every mutation with co-located EventLog entry
- Deterministic ordering enforced in all read endpoints
- Enum vocabularies canonicalized in Prisma schema and validation layer
- UUID conventions throughout (`@default(uuid()) @db.Uuid`)

**Zod Migration — Phases 1–5 (Complete)**

All write endpoints below are migrated to Zod with `safeParse()`, `.strict()` where appropriate, flattened error mapping, malformed JSON guards, and enum-safe typing:
- `POST /api/entities`
- `POST /api/source-items/capture`
- `PUT /api/source-items/[id]/status`
- `POST /api/relationships`
- `POST /api/draft-artifacts`

**SIL-1 — Observation Ledger (Schema + Create Endpoints Implemented)**

Prisma models in production schema:
- `KeywordTarget`
- `SERPSnapshot`

Schema hardening applied:
- UUID conventions (`@default(uuid()) @db.Uuid`) on both models
- `updatedAt` on `KeywordTarget`
- `payloadSchemaVersion` on `SERPSnapshot`
- `aiOverviewStatus` as application-validated tri-state string (`"present"` | `"absent"` | `"parse_error"`)
- Nullable `validAt` on `SERPSnapshot`
- Compound index on `(projectId, query, locale, device, capturedAt)`
- `EntityType` enum expanded with `keywordTarget`, `serpSnapshot`
- `EventType` enum expanded with `KEYWORD_TARGET_CREATED`, `SERP_SNAPSHOT_RECORDED`
- Reverse relations on `Project` for both models

Create endpoints implemented:
- `POST /api/seo/keyword-targets` — query normalization, uniqueness enforcement, EventLog discipline
- `POST /api/seo/serp-snapshots` — idempotent replay (200 on duplicate), strict Zod validation, EventLog discipline

**Hammer Coverage: 62 PASS, 0 FAIL, 2 SKIP**

SIL-1 hammer coverage includes:
- Query normalization
- Duplicate handling
- Cross-project isolation
- Validation failures
- Idempotency
- Malformed JSON guards

### What Does Not Exist

**SIL-1 list/update/delete endpoints** — not implemented. Create endpoints only.

**W4–W7 SEO endpoints** — not implemented. Formally superseded by SIL-1 scope boundaries:
- `POST /api/seo/keyword-research` (W4)
- `POST /api/seo/serp-snapshot` (W5, the pre-SIL-1 DraftArtifact-based version)
- `POST /api/seo/content-brief` (W6)
- `POST /api/seo/ai-keyword-volume` (W7)

**verify-freshness endpoint** — not implemented.

**SIL-2 (delta detection, volatility scoring)** — not started. No schema work, no endpoints.

**Phase 3+ features** — LLM broker integration, patch apply, structured education layer, experiments layer, GraphRAG — all future.

### What Is Intentionally Deferred

- No volatility scoring (SIL-2 scope)
- No keyword clustering (SIL-2 scope)
- No AI citation extraction beyond status flags (SIL-2+ scope)
- No background ingestion jobs (explicitly excluded from all current phases)
- No autonomous publishing (system invariant)
- No list/GET endpoints for `KeywordTarget` or `SERPSnapshot` (next increment within SIL-1)

---

## Phase -1 — Multi-Project Hardening Milestone (DONE)

Objective: make cross-project contamination structurally impossible and CI/build stable.

Status: ✅ complete

---

## Phase 0 — AI News + Manual SEO Instrumentation (ACTIVE)

Objective: establish a repeatable, traceable **ingest → interpret → draft → publish → measure** loop for AI News, plus manual SEO instrumentation.

Scope:
- Source capture (manual first; VS Code extension capture as available)
- News entity creation/editing (project-scoped)
- Publish lifecycle (human-only)
- Event timeline visibility
- Manual metric snapshot recording
- Manual SEO search-performance ingest (bulk endpoint)
- Canonical quotable block creation for GEO optimization
- Deterministic read APIs for operator tooling (news, SEO, quotable blocks)
- API hammer coverage for all Phase 0 endpoints

Non-goals:
- No autonomous publishing
- No LLM-driven mutation
- No background ingestion jobs
- No dashboard UI (VS Code extension is the operator surface)

Exit criteria:
- Consistent news cadence
- No orphaned entities (all project-scoped)
- Publish workflow reliable
- Public `/news` index + detail pages stable and indexable
- SEO ingest and quotable block flows verified end-to-end

---

## Phase 0.1 — Search Intelligence Layer (SIL-1) — Observation Ledger (IN PROGRESS)

Objective: introduce a minimal, deterministic, immutable observation ledger for search reality.

Authoritative spec:
- `docs/specs/SIL-1-OBSERVATION-LEDGER.md`

Scope (SIL-1 only):
- ✅ Add Prisma models: `KeywordTarget`, `SERPSnapshot`
- ✅ Enforce UUID consistency (`@default(uuid()) @db.Uuid`)
- ✅ Add required `EntityType` + `EventType` enum values
- ✅ Enforce query normalization at API boundary
- ✅ Implement compound index for primary read path
- ✅ Ensure full transactional event logging compliance
- ✅ Manual ingest endpoints: `POST /api/seo/keyword-targets`, `POST /api/seo/serp-snapshots`
- ✅ Hammer coverage extended with SIL-1 cases
- ⏳ List endpoints (`GET /api/seo/keyword-targets`, `GET /api/seo/serp-snapshots`) — not yet implemented
- ⏳ Update and delete endpoints — intentionally deferred

Explicit non-goals (SIL-1):
- No volatility scoring
- No clustering
- No AI citation extraction beyond flags
- No GraphRAG
- No background jobs
- No autonomous planning

Exit criteria:
- ✅ Prisma migration applied cleanly
- ✅ Event logging verified for both models
- ✅ Core hammer extended with SIL-1 coverage
- ⏳ Deterministic list queries implemented

---

## Phase 1 — VS Code Operator Surface + MCP Read-Only Bridge (DONE)

Status: ✅ complete

---

## Phase 2 — BYDA-S Phase 3-A (S0) With Zero LLM (DONE)

Status: ✅ complete

---

## Phase 3 — LLM Broker Integration for BYDA-S (Read + Propose Only)

Status: ⏳ future

---

## Phase 4 — Patch Apply Expansion (Still Human-Gated)

Status: ⏳ future

---

## Phase 5 — Structured Education Layer (Concepts / Guides / Wiki)

Status: ⏳ future

---

## Phase 6 — Experiments Layer

Status: ⏳ future

---

## Phase 7 — GraphRAG / Advanced Retrieval (FUTURE)

Preconditions:
- Mature entity graph
- Consistent evidence ingestion
- Stable audit and apply flows
- SIL-1 observation ledger operational

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

## Hammer Status

- Core + SIL-1 hammer: **62 PASS, 0 FAIL, 2 SKIP**
  - 2 SKIPs correspond to missing cross-project header in test environment configuration
  - W4–W7 FAILs from prior extended hammer runs are no longer tracked: those endpoints are not in current scope

---

**Roadmap authority note:**
SIL-1 list endpoint work is the next authorized increment. No additional SEO endpoint implementation occurs outside the SIL-1 specification. W4–W7 are formally deferred and will not be implemented in their original DraftArtifact-based form without an explicit roadmap amendment.
