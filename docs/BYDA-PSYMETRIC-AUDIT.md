# BYDA-P — PsyMetric Platform Audit Methodology

**Version:** 1.0
**Status:** Active
**Last updated:** February 18, 2026
**Purpose:** Periodic health audit for the PsyMetric platform, run by Claude on request.

---

## Overview

BYDA-P (Because You Definitely forgot something — PsyMetric edition) is a focused audit methodology tailored to PsyMetric's architectural invariants, multi-project isolation model, and phased development approach.

Unlike the original BYDA methodology (designed for a generic project planner with 16 layers and database-stored audit history), BYDA-P is streamlined for a solo-operator Next.js/Prisma/PostgreSQL platform where the audit itself runs as an interactive Claude session against the live codebase.

### What This Is

- A structured checklist Claude executes against the actual repo files
- Produces a timestamped markdown report with findings
- Identifies invariant violations, drift, and technical debt
- Classifies findings by severity (BLOCKING / HIGH / MEDIUM / LOW)
- Generates a readiness score

### What This Is Not

- Not a database-stored audit system (that's BYDA-S)
- Not automated CI (that's the GitHub Actions workflow)
- Not a speculative architecture review
- Not a roadmap planning tool

---

## Audit Profiles

| Profile | Layers | Time Estimate | When to Use |
|---------|--------|---------------|-------------|
| **Quick** | L0–L4 | 10–15 min | Before commits, after changes |
| **Standard** | L0–L7 | 20–30 min | Weekly health check, before phase transitions |
| **Full** | L0–L9 | 30–45 min | Monthly deep review, after major milestones |

Default: **Standard** unless specified otherwise.

---

## Severity Levels

| Severity | Description | Score Impact |
|----------|-------------|--------------|
| **BLOCKING** | System invariant violation. Must fix before any other work. | -20 pts |
| **HIGH** | Significant risk. Fix within current work session. | -10 pts |
| **MEDIUM** | Should fix. Acceptable to defer with acknowledgment. | -5 pts |
| **LOW** | Minor improvement. Fix when convenient. | -2 pts |

**Readiness Score:** Starts at 100, deductions per finding. Floor at 0.

**Health Thresholds:**
- ≥ 90: Green — system is healthy
- 75–89: Yellow — attention needed
- < 75: Red — stop and fix before continuing

---

## Layer 0: System Invariant Compliance

**Purpose:** Verify PsyMetric's non-negotiable invariants from `docs/SYSTEM-INVARIANTS.md` hold true in actual code.

**Source of truth:** `docs/SYSTEM-INVARIANTS.md`

**Checks:**

### 0.1 — Project Isolation (Invariants §1.1–§1.3)

Read every API route file in `src/app/api/`. For each:

- [ ] Route calls `resolveProjectId(request)` and uses the result
- [ ] All Prisma queries include `where: { projectId }` (or equivalent scoping)
- [ ] Entity lookups by UUID also verify `projectId` matches (no cross-project leakage)
- [ ] POST/PATCH/DELETE routes verify entity ownership before mutation
- [ ] `EntityRelation` creation validates both entities share the same `projectId`

**How to check:** Read route files. Search for `prisma.` calls. Confirm each has `projectId` in its `where` clause or creation `data`.

**Failure examples:**
- `prisma.entity.findUnique({ where: { id } })` without subsequent projectId check → BLOCKING
- List endpoint missing `projectId` in where → BLOCKING
- Relationship route not calling `assertSameProject()` → BLOCKING

### 0.2 — Transaction Atomicity (Invariants §2.1–§2.2)

For every API route that mutates state:

- [ ] Mutation + EventLog write wrapped in single `prisma.$transaction()`
- [ ] No state change can occur without its corresponding event
- [ ] No partial writes possible (single transaction, not sequential calls)

**How to check:** Read every POST/PATCH/DELETE handler. Find all `prisma.*.create/update/delete` calls. Verify they're inside `$transaction()` alongside an `eventLog.create`.

**Failure examples:**
- State mutation outside `$transaction()` → BLOCKING
- EventLog write in separate call after mutation → BLOCKING

### 0.3 — Event Logging (Invariants §3.1–§3.2)

- [ ] Every mutation route emits at least one EventLog entry
- [ ] EventLog entries include: `eventType`, `entityType`, `entityId`, `actor`, `projectId`
- [ ] GET routes do NOT create EventLog entries
- [ ] EventLog records are never updated (append-only)

**How to check:** Read mutation routes. Confirm `eventLog.create` inside transaction. Read GET routes, confirm no writes.

### 0.4 — Determinism (Invariants §4.1–§4.2)

- [ ] All list endpoints have `orderBy` with stable tie-breaker (includes `id`)
- [ ] Enum validation is explicit (not unsafe casting)
- [ ] No `as unknown as EnumType` or similar escape hatches

**How to check:** Read GET list handlers. Confirm `orderBy` arrays end with `{ id: 'desc' }` or similar tie-breaker.

---

## Layer 1: Schema–Code Consistency

**Purpose:** Verify the Prisma schema matches what the code actually uses.

**Checks:**

### 1.1 — Enum Sync

- [ ] Every Prisma enum value used in validation code (`src/lib/validation.ts`) matches the schema
- [ ] `VALID_METRIC_TYPES` array includes all MetricType enum values from schema
- [ ] `VALID_PLATFORMS` array includes all Platform enum values from schema
- [ ] No code references enum values that don't exist in schema
- [ ] No schema enum values are missing from validation arrays

**How to check:** Compare `prisma/schema.prisma` enum definitions against `src/lib/validation.ts` arrays.

### 1.2 — Model Field Usage

- [ ] API routes don't reference model fields that don't exist in schema
- [ ] New schema fields (e.g., `lastVerifiedAt`, `schemaVersion`, `source`, `contentHash`) have corresponding API support if Phase 0-SEO workflows require them
- [ ] No Prisma `select` clauses reference non-existent fields

### 1.3 — Relation Integrity

- [ ] All `@relation` fields in schema have corresponding reverse relations
- [ ] `onDelete` behavior is explicitly set (not relying on defaults)
- [ ] Composite unique constraints match what code expects

### 1.4 — Migration State

- [ ] `prisma/migrations/` directory exists and contains at least one migration
- [ ] No pending schema changes that haven't been migrated (run `prisma migrate status` mentally by comparing schema to last migration)

---

## Layer 2: API Contract Consistency

**Purpose:** Verify API routes follow consistent patterns and match documentation.

**Checks:**

### 2.1 — Response Shape Consistency

- [ ] All success responses use `successResponse()`, `createdResponse()`, or `listResponse()` from `src/lib/api-response.ts`
- [ ] All error responses use `badRequest()`, `notFound()`, `conflict()`, `serverError()` from same
- [ ] Error responses follow shape: `{ error: { code, message, details? } }`
- [ ] List responses include `pagination: { page, limit, total, hasMore }`

### 2.2 — UUID Validation

- [ ] Every endpoint accepting UUID parameters validates format with regex before querying DB
- [ ] Invalid UUIDs return 400, not 500

### 2.3 — Pagination

- [ ] All list endpoints support `?page=&limit=` via `parsePagination()`
- [ ] `limit` is capped at 100
- [ ] `page` is 1-indexed

### 2.4 — HTTP Method Correctness

- [ ] GET = read-only (no mutations, no events)
- [ ] POST = create (returns 201)
- [ ] PATCH = update (returns 200)
- [ ] DELETE = remove (returns 200)

---

## Layer 3: Documentation Coherence

**Purpose:** Verify documentation reflects actual system state and isn't contradictory.

**Checks:**

### 3.1 — Roadmap Accuracy

- [ ] `docs/ROADMAP.md` "Current Status Snapshot" matches actual state
- [ ] Active phase scope matches what's actually implemented
- [ ] No features from future phases exist in current code (phase drift)

### 3.2 — Cross-Document Consistency

- [ ] `docs/SYSTEM-INVARIANTS.md` rules are not contradicted by other docs
- [ ] `docs/07-RELATIONSHIP-AND-EVENT-VOCABULARY.md` enum lists match Prisma schema
- [ ] `docs/08-METRIC-TYPE-VOCABULARY.md` matches MetricType enum in schema
- [ ] SEO spec documents (if applicable) match schema enum values

### 3.3 — Stale Documentation

- [ ] No docs reference models/fields/endpoints that don't exist
- [ ] No docs describe behavior that code doesn't implement
- [ ] `docs/operations-planning-api/` contracts match actual route implementations

---

## Layer 4: Build & CI Health

**Purpose:** Verify the project builds and CI passes.

**Checks:**

### 4.1 — Build Chain

- [ ] `package.json` has correct scripts: `lint`, `build`, `dev`
- [ ] `tsconfig.json` has strict TypeScript settings appropriate for Next.js
- [ ] No `any` types in `src/lib/` utility files (except Prisma `Json` fields)
- [ ] ESLint config exists and doesn't have conflicting rules

### 4.2 — CI Pipeline

- [ ] `.github/workflows/ci.yml` exists and runs: `npm ci` → `prisma generate` → `lint` → `build`
- [ ] CI uses dummy DATABASE_URL (not production)
- [ ] CI triggers on PR and push to main

### 4.3 — Dependency Health

- [ ] `package-lock.json` exists and is committed
- [ ] No known critical vulnerabilities in direct dependencies (check if `npm audit` would flag anything obvious based on package.json versions)
- [ ] Prisma version is consistent between root and MCP server

---

## Layer 5: MCP Server Alignment

**Purpose:** Verify the MCP server is consistent with the main application.

**Checks:**

### 5.1 — Schema Parity

- [ ] `mcp/claude-desktop/prisma/schema.prisma` matches `prisma/schema.prisma` (or uses same source)
- [ ] MCP server's tool input schemas match actual API contract expectations
- [ ] MCP server only exposes read-only tools (per Phase 1 roadmap constraint)

### 5.2 — Tool Correctness

- [ ] All MCP tools validate `projectId` as UUID
- [ ] MCP tools don't call DataForSEO or any external API directly (backend-only per architecture)
- [ ] Error responses from MCP tools include structured error info

### 5.3 — Security

- [ ] MCP server credentials not committed to git (check `.gitignore`)
- [ ] `.env` files in `.gitignore`
- [ ] No hardcoded secrets in source files

---

## Layer 6: Data Model Integrity

**Purpose:** Verify the database schema enforces the constraints the docs promise.

**Checks:**

### 6.1 — Project Scoping at DB Level

- [ ] Every domain model has `projectId String @db.Uuid` with FK to Project
- [ ] `onDelete: Restrict` on Project FK (prevents accidental project deletion)
- [ ] Composite unique constraints include `projectId` where appropriate

### 6.2 — Index Coverage

- [ ] Foreign key columns have indexes
- [ ] Common query patterns have supporting indexes (e.g., `projectId + status + createdAt`)
- [ ] No obviously missing indexes for list endpoint filter patterns

### 6.3 — Type Correctness

- [ ] `MetricSnapshot.value` is `Float` (not `Int`)
- [ ] All UUID fields use `@db.Uuid`
- [ ] DateTime fields use `@default(now())` or `@updatedAt` appropriately
- [ ] No `String` fields storing what should be enums

### 6.4 — Constraint Completeness

- [ ] `SearchPerformance` has composite unique `(projectId, query, pageUrl, dateStart, dateEnd)`
- [ ] `Entity` has composite unique `(projectId, entityType, slug)`
- [ ] `EntityRelation` has composite unique preventing duplicate relationships
- [ ] `SystemConfig.key` is unique

---

## Layer 7: Validation & Error Handling

**Purpose:** Verify validation logic is complete and error handling is robust.

**Checks:**

### 7.1 — Input Validation Completeness

- [ ] All POST endpoints validate required fields before DB access
- [ ] All enum inputs validated against allowed values
- [ ] URL fields validated with `isValidUrl()` where required
- [ ] String fields checked for empty/null where required

### 7.2 — Error Response Quality

- [ ] Validation errors return 400 with descriptive messages
- [ ] Not-found returns 404 (not 500)
- [ ] Duplicate/conflict returns 409
- [ ] All catch blocks return `serverError()` (not unhandled exceptions)
- [ ] No error responses leak internal details (stack traces, SQL errors)

### 7.3 — Edge Case Handling

- [ ] Empty request bodies handled gracefully
- [ ] Invalid JSON bodies caught and returned as 400
- [ ] Extremely long strings won't cause issues (or are length-checked)

---

## Layer 8: Testing Infrastructure

**Purpose:** Verify testing tools exist and cover critical paths.

**Checks:**

### 8.1 — Test Script Existence

- [ ] `scripts/api-hammer.ps1` exists and is current
- [ ] `scripts/db-hammer.ts` exists (even if not fully implemented)
- [ ] Scripts test project isolation specifically

### 8.2 — Critical Path Coverage

- [ ] API hammer tests all GET endpoints for status 200
- [ ] API hammer tests invalid enum values for status 400
- [ ] API hammer tests cross-project access for isolation
- [ ] Mutation + event atomicity has some verification path

### 8.3 — Test Documentation

- [ ] `docs/PSYMETRIC-TESTING.md` is current and matches actual test scripts
- [ ] Test commands documented and runnable

---

## Layer 9: Phase Discipline & Scope Creep Detection

**Purpose:** Verify no out-of-phase features have crept into the codebase.

**Checks:**

### 9.1 — Active Phase Compliance

Compare `docs/ROADMAP.md` active phase scope against actual code:

- [ ] No LLM broker integration exists if Phase 3 hasn't started
- [ ] No automated publishing workflows exist
- [ ] No background/cron jobs exist unless explicitly in active phase
- [ ] No BYDA-S audit endpoints exist unless Phase 2 is active

### 9.2 — Schema Discipline

- [ ] No enum values, models, or fields exist that aren't documented in any spec
- [ ] Schema additions trace back to an approved spec document
- [ ] No "experimental" tables or columns

### 9.3 — Deferred Capability Enforcement

Per SEO specs, verify:

- [ ] No automated LLM Mentions workflows active (gated by signal density)
- [ ] No scheduled DataForSEO calls (Phase 0-SEO is manual-only)
- [ ] No auto-apply for DraftArtifact patches
- [ ] Signal density thresholds documented and not circumvented

---

## Execution Protocol

When the operator requests a BYDA-P audit, Claude follows this protocol:

### 1. Confirm Profile

Ask which profile to run (Quick / Standard / Full) unless specified. Default: Standard.

### 2. Read Source Files

Using MCP file tools, read:
- `prisma/schema.prisma`
- `src/lib/*.ts` (all utility files)
- `src/app/api/**/*.ts` (all route files)
- `docs/SYSTEM-INVARIANTS.md`
- `docs/ROADMAP.md`
- `.github/workflows/ci.yml`
- `mcp/claude-desktop/src/*.ts` (MCP server source)

### 3. Execute Checks

Run each layer's checks against the actual file contents. For each finding:
- Classify severity
- Reference specific file and line/pattern
- Explain the invariant being violated or the risk

### 4. Generate Report

Produce a report in this format:

```markdown
# BYDA-P Audit Report — [DATE]

**Profile:** [Quick/Standard/Full]
**Readiness Score:** [N]/100
**Health Status:** [Green/Yellow/Red]

## Findings

### BLOCKING
- [Finding description] — `file:line` — [Invariant reference]

### HIGH
- ...

### MEDIUM
- ...

### LOW
- ...

## Summary
[2-3 sentence summary of system health]

## Recommended Actions
1. [Highest priority fix]
2. [Next priority]
3. ...
```

### 5. Save Report

Save to `docs/AUDIT-[YYYY-MM-DD].md` in the repository.

---

## What BYDA-P Does NOT Check

These are explicitly out of scope:

- **Runtime behavior** — BYDA-P reads code, it doesn't run the server
- **Database content** — No queries against live data
- **Performance** — No load testing or response time analysis
- **Frontend rendering** — Dashboard UI correctness is not audited
- **Third-party API availability** — DataForSEO, GSC, GA4 connectivity
- **Production deployment** — Vercel config, DNS, SSL
- **Business logic correctness** — Whether slug generation produces good slugs, etc.

These would be handled by the API hammer (runtime), DB hammer (data), and manual review respectively.

---

## Evolution

This methodology will evolve as PsyMetric grows:

- **When Phase 1 (MCP read-only) ships:** Add Layer 5 checks for tool contract validation
- **When Phase 2 (BYDA-S) ships:** Add checks for audit storage and apply pipeline
- **When Phase 3 (LLM Broker) ships:** Add checks for prompt versioning, cache safety, cost controls
- **When SEO workflows activate:** Add checks for rate limit enforcement, spend cap validation
- **When multi-project is actively used:** Add checks for cross-project trigger enforcement

The version number in this document tracks methodology changes, not audit run counts.

---

End of document.
