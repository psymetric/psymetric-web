This doc's purpose is to give context and adapt it to the V-Ecosystem and will be named V Project.


# Project Planner — Master Context Document
**Version:** 2.1 (Reconstructed)  
**Date:** 2025-11  
**Audience:** LLM onboarding document — read this fully before contributing to or rebuilding this project  
**Status:** Specification-complete. Runtime implementation was in-progress at time of loss.

---

## Table of Contents

1. [What Is Project Planner?](#1-what-is-project-planner)
2. [The Core Problem It Solves](#2-the-core-problem-it-solves)
3. [Philosophy & Design Principles](#3-philosophy--design-principles)
4. [The BYDA Methodology](#4-the-byda-methodology)
5. [Project Lifecycle — 9 Phases](#5-project-lifecycle--9-phases)
6. [System Architecture](#6-system-architecture)
7. [Database Schema (PostgreSQL 18)](#7-database-schema-postgresql-18)
8. [MCP Server & Tool Contracts](#8-mcp-server--tool-contracts)
9. [Core Workflows](#9-core-workflows)
10. [Technology Stack](#10-technology-stack)
11. [Key Architectural Decisions](#11-key-architectural-decisions)
12. [What Project Planner Does NOT Do](#12-what-project-planner-does-not-do)
13. [Codegen Rebuild Sequence](#13-codegen-rebuild-sequence)
14. [Glossary](#14-glossary)

---

## 1. What Is Project Planner?

Project Planner is a **local-first, documentation-first, LLM-assisted project management system** that uses PostgreSQL as its single source of truth. It is designed to manage the complete lifecycle of a software project — from initial idea through research, specification, implementation, and deployment — with an emphasis on preventing the most common failure mode in LLM-assisted development: **generating code from incomplete or ambiguous specifications**.

The system exposes all of its functionality through an MCP (Model Context Protocol) server, meaning any LLM (Claude, ChatGPT, etc.) can act as a Planner, Researcher, or Worker within the system using structured tool calls.

**In one sentence:** Project Planner is a structured documentation and audit layer that enforces 95% specification readiness before any code is written, backed by a PostgreSQL database and operated via MCP tools.

### What it stores:
- Projects, phases, features, and tasks
- Research documents (ingested Markdown), chunked and full-text indexed
- LLM-generated summaries with source citations
- Task-to-research traceability (which research justifies which task)
- BYDA audit records, gap findings, and readiness scores
- GitHub activity (commits, PRs, issues) linked to tasks
- Background job queue for async processing
- LLM call logs for observability

### Who uses it:
- A single developer (it is single-user, local-first by design)
- LLMs acting as Planners, Researchers, or Workers via MCP tools
- The human acts as decision-maker and approver throughout

---

## 2. The Core Problem It Solves

The fundamental insight behind Project Planner:

> **Most LLM-assisted software project failures occur not from inability to write code, but from skipped assumptions that become critical gaps.**

When a developer asks an LLM to "build this feature," the LLM generates code based on whatever context it has. If that context is incomplete — missing error handling specs, undefined timeout values, ambiguous authentication requirements, no migration strategy — the generated code will embed those gaps as bugs, inconsistencies, or untested edge cases that are expensive to fix later.

The traditional fix is "write better prompts." Project Planner's answer is different:

> **Build a structured documentation system that forces 95% specification completeness before code generation begins, and audit it mechanically through 16 layers of inspection.**

This transforms the LLM's input from "a vague description" to "a complete, audited, gap-free specification" — and the output quality improves proportionally.

---

## 3. Philosophy & Design Principles

### Documentation-First Development
All behavior MUST be specified in documents before it appears in code. The schema, workflows, and MCP contracts are defined completely before implementation begins. This is not optional — it is the core methodology.

### PostgreSQL as Single Source of Truth
There is one place where all project state lives: the PostgreSQL database. There are no flat files, no side caches, no inconsistent state across services.

### Context Quality Determines Output Quality
The system is built on the premise that superior context leads to superior LLM output. The 95% readiness gate enforces this. A low-quality specification produces low-quality code; the audit system exists to prevent that.

### LLM-Friendly, Deterministic Rules
All rules — phase gates, audit thresholds, gap severities — are numerical and deterministic. An LLM can evaluate any project state and reach the same conclusion a human would. There is no "judgment call" in the gate system.

### Single-User, Local-First
Project Planner is explicitly scoped to a single user running locally. Multi-user collaboration, cloud hosting, and real-time sync are explicitly out of scope. This keeps the architecture simple and the focus sharp.

### Artifact-Agnostic
The BYDA audit methodology works for any project type: database-heavy apps, API-first services, CLI tools, infrastructure-as-code, or documentation-only projects. It does not assume PostgreSQL, MCP, or any specific technology in the artifacts being audited.

---

## 4. The BYDA Methodology

**BYDA** stands for **"Because You Definitely Forgot Something Obvious"** (originally "Bitch You Dumb Audit" — sanitized for professional use, but the confrontational spirit is intentional).

BYDA is the audit engine at the heart of Project Planner. It is a 16-layer inspection framework that systematically finds specification gaps before they become implementation bugs.

### Core Principles
1. **Artifact-Agnostic** — works for any project type
2. **Layered Inspection** — 16 layers (0–15), each targeting a different class of failure
3. **Objective Scoring** — gaps are weighted and produce a numerical readiness score
4. **Gate Enforcement** — hard gates block phase progression until thresholds are met
5. **Traceability** — every gap is tracked from detection → task creation → resolution
6. **LLM-Friendly** — deterministic rules, no subjective evaluation

### Audit Types and Phase Gates

| Audit Type | Phase Gate | Layers Applied | Threshold | Purpose |
|---|---|---|---|---|
| **BYDA-Research** | Phase 3→4 | 0–7, 9–10 | ≥95% | Validate specs before implementation |
| **BYDA-Launch** | Phase 5→6 | 1–3, 7–8, 11–13 | ≥90% | Validate operational readiness before deploy |
| **BYDA-Architecture** | Phase 2→3 | 0–4, 9 | ≥80% | Validate design before detailed spec |
| **BYDA-Code** | Phase 4 (continuous) | 7, 10, 14 | No hard gate | Detect spec-code drift during implementation |
| **BYDA-Hygiene** | Phase 7+ (monthly) | All layers | ≥85% | Prevent technical debt in maintenance |

### The 16 Layers

#### Layer 0 — Prerequisites & Environment
Checks that all prerequisites are declared and accessible. Verifies runtime environments, tooling versions, and infrastructure dependencies are documented.

**Failure conditions:** Missing dependency declarations (BLOCKING, −20%); undeclared runtime requirements (HIGH, −10%); missing environment variable documentation (MEDIUM, −5%).

#### Layer 1 — Foundation Sweep
Reviews all core project documents for completeness. Checks README, architecture docs, tech stack, and contributing guides.

**Failure conditions:** Missing README (BLOCKING); no tech stack doc (HIGH, −10%); missing architecture overview (HIGH, −10%).

#### Layer 2 — Operations & Infrastructure
Validates infrastructure specifications: Docker/compose files, CI configuration, secrets management, deployment procedures.

**Failure conditions:** No deployment documentation (BLOCKING); missing secrets handling spec (HIGH, −10%); no backup strategy (MEDIUM, −5%).

#### Layer 3 — Security
Audits authentication, authorization, input validation, secrets handling, and data protection specifications.

**Failure conditions:** No auth specification (BLOCKING); missing input validation rules (HIGH, −10%); no secrets rotation policy (MEDIUM, −5%).

#### Layer 4 — Data Model Consistency
Verifies that all data models are internally consistent: schema matches migrations, foreign key relationships are valid, constraints are documented.

**Failure conditions:** Schema-migration mismatch (BLOCKING); undocumented constraints (HIGH, −10%); missing index rationale (LOW, −2%).

#### Layer 5 — Error Handling & Edge Cases
Ensures all error conditions are documented with error codes, messages, retry logic, and fallback behavior.

**Failure conditions:** Undocumented error paths (BLOCKING, −20%); missing error codes (HIGH, −10%); no retry policy (MEDIUM, −5%).

#### Layer 6 — Testing & Quality Gates
Validates that test strategy, coverage targets, and CI/quality gates are specified.

**Failure conditions:** No test strategy (BLOCKING); missing coverage targets (HIGH, −10%); no performance test criteria (MEDIUM, −5%).

#### Layer 7 — Cross-Artifact Contract Consistency *(Key Layer)*
The most sophisticated layer. Checks that all project artifacts are internally consistent with each other: database schema matches API contracts, API contracts match client implementations, validation schemas match storage schemas.

**Artifacts covered:** Database schemas, API specs (REST/GraphQL/MCP), validation schemas (Pydantic/Zod), documentation.

**Checks performed:**
- Column names in schema match field names in API responses
- Required fields in API match NOT NULL constraints in DB
- Validation rules in schemas match DB constraints
- Deprecated patterns identified (old syntax in docs)
- Broken cross-document links detected
- TODOs in specifications flagged

**Failure conditions:** Schema-API mismatch (BLOCKING, −20%); broken documentation links (HIGH, −10%); deprecated patterns in active docs (MEDIUM, −5%); TODO markers in specs (MEDIUM, −5%).

#### Layer 8 — Drift Detection (BYDA-Drift)
Compares actual implementation state against specifications. Used post-implementation to detect when code has diverged from the documentation that generated it.

**Failure conditions:** Code-spec divergence >10% (HIGH, −10%); stale specifications (MEDIUM, −5%).

#### Layer 9 — Meta-Validation (Audit the Audit)
Verifies that the audit methodology itself is being applied correctly. Validates that audit queries work on known test cases, pattern matching is functioning, and scoring formulas are consistent.

#### Layer 10 — Temporal Drift Detection
Detects time-based inconsistencies: old documentation describing new code, research documents that have gone stale, migration timestamps that don't form a valid chronological sequence.

**Failure conditions:** Migration references schema >6 months older (HIGH, −10%); research stale >90 days for active tech (MEDIUM, −5%).

#### Layer 11 — Reverse Audit (Devil's Advocate)
Attempts to disprove findings by searching for counter-evidence. Verifies that "missing" features aren't simply documented elsewhere non-standardly, and reduces false positives.

#### Layer 12 — Human Bias & Assumption Check
Challenges implicit assumptions:
- "Obviously reliable" systems that have no monitoring
- "Critical" data with no automated backups
- "Internal only" APIs with no rate limiting
- "Rarely failing" code paths with no logs

#### Layer 13 — External Dependency Audit
Validates that all external dependencies are documented, version-locked, have fallback strategies, and have licenses reviewed.

#### Layer 14 — Specification-Code Parity
Line-by-line comparison between documented behavior and implemented behavior. Used as a continuous check during Phase 4 (Implementation).

#### Layer 15 — End-to-End Flow Validation
Traces complete user workflows through all system layers to verify that no step in the documented flow is left unimplemented.

### Gap Severity & Scoring

| Severity | Score Impact | Task Priority | Meaning |
|---|---|---|---|
| BLOCKING | −20% per gap | P1 | Cannot proceed; must resolve before gate |
| HIGH | −10% per gap | P2 | Should resolve before gate |
| MEDIUM | −5% per gap | P3 | Can defer with documentation |
| LOW | −2% per gap | P4 | Nice-to-have |

**Gate Pass Logic:**
```
IF readiness_score < threshold:
    FAIL - cannot advance to next phase
ELSE IF blocking_gap_count > 0:
    FAIL - score insufficient due to blocking gaps
ELSE:
    PASS - may advance
```

### Artifact Type Registry

BYDA operates on **artifacts** — formal, versioned project components that define system behavior. The registry defines which artifacts a project uses and which consistency rules apply between them.

**Artifact Types:**
- Database Schema (PostgreSQL DDL, migration files)
- API Specification (OpenAPI, GraphQL schema, MCP tool contracts)
- Validation Schema (Pydantic models, Zod schemas)
- Configuration (environment variables, Docker compose, CI config)
- Documentation (Markdown specs, architecture docs, runbooks)
- Infrastructure-as-Code (Terraform, Helm charts)
- Test Definitions (test files, coverage config)

When a project declares its artifact types, BYDA applies only the relevant consistency checks and skips inapplicable layers. A documentation-only project will skip Layer 4 (Data Model Consistency). A CLI tool will skip API contract checks.

---

## 5. Project Lifecycle — 9 Phases

Project Planner enforces a formal 9-phase lifecycle. Projects cannot skip phases. Hard gates (BYDA audit thresholds) must be passed to advance.

```
Phase 0: Discovery
Phase 1: Research
Phase 2: Architecture
Phase 3: Specification ──── [BYDA-Research Gate: ≥95%] ────► Phase 4
Phase 4: Implementation
Phase 5: Validation ────── [BYDA-Launch Gate: ≥90%] ──────► Phase 6
Phase 6: Deployment
Phase 7: Operations
Phase 8: Evolution
```

### Phase 0 — Discovery
**Purpose:** Capture the idea, define scope, identify unknowns.

**Activities:** Create project record, write initial description, identify key questions, define success criteria, list known unknowns.

**Required artifacts:** Project definition document, initial scope statement.

**Exit criteria:** Project is created in DB, scope is written, key questions are identified.

**Forbidden:** Architectural decisions, technology choices, any coding.

### Phase 1 — Research
**Purpose:** Answer the unknowns identified in Phase 0 through systematic research.

**Activities:** Upload Markdown research documents, LLM-assisted summarization, deep research sessions, technology evaluation.

**Required artifacts:** Research documents in DB (ingested via pipeline), summaries with citations, technology stack declaration.

**Exit criteria:** All key questions from Phase 0 have research documents. Technology stack is declared and locked.

**LLM roles:** Researcher (web search, summarization), Planner (identify gaps, generate follow-up questions).

### Phase 2 — Architecture
**Purpose:** Design the system based on research findings.

**Activities:** Database schema design, API design, component design, decision recording.

**Required artifacts:** Architecture document, schema design, architecture decision records (ADRs), component diagram.

**Gate:** BYDA-Architecture (≥80% across Layers 0–4, 9) before advancing to Phase 3.

**Exit criteria:** Architecture documented, BYDA-Architecture gate passed.

### Phase 3 — Specification
**Purpose:** Write complete, unambiguous specifications that an LLM can implement without gaps.

**Activities:** Write full specifications for every component, define all error conditions, specify all constants and timeouts, write MCP tool contracts, document all workflows.

**Required artifacts:** Complete specs for: schema, API, error handling, logging, security, testing strategy, deployment, job processing, context assembly.

**THE CRITICAL GATE — BYDA-Research (≥95%):**
At the end of Phase 3, a full BYDA-Research audit runs across Layers 0–7, 9–10. The project cannot advance to Phase 4 until:
- Readiness score ≥ 95%
- Zero BLOCKING gaps remain

This gate is the core innovation of Project Planner. It ensures that by the time code generation begins, the specification is essentially complete.

**Common BLOCKING findings caught here:**
- Ambiguous terms ("appropriate duration", "reasonable timeout") → must be specific numbers
- TODO markers in specifications → must be resolved
- Missing error codes → must be defined
- Undocumented edge cases → must be handled
- Cross-document contradictions → must be resolved

### Phase 4 — Implementation
**Purpose:** Build the system from the audited specification.

**Activities:** Code generation (LLM-assisted, hand-coded, or hybrid), unit testing, integration testing, code review, iterative refinement.

**LLM hand-off:** LLM receives the complete, audited specification as context. Because the spec is 95%+ complete, the LLM can generate implementation-ready code without making assumptions about missing requirements.

**Continuous check:** BYDA-Code runs during this phase (no hard gate) to detect drift between spec and implementation.

**Exit criteria:** All implementation tasks complete; unit tests pass (≥80% coverage); integration tests pass; no P1 bugs; code reviewed.

**Forbidden:** Production deployment.

### Phase 5 — Validation & Testing
**Purpose:** Comprehensive testing and operational readiness verification.

**Activities:** End-to-end testing, performance testing, security testing, operational runbook validation, BYDA-Launch audit.

**Gate — BYDA-Launch (≥90% across Layers 1–3, 7–8, 11–13):** Must pass before deployment.

**Exit criteria:** BYDA-Launch gate passed; all tests pass; runbook validated; rollback procedure tested.

### Phase 6 — Deployment
**Purpose:** Ship the system to production safely.

**Activities:** Execute deployment procedure from runbook, verify health checks, enable monitoring, announce availability.

**Exit criteria:** System running in production, health checks passing, monitoring active.

### Phase 7 — Operations
**Purpose:** Operate the production system with ongoing quality maintenance.

**Activities:** Monitor, maintain, handle incidents, address bug reports, run monthly BYDA-Hygiene audits (≥85%).

### Phase 8 — Evolution
**Purpose:** Plan and execute major changes. Each significant change re-enters the lifecycle at Phase 0 or 1.

---

## 6. System Architecture

### High-Level Component Map

```
[Human / LLM]
     │
     ▼
[MCP Server — FastMCP 2.0]
     │
     ├─── [PostgreSQL 18 — Single Source of Truth]
     │         ├── Project & Task Tables
     │         ├── Research Documents & Chunks (FTS indexed)
     │         ├── Summaries & Citations
     │         ├── BYDA Audit Tables
     │         ├── Job Queue
     │         ├── GitHub Activity
     │         └── LLM Call Logs
     │
     ├─── [Markdown Ingestion Pipeline]
     │         └── Parses → Chunks → FTS index → DB
     │
     ├─── [Context Assembly Engine]
     │         └── Hybrid search → Rank → Token-budgeted window
     │
     ├─── [Job Processing Worker]
     │         └── Async queue: ingest, summarize, sync_github
     │
     └─── [GitHub Webhook Receiver]
               └── Events → DB → Task linkage
```

### Component Responsibilities

**PostgreSQL 18**
The single source of truth. All project state, research, tasks, audit records, and GitHub activity lives here. Nothing is stored outside the database except raw Markdown files (which are ingested into the DB).

**MCP Server (FastMCP 2.0)**
Exposes database operations as LLM-callable tools over HTTP. LLMs interact with the system exclusively through MCP tools — they do not have direct database access. Tools are verb-first, LLM-friendly (e.g., `create_project`, `query_research_docs`, `run_byda_audit`).

**Markdown Ingestion Pipeline**
Converts raw Markdown research documents into searchable, retrievable chunks:
1. Parse Markdown by header hierarchy
2. Create `doc_chunks` rows (one per logical section)
3. Trigger auto-populates `tsv` column for full-text search
4. Duplicate detection via content hash
5. Metadata extraction (tags, version)

**Context Assembly Engine**
Finds the most relevant document chunks for a given LLM prompt:
1. Receive query + constraints (project, phase, token budget)
2. Hybrid search: PostgreSQL FTS + metadata filtering
3. Rank by: relevance score, recency, quality rating, task association
4. Assemble deterministic context window within token budget
5. Return ranked chunks with explanations

Determinism is critical: the same query always produces the same context for reproducible LLM conversations.

**Job Processing Worker**
Asynchronous execution of long-running operations via a PostgreSQL-backed job queue:
- `ingest_markdown` — Convert document to chunks
- `summarize_doc` — Generate LLM summary
- `sync_github` — Fetch and link GitHub events
- (future) `generate_code` — Create implementation scaffolds

Uses `FOR UPDATE SKIP LOCKED` for concurrent-safe job polling.

**GitHub Integration**
Bidirectional sync between GitHub activity and project tasks:
- Webhooks push events (commits, PRs, issues) to `webhook_events` table
- Webhook handler links GitHub activity to tasks via commit message task IDs
- Task status auto-updates based on GitHub events (e.g., merged PR → task complete)

### Data Flow: Research → Task → Code

```
1. Human uploads research_v1.md
2. Ingestion pipeline: parse → chunk → FTS index → DB
3. LLM request: "Summarize this research"
4. Context assembly: FTS query → rank → top N chunks
5. LLM generates summary → stored in summaries table (with citations)
6. LLM generates tasks → stored in tasks table
7. task_evidence links each task to specific doc_chunks
8. Human approves tasks → marks research_phase complete
   ─────── [Phase 3→4 BYDA-Research Gate] ───────
9. LLM receives complete specification via context assembly
10. LLM generates code for each task
11. Human commits code to GitHub
12. Webhook fires → github_activity created → linked to task
13. Task status updated to "review" → eventually "completed"
```

---

## 7. Database Schema (PostgreSQL 18)

The schema consists of 13 core tables plus BYDA audit extension tables. All tables use SERIAL primary keys, timestamps, and CHECK constraints.

**Extension required:** `pg_trgm` (fuzzy + full-text search helpers)

### Core Tables

#### `projects`
Root container for all project data.
```
id, name, description, status (active|on-hold|completed|archived),
repository_url, created_at, updated_at
```

#### `research_phases`
Hierarchical organization of research activities. Supports nested phases via `parent_phase_id`. `depth_level` controls research depth (0=overview, 1=deep dive, 2=targeted, etc.).
```
id, project_id, phase_name, description, parent_phase_id,
depth_level, status (pending|in-progress|completed|blocked),
created_at, updated_at
```

#### `features`
High-level feature groupings within a project. Tasks belong to features.
```
id, project_id, name, description, priority, status, created_at, updated_at
```

#### `tasks`
Atomic units of work. The primary thing LLMs and humans track and complete.
```
id, project_id, feature_id, task_name, description, status
(pending|in-progress|review|completed|blocked|cancelled),
priority (1=highest), task_type, assigned_to,
estimated_hours, actual_hours, sprint_id,
created_at, updated_at
```

#### `research_docs`
Metadata for ingested Markdown documents.
```
id, project_id, phase_id, path, title, content_hash, version,
tags (TEXT[]), summary_hint, ingested_at, created_at, updated_at
```
Duplicate detection: if `content_hash` matches existing doc, ingestion is skipped.

#### `doc_chunks`
Chunked content from research documents. The actual text stored and searched.
```
id, doc_id, chunk_ix (ordering within doc), section_path (header path),
text, tokens (estimated), quality_rating (0.0–1.0),
tsv (tsvector, auto-populated by trigger), doc_version,
created_at, updated_at
```
Full-text search query: `WHERE tsv @@ to_tsquery('english', 'search terms')`

#### `summaries`
LLM-generated summaries of research documents, with source citations.
```
id, doc_id, type (brief|standard|deep), content,
citations (INT[] of chunk IDs), model, prompt_hash,
created_at, updated_at
```

#### `task_evidence`
**Critical bridge table.** Links tasks to the specific research chunks that justify them. This is how traceability is maintained from research → task → code.
```
task_id (FK→tasks), doc_id (FK→research_docs), chunk_id (FK→doc_chunks)
PRIMARY KEY (task_id, doc_id, chunk_id)
```

#### `jobs`
PostgreSQL-backed async job queue.
```
id, type (ingest_markdown|summarize_doc|sync_github|generate_code),
payload (JSONB), status (queued|running|succeeded|failed|cancelled),
priority, attempts, max_attempts, error_message,
started_at, completed_at, created_at, updated_at
```
Workers use `FOR UPDATE SKIP LOCKED` to safely claim jobs concurrently.

#### `api_keys`
API key storage for MCP server authentication.
```
id, key_hash, label, scopes (TEXT[]), last_used_at,
expires_at, created_at, updated_at
```

#### `webhook_events`
Raw GitHub webhook payloads before processing.
```
id, source (github), event_type, payload (JSONB),
signature, processed (BOOLEAN), processed_at,
error_message, received_at
```

#### `llm_calls`
Observability log for every LLM interaction.
```
id, project_id, task_id, model, prompt_hash, prompt_tokens,
completion_tokens, total_tokens, cost_usd, duration_ms,
tool_name, success, error_message, created_at
```

#### `project_technologies`
Declared technology stack for a project. Powers the Tech Stack Verification workflow and BYDA Layer 0.
```
project_id, technology_name, version_declared,
version_verified, status (declared|verified|stale|deprecated),
research_doc_id, verified_at, PRIMARY KEY (project_id, technology_name)
```

### BYDA Audit Tables (Extension)

#### `byda_audits`
Top-level audit record.
```
id, project_id, audit_type (research|launch|architecture|code|hygiene),
layers_applied (INT[]), readiness_score (0–100), gate_status (pass|fail|blocked),
blocking_gaps, high_gaps, medium_gaps, low_gaps,
started_at, completed_at, audited_by, notes
```

#### `byda_gaps`
Individual gap findings from an audit.
```
id, audit_id, layer (0–15), gap_code, severity (BLOCKING|HIGH|MEDIUM|LOW),
title, description, location, evidence, score_impact,
status (open|resolved|deferred|false_positive),
task_id (FK→tasks, nullable — when gap becomes a task),
created_at, resolved_at
```

#### `byda_layer_results`
Per-layer breakdown of audit results.
```
id, audit_id, layer, layer_name, passed (BOOLEAN),
gaps_found, score_contribution, notes, executed_at
```

### Key Views

**`v_project_tech_stack`** — Joined view of project technologies with verification status.

**`v_project_readiness`** — Aggregated readiness scores per project including latest audit results.

**`v_task_with_evidence`** — Tasks joined with their research evidence chains.

### Triggers

- `trg_chunks_tsv` — Auto-populates `tsv` column in `doc_chunks` on insert/update
- `trg_update_timestamps` — Auto-updates `updated_at` on all tables
- `trg_task_completion` — Auto-sets `completed_at` when task status → 'completed'

---

## 8. MCP Server & Tool Contracts

The MCP server is built with FastMCP 2.0 and exposes tools over HTTP. All tools follow these conventions:

### Naming Conventions
- All tool names are **verb-first**: `create_project`, `query_research_docs`, `run_byda_audit`
- Parameters use `snake_case`
- Required parameters first, optional parameters last
- All tools return structured JSON

### Tool Categories

#### Project Management Tools
- `create_project(name, description, repository_url?)` → project record
- `list_projects(status?)` → project list
- `get_project(project_id)` → full project with phase status
- `update_project_status(project_id, status)` → updated project

#### Research Tools
- `create_research_phase(project_id, phase_name, description, depth_level?)` → phase
- `ingest_markdown_doc(project_id, phase_id, path, content)` → doc + chunk job queued
- `query_research_docs(project_id, query, phase_id?, max_results?)` → ranked chunks
- `get_research_summaries(project_id, doc_id?)` → summaries with citations
- `create_summary(doc_id, type, content, citations)` → summary record

#### Task Tools
- `create_task(project_id, task_name, description, feature_id?, priority?)` → task
- `update_task_status(task_id, status, notes?)` → updated task
- `list_active_tasks(project_id, status?)` → task list
- `link_task_evidence(task_id, doc_id, chunk_id)` → evidence record
- `get_task_with_evidence(task_id)` → task + full evidence chain

#### BYDA Audit Tools
- `run_byda_audit(project_id, audit_type, layers?)` → audit record with gap findings
- `get_latest_audit(project_id, audit_type)` → latest audit + results
- `list_open_gaps(project_id, severity?)` → open gap list
- `resolve_gap(gap_id, resolution_notes)` → updated gap
- `check_codegen_readiness(project_id)` → boolean + detailed blockers list
- `evaluate_gate_decision(project_id, gate_type)` → pass/fail + threshold details
- `recalculate_audit_score(audit_id)` → recalculated score after gap changes

#### Technology Stack Tools
- `declare_technology(project_id, name, version)` → tech record
- `list_technologies(project_id, status?)` → tech stack
- `verify_technology(project_id, name, verified_version, research_doc_id)` → updated record
- `get_stale_technologies(project_id)` → technologies needing re-verification

#### Job Tools
- `queue_job(type, payload, priority?)` → job record
- `get_job_status(job_id)` → job with status and error if failed
- `list_recent_jobs(project_id?, status?, limit?)` → job list

#### Database Utility Tools
- `execute_query(sql, params?)` → query results (read-only; restricted from DDL)
- `get_project_stats(project_id)` → aggregate statistics

### MCP Server Endpoints
- `GET /health` — Health check
- `GET /metrics` — Prometheus-compatible metrics
- `GET /mcp/registry` — List all available tools
- `POST /mcp/{tool_name}` — Execute tool

### Authentication
API key passed in `Authorization: Bearer {key}` header. Keys stored hashed in `api_keys` table.

---

## 9. Core Workflows

### Workflow 1: Research Ingestion Pipeline

```
Input: Raw Markdown file (research document)

1. Parse frontmatter (title, tags, phase hints)
2. Validate: file size < 1MB, encoding UTF-8, required frontmatter fields present
3. Compute content_hash (SHA-256)
4. Check for duplicate: if hash exists in research_docs → skip (idempotent)
5. Insert research_docs row
6. Queue `ingest_markdown` job
7. Job worker executes:
   a. Split document by header hierarchy (## headings)
   b. Split oversized sections by paragraph (target: ~200 tokens/chunk)
   c. For each chunk: INSERT doc_chunks (doc_id, chunk_ix, section_path, text, tokens)
   d. Trigger auto-populates tsv for FTS
8. Mark job succeeded
9. Return doc_id

Error handling:
- Encoding error → job fails with error_message, doc_chunks.tsv remains NULL
- Oversized chunk (>2000 tokens) → split further at sentence boundary
- Duplicate chunk text within doc → skip (dedup within document)
```

### Workflow 2: Context Assembly

```
Input: query (string), project_id, max_tokens (default: 4000)

1. Parse query into FTS tokens (using plainto_tsquery)
2. Execute hybrid search:
   a. FTS search: SELECT from doc_chunks WHERE tsv @@ query
   b. Tag filter (if tags specified): AND doc metadata matches
   c. Phase filter (if phase_id specified): AND phase matches
3. Score each result:
   score = (0.4 × ts_rank) + (0.3 × recency_factor) + (0.2 × quality_rating) + (0.1 × task_association_bonus)
4. Sort by score DESC
5. Greedily select chunks until token budget exhausted
6. Return: [{chunk_id, doc_id, text, section_path, score, doc_title}]

Determinism guarantee: same query + same DB state = same output (no randomness)
```

### Workflow 3: BYDA-Research Audit (Phase 3→4 Gate)

```
Input: project_id

1. Create byda_audits row (status: running, audit_type: research)
2. For each layer in [0,1,2,3,4,5,6,7,9,10]:
   a. Execute layer checks (see Layer definitions in Section 4)
   b. Record findings as byda_gaps rows
   c. Record layer result in byda_layer_results
3. Calculate readiness_score:
   score = 100 - Σ(gap.score_impact for all open gaps)
   score = max(0, score)  # floor at 0
4. Determine gate_status:
   if blocking_gaps > 0: gate_status = 'blocked'
   elif score >= 95: gate_status = 'pass'
   else: gate_status = 'fail'
5. Update byda_audits (score, gate_status, completed_at)
6. Return full audit report

Gap auto-task creation:
- BLOCKING gaps → create P1 tasks automatically
- HIGH gaps → create P2 tasks automatically
- MEDIUM/LOW gaps → listed for human review, tasks created on request
```

### Workflow 4: GitHub Webhook Processing

```
Input: GitHub webhook HTTP request

1. Verify HMAC-SHA256 signature (X-Hub-Signature-256 header)
   → 401 if signature invalid
2. Store raw payload in webhook_events (processed=false)
3. Route by event type:
   push event:
     - For each commit: extract task_id from message (pattern: #123 or TASK-123)
     - Insert github_activity (project_id, task_id, type='commit', commit_sha, author)
     - If task linked: update task status to 'in-progress'
   pull_request event (merged=true):
     - Extract task_id from PR body/title
     - Update linked task to 'review'
   issues event (closed):
     - Find linked task, update to 'completed'
4. Mark webhook_events row as processed
5. Log llm_calls entry if any LLM was invoked
```

---

## 10. Technology Stack

This is the **authoritative** technology stack. All implementation MUST follow these versions.

| Component | Technology | Version | Notes |
|---|---|---|---|
| Language | Python | 3.11 | MUST; stable async support |
| MCP Framework | FastMCP | 2.0 | MUST; required for ChatGPT/Claude MCP integration |
| Database | PostgreSQL | 18 | MUST; async I/O, parallel GIN builds |
| DB Driver | psycopg | 3.x | MUST; async-capable |
| HTTP Framework | FastAPI | 0.11x | MUST; backs FastMCP |
| ASGI Server | uvicorn | 0.3x | MUST |
| Validation | Pydantic | 2.x | SHOULD |
| Logging | structlog | 23.x | SHOULD; structured JSON logs |
| Metrics | prometheus-client | 0.x | MUST; /metrics endpoint |
| Dev tooling | uv or venv | latest | MUST; no global installs |
| OS (reference) | Linux Ubuntu/Debian | — | SHOULD |

**PostgreSQL 18 was chosen specifically for:**
- Asynchronous I/O (improved concurrent performance)
- Parallel GIN index builds (faster FTS index creation)
- Skip scan optimization (efficient composite index queries)
- `FOR UPDATE SKIP LOCKED` (job queue implementation)

**FastMCP 2.0 was chosen over vanilla MCP SDK because:**
- Python-native (entire stack stays Python)
- No Node.js/Python bridge needed
- FastAPI integration (familiar patterns)
- Pydantic validation for tool parameters

---

## 11. Key Architectural Decisions

### Decision 001 — PostgreSQL 18 as Primary Database
**Status:** Accepted  
**Rationale:** Single technology for all persistence. ACID transactions, FTS, advanced indexing, `FOR UPDATE SKIP LOCKED`. Local deployment, no cloud dependency. Rejected: SQLite (too limited), MongoDB (no relational integrity), hybrid PG+Redis (unnecessary complexity for single-user tool).

### Decision 002 — FastMCP 2.0 Over Vanilla MCP SDK
**Status:** Accepted  
**Rationale:** Python-native stack. FastAPI integration. Type safety via Pydantic. No Node.js bridge.

### Decision 003 — Documentation-First, No Code Until 95% Spec Readiness
**Status:** Accepted (core methodology principle)  
**Rationale:** Prevents the primary failure mode of LLM-assisted development. LLMs with incomplete context make assumptions that become bugs. The cost of specification is lower than the cost of rewriting implementation.

### Decision 004 — Single-User, Local-First Scope
**Status:** Accepted  
**Rationale:** Multi-user adds auth, sync, conflict resolution — 3–5x development time with no benefit for the core use case (preventing bad LLM code). Single user can export/share JSON dumps.

### Decision 005 — Table-Backed Job Queue (No Redis/Celery)
**Status:** Accepted  
**Rationale:** PostgreSQL's `FOR UPDATE SKIP LOCKED` provides safe concurrent job processing. Avoids additional infrastructure (Redis) for a single-user tool. Sufficient for the expected job volume.

### Decision 006 — Numerical Readiness Scoring (Not Subjective)
**Status:** Accepted  
**Rationale:** Subjective "good enough" judgments are the enemy of quality gates. Numerical scores force objectivity and make gate pass/fail unambiguous to LLMs and humans alike.

---

## 12. What Project Planner Does NOT Do

These are explicit anti-features — deliberately out of scope to protect the core mission.

**No multi-user collaboration.** No user accounts, no shared workspaces, no real-time sync, no conflict resolution. Each developer runs their own instance.

**No calendar-based project management.** No Gantt charts, no milestone dates, no burndown charts, no sprint deadlines. Phases indicate readiness, not time. Dates create false precision and anxiety.

**No autonomous code execution.** The LLM suggests and generates; the human approves and commits. No automatic code deployment, no auto-merging PRs.

**No cloud storage or remote sync.** Everything runs locally. No SaaS, no cloud database, no remote API.

**No IDE integration (in MVP).** The system is accessed through MCP tools from a chat interface. VS Code extension was designed but is post-MVP.

**No built-in web UI (in MVP).** There is a "Command Center" UI design in the documentation, but it is post-MVP. The primary interface is the LLM chat + MCP tools.

**No AI-generated research.** Research documents are human-provided or human-triggered. The LLM never autonomously starts research. The user explicitly initiates every research session.

---

## 13. Codegen Rebuild Sequence

When rebuilding this project from scratch, follow this exact order. Each step depends on the previous being complete.

### Step 1 — Environment & Stack
1. Read this document in full
2. Confirm: Python 3.11, PostgreSQL 18, FastMCP 2.0, psycopg3, FastAPI
3. Set up Python virtual environment (uv or venv)
4. Install dependencies from requirements.txt

### Step 2 — Database Schema
1. Create database: `createdb mcp_project_planner`
2. Apply full schema migration: `psql -d mcp_project_planner -f complete_schema_migration.sql`
3. Verify 13 tables created, triggers installed, extensions active
4. Run verification queries (see Schema Quick Reference)

### Step 3 — Runtime Constants & Configuration
1. Define all timeouts, limits, and thresholds in `runtime_constants.py`
2. Define environment variable schema in `.env.example`
3. Implement configuration loader with validation

### Step 4 — Error Handling
1. Implement error code registry (all documented error codes)
2. Implement structured error response format
3. Implement retry logic with documented backoff rules

### Step 5 — Logging
1. Implement structlog JSON logging
2. Configure log levels per component
3. Implement field redaction (api_key, password, etc.)
4. Add request ID propagation

### Step 6 — MCP Server Layer
1. Implement FastMCP server scaffold
2. Implement `/health` and `/metrics` endpoints
3. Implement `/mcp/registry` endpoint
4. Implement API key authentication middleware
5. Implement each tool from Section 8 (MCP Tool Contracts)

### Step 7 — Job Processing Worker
1. Implement job polling loop using `FOR UPDATE SKIP LOCKED`
2. Implement each job type handler
3. Implement retry logic (max_attempts, exponential backoff)
4. Implement job timeout enforcement

### Step 8 — Ingestion Pipeline
1. Implement Markdown parser (frontmatter extraction, section splitting)
2. Implement chunk generation (target 200 tokens, split at sentence boundaries)
3. Implement duplicate detection (content hash)
4. Wire into job worker (`ingest_markdown` job type)

### Step 9 — Context Assembly
1. Implement FTS query builder
2. Implement hybrid scoring formula (relevance + recency + quality + task bonus)
3. Implement token-budget greedy selector
4. Verify determinism (same query → same results)

### Step 10 — GitHub Integration
1. Implement webhook signature verification
2. Implement event router (push, pull_request, issues)
3. Implement task-ID extractor from commit messages
4. Implement `sync_github` job type

### Step 11 — BYDA Audit Engine
1. Implement Layer 0–7 checks (see Section 4 for specifications)
2. Implement gap recording and score calculation
3. Implement gate pass/fail logic
4. Implement auto-task creation for BLOCKING/HIGH gaps
5. Wire into MCP tools: `run_byda_audit`, `check_codegen_readiness`

### Step 12 — Testing
1. Unit tests for each component (target ≥80% coverage)
2. Integration tests for end-to-end workflows
3. Test BYDA audit with known-pass and known-fail projects

---

## 14. Glossary

| Term | Definition |
|---|---|
| **Artifact** | A formal, versioned project component that defines system behavior (schema, API spec, config, docs). |
| **BYDA** | "Because You Definitely Forgot Something Obvious" — the 16-layer audit methodology. |
| **Context Assembly** | The process of finding the most relevant research chunks for a given LLM prompt. |
| **doc_chunks** | Individual searchable sections of ingested research documents. |
| **FTS** | Full-Text Search — PostgreSQL's `tsvector`/`tsquery` based search. |
| **Gap** | A deficiency identified by a BYDA audit layer. |
| **Gate** | A hard checkpoint that blocks phase progression until readiness thresholds are met. |
| **Layer** | One of 16 discrete audit inspection units (Layer 0–15) in the BYDA methodology. |
| **LLM-Friendly** | Describes rules that are deterministic and numerical — an LLM can evaluate them without subjective judgment. |
| **MCP** | Model Context Protocol — a standard for exposing server tools to LLMs via HTTP. |
| **Phase** | One of 9 stages in the project lifecycle (Discovery through Evolution). |
| **Readiness Score** | A 0–100% numerical score produced by a BYDA audit. |
| **Research Debt** | Unresolved research questions that could affect implementation correctness. |
| **Severity** | The impact classification of a BYDA gap: BLOCKING / HIGH / MEDIUM / LOW. |
| **task_evidence** | The bridge table linking tasks to specific research chunks that justify them. |
| **Traceability** | The complete chain from research document → chunk → summary → task → code → commit. |
| **tsv** | A `tsvector` column in `doc_chunks` used for full-text search. Auto-populated by trigger. |

---

*End of Project Planner Master Context Document*

*This document was reconstructed from the complete project knowledge base after repository loss.*  
*It represents the full specification state as of November 2025.*
