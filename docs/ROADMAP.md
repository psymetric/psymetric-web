# PsyMetric Roadmap (Binding)

This roadmap is the **single source of truth for scope**.

Rules:
- If it’s not in the current active phase, it is out of scope.
- Any scope change requires an explicit roadmap edit.
- System invariants are non‑negotiable: **project isolation**, **transactional mutations + event logging**, **determinism**, **API-only assistants**.

Related specs:
- `docs/BYDA-S-SPEC.md`
- `docs/VSCODE-EXTENSION-SPEC.md`
- `docs/04-LLM-OPERATING-RULES.md`
- `docs/07-RELATIONSHIP-AND-EVENT-VOCABULARY.md`
- `docs/specs/SIL-1-OBSERVATION-LEDGER.md`

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

## Phase 0.1 — Search Intelligence Layer (SIL-1) — Observation Ledger (NEXT)

Objective: introduce a minimal, deterministic, immutable observation ledger for search reality.

Authoritative spec:
- `docs/specs/SIL-1-OBSERVATION-LEDGER.md`

Scope (SIL-1 only):
- Add Prisma models:
  - `KeywordTarget`
  - `SERPSnapshot`
- Enforce UUID consistency (`@default(uuid()) @db.Uuid`)
- Add required `EntityType` + `EventType` enum values
- Enforce query normalization at API boundary
- Implement compound index for primary read path
- Ensure full transactional event logging compliance
- Manual ingest endpoints only (no automation)

Explicit non-goals (SIL-1):
- No volatility scoring
- No clustering
- No AI citation extraction beyond flags
- No GraphRAG
- No background jobs
- No autonomous planning

Exit criteria:
- Prisma migration applied cleanly
- Event logging verified for both models
- Deterministic list queries implemented
- Core hammer extended with SIL-1 coverage

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

## Current Status Snapshot

- Multi-project hardening: ✅ done
- Phase 0 (AI News + Manual SEO): 🟡 active
  - Core endpoints: ✅ implemented + hammer-verified
  - Zod validation hardening (Phases 1–5): ✅ complete
- SIL-1 (Observation Ledger): 🟡 next — spec finalized, no schema migration yet
- Phase 1 (VS Code + MCP read-only): ✅ done
- Phase 2 (DraftArtifact lifecycle + BYDA-S S0): ✅ done
- Phase 3+: ⏳ not started

### Hammer Status

- Core hammer: 48 PASS, 0 FAIL, 2 SKIP
- Extended hammer: 77 PASS, 23 FAIL, 2 SKIP
  - Remaining FAILs correspond to unimplemented SEO W4–W7 endpoints
  - These endpoints are now formally superseded by SIL-1 scope

---

**Roadmap authority note:**
SIL-1 schema work is authorized. No additional SEO endpoint implementation occurs outside the SIL-1 specification.