# PsyMetric Testing Plan

This document defines how PsyMetric should be tested in a **multi-project**, **event-logged**, **transaction-safe**, **deterministic** system.

Scope:
- Local developer testing
- CI testing
- Staging testing
- Targeted “hammer” testing (API + DB)
- MCP tooling plan (read/write repo + run deterministic test actions)

Non-goals:
- No autonomous automation agents
- No speculative data mutation
- No production writes from test tooling

---

## Core invariants to protect

PsyMetric must remain:

1. **Project-isolated**
   - Any internal endpoint must scope reads/writes by resolved `projectId`.
   - Cross-project access by UUID must return **404** (or equivalent notFound) rather than leaking existence.

2. **Transaction-safe mutations**
   - Any state change + its event log(s) must happen inside a single `prisma.$transaction()`.
   - No partial writes.

3. **Event-logged**
   - Mutations emit event logs consistently (inside the transaction).
   - Read-only endpoints do not write events.

4. **Deterministic**
   - Deterministic ordering on list endpoints (stable tie-breakers like `id`).
   - Deterministic validation and error responses.

---

## Testing layers

### 1) Local quick checks (developer loop)

Run before commits that change API behavior:

- `npm run lint`
- `npm run build`

Recommended while developing:
- `npm run dev` and manually hit endpoints.

---

### 2) API Hammer (smoke + validation + isolation)

File:
- `scripts/api-hammer.ps1`

Capabilities:
- Smoke tests for core GET endpoints
- Validation tests (invalid enums, invalid UUIDs)
- Pagination tests
- Optional cross-project isolation checks when `-OtherProjectId` / `-OtherProjectSlug` is provided

Usage:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\api-hammer.ps1 -Base "http://localhost:3000" -ProjectId "<project-uuid>"

# Optional isolation test (requires a second project)
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\api-hammer.ps1 -Base "http://localhost:3000" -ProjectId "<A>" -OtherProjectId "<B>"
```

What this catches:
- Missing `resolveProjectId()` enforcement
- Missing `where: { projectId }` scoping
- Unsafe enum handling
- Non-deterministic list outputs (via tie-breakers)

What it does **not** yet catch:
- Mutations across projects (beyond the cross-project GET check)
- Event-log invariants (write+event atomicity)
- Schema uniqueness invariants

---

### 3) DB Hammer (seed + invariant verification + cleanup)

**Goal:** deterministically seed a small graph in 2 projects and verify invariants directly against Postgres via Prisma.

Why this matters:
- API hammer verifies routes.
- DB hammer verifies **schema + invariants** independent of route logic.

Recommended implementation (CLI-first):
- Add a script: `scripts/db-hammer.ts`
- Run with Node (or `tsx`) and Prisma

Core actions:

1. **createTestProjects**
   - Create Project A + Project B with deterministic IDs or seed-based IDs.

2. **seedGraph(projectId)**
   - Create a small baseline:
     - Entities (multiple entity types)
     - SourceItems
     - Relationships
     - DraftArtifacts
     - DistributionEvents
     - MetricSnapshots
   - All `.create()` must include `projectId`.

3. **runIsolationChecks(projectA, projectB)**
   - Ensure queries scoped by `projectId` do not return other project’s data.
   - Ensure composite uniqueness includes `projectId` (try collisions within same project; allow across projects).

4. **runEventInvariantsChecks(projectId)**
   - For any seeded mutation pattern, verify:
     - state row exists
     - event log exists
     - counts match

5. **cleanup(projectId)**
   - Delete the test project(s) and all dependent rows.
   - Must be safe and bounded (only deletes under explicit projectId).

Safety gates (non-negotiable):
- Hard fail if `DATABASE_URL` appears to be production.
- Require explicit `--projectId` prefixes like `TEST_` (or deterministic UUID constants).
- Delete operations must be bounded by explicit `projectId`.

Suggested CLI interface:

```bash
# Seed, verify, cleanup in one run
node scripts/db-hammer.ts --base "staging" --projectA <uuid> --projectB <uuid> --cleanup

# Or deterministic generated IDs
node scripts/db-hammer.ts --seed 12345 --create-projects --run-checks --cleanup
```

---

## MCP server plan

### Why MCP tools

An MCP server provides **explicit, reviewable tools** that:
- Read/write files deterministically
- Run scripted checks in a controlled way
- Avoid ad hoc manual steps

### Required MCP tool categories

#### A) Repo IO tools (already in place)
- `fs_read_file`
- `fs_write_file`
- `fs_list_dir`

Usage:
- Safe code review / patching
- Doc generation
- Controlled edits

#### B) Test execution tools (recommended)

Expose tools that run deterministic scripts:

- `run_lint`
- `run_build`
- `run_api_hammer(base, projectId, otherProjectId?)`
- `run_db_hammer(args...)`

Best practice:
- These tools should run scripts and return stdout/stderr.
- They should not attempt to “infer” project IDs.

#### C) DB-safe helpers (optional, but powerful)

If you want MCP tools to manipulate DB directly, prefer **wrapping the CLI** rather than embedding Prisma in the MCP server.

Tools:
- `db_create_test_projects(seed?)`
- `db_seed_baseline(projectId)`
- `db_run_isolation_checks(projectA, projectB)`
- `db_cleanup(projectId)`

Safety must be enforced at two levels:
- In the script (hard guardrails)
- In the MCP tool wrapper (refuse unknown environments)

---

## Error logging and diagnostics

### What to log

For unexpected server failures:
- Route name + method
- Resolved `projectId` (if available)
- Prisma error codes (without leaking secrets)
- Correlation identifier (if you add one later)

### What not to log

- Secrets (tokens, headers)
- Full request bodies containing credentials

### Useful diagnostics endpoints

If desired (internal-only, project-scoped):
- `/api/system/health` – confirms DB connectivity and migration version
- `/api/system/invariants` – runs lightweight read-only checks (no writes)

These should be strictly gated and never exposed publicly.

---

## CI plan (minimal, practical)

Recommended CI steps:

1. Install dependencies
2. `prisma generate`
3. `npm run lint`
4. `npm run build`

Optional (staging-only jobs):
- Run API hammer against preview deployment with a known project header.

DB hammer is best run:
- Locally
- In a staging pipeline with a staging DB

---

## Immediate next actions

1. **Commit this document**
2. Confirm `scripts/api-hammer.ps1` is committed and used.
3. Implement `scripts/db-hammer.ts` (seed + checks + cleanup) with strict safety gates.
4. Optionally add MCP tools to run lint/build and the hammer scripts.

---

## Appendix: What “good” looks like

When testing is mature:
- Any cross-project access attempt fails deterministically.
- Every mutation produces exactly the expected event logs.
- A single command can seed two projects, run checks, and clean up.
- CI catches type/enum/validation regressions early.
