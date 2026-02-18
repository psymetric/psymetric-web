# PsyMetric MCP + LLM Broker Architecture

## Controlled Semantic Engine — Hardened Alignment Revision

This document defines the MCP adapter, backend authority boundary, tool contracts, and LLM broker integration.

Status: Aligned with ROADMAP phases and adversarial audit findings.

---

## Architectural Principles

1. Database is canonical truth.
2. All canonical mutations occur inside prisma.$transaction().
3. Every mutation emits a canonical EventLog entry.
4. projectId scoping is mandatory at all layers.
5. MCP is a thin adapter — never authoritative.
6. Backend API is the sole authority for mutation and broker invocation.
7. No schema changes are introduced by architecture alone.
8. No client may submit mutation payloads that the backend does not independently load and validate.

---

## High-Level Authority Flow

Client (VS Code / Claude Desktop)
↓
MCP Server (validation + forwarding only)
↓
Backend API (authority)
↓
Prisma ORM
↓
PostgreSQL (trigger-enforced isolation)

LLM Broker is called **only by Backend API**.
MCP must never call the broker directly.

---

# Phase Discipline (Roadmap-Aligned)

## Phase 1 — Read-Only MCP Bridge (No LLM, No Writes)

Allowed tools:
- list_projects
- search_entities
- get_entity
- get_entity_graph

Explicitly excluded:
- run_byda_s_audit
- ingest_evidence_csv
- apply_approved_patches
- Any audit storage tool
- LLM Broker
- Caching infrastructure

Zero token cost. Zero mutation risk.

---

## Phase 2 — Deterministic BYDA-S (No LLM)

New tools introduced:
- run_byda_s_audit (write-class; creates DraftArtifact)
- apply_approved_patches (write-class)

Constraints:
- Audit logic is backend deterministic (S0 only)
- Audit stored as DraftArtifact (existing enum; tagged via metadata)
- No broker invocation
- No evidence ingest
- No caching

---

## Phase 3 — LLM Broker Integration

New tools introduced:
- ingest_evidence_csv

Broker-enabled behavior:
- Backend invokes broker
- Structured JSON validation enforced
- Checksum-based caching enabled
- Cache metadata returned (fresh vs cache_hit)
- Per-project rate limiting
- Per-project daily token budget guard

---

# MCP Server Responsibilities

MCP responsibilities are limited to:

- Input schema validation (shape, required fields, UUID format)
- projectId presence and UUID format enforcement
- Payload size enforcement
- Forwarding to backend API
- Returning structured backend responses unchanged

MCP must NOT:
- Construct patch objects
- Modify patch payloads
- Invoke LLM broker
- Apply business rules
- Perform database access

MCP rate limiting:
- Basic request-per-second guard per client connection
- Must not replace backend rate limiting

---

# Tool Contract Requirements (Mandatory)

Each tool must define:

- Input JSON schema
- Response JSON schema
- Standard error schema
- Required vs optional fields
- projectId requirement
- Max payload size
- Timeout behavior
- Idempotency behavior (if write tool)

No tool may exist without a formal contract.

All error responses must follow a shared error schema.

---

# Write Tool Authority Rules (Phase 2+ Only)

## run_byda_s_audit

Backend responsibilities:
1. Validate projectId
2. Load entity scoped by projectId
3. Generate deterministic audit (Phase 2) or broker-backed audit (Phase 3)
4. Persist DraftArtifact
5. Return auditDraftId + metadata

Client must not submit audit JSON.

---

## Apply Endpoint Contract

POST /api/audits/apply

Request body:
- projectId
- auditDraftId
- approvedPatchIds[]

The client must never submit patch objects.

Backend responsibilities:
1. Load AuditReport from DraftArtifact using auditDraftId
2. Verify projectId match
3. Verify auditDraftId belongs to provided projectId
4. Verify checksum + promptVersion + modelVersion
5. Verify approvedPatchIds exist in stored report
6. Reject orphan or injected patch IDs
7. Validate patch allowlist
8. Validate target entity projectId match
9. Execute all patches inside single prisma.$transaction()
10. Emit canonical EventLog entries

No partial apply allowed.

Replay safety:
- Backend must reject re-application if entity state no longer matches expected version
- Future Phase 4 may introduce explicit idempotency keys

---

## ingest_evidence_csv (Phase 3+)

Client validation allowed only for:
- File extension
- Max file size

Backend responsibilities:
- Full CSV validation
- Row-level validation
- projectId scoping
- Duplicate detection
- Structured validation summary response

---

# LLM Broker Responsibilities (Phase 3+)

Broker handles:
- Model routing
- Prompt version loading
- Structured JSON validation
- Retry once on malformed JSON
- Token usage logging
- Per-project rate limiting
- Per-project daily token budget guard

Broker must record:
- Prompt version (file-versioned)
- Model snapshot identifier (dated; aliases prohibited)
- Checksum inputs

Broker must return metadata:
- modelVersion (snapshot)
- promptVersion
- checksum
- cacheStatus (fresh | cache_hit)
- tokenUsage

Broker does NOT:
- Apply patches
- Modify canonical state
- Override backend validation

---

# Determinism & Caching (Phase 3+)

Checksum must include:
- promptVersion
- model snapshot identifier
- sorted entity JSON
- sorted relationship IDs
- sorted evidence IDs
- sorted metric IDs

Cache rules:
- 24h TTL
- Invalidated on model snapshot change
- Invalidated on checksum input change
- Cache metadata exposed to client (read-only)

Determinism is best-effort within model constraints.

---

# Security & Isolation

- All tool calls require projectId
- Backend validates project ownership
- Cross-project EntityRelation blocked at DB trigger level
- No direct DB access from clients
- No cross-project audit execution
- No mutation without transaction
- Secrets via environment variables only

---

# Explicit Non-Goals

- No auto-application of patches
- No auto-publishing
- No metric-triggered mutation
- No background automation
- No schema expansion without explicit migration

---

# Summary

MCP is transport-only.
Backend is authoritative.
Broker is advisory.
Database enforces invariants.

Tool contracts prevent ambiguity.
Phase boundaries prevent premature complexity.

This architecture preserves project isolation, transactional integrity, event logging discipline, determinism constraints, and human-gated mutation.
