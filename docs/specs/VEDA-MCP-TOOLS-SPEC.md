# VEDA MCP Tools Specification

## Purpose

This document defines the Model Context Protocol (MCP) tools implemented for LLM assistants to interact with VEDA.

MCP tools provide a controlled interface between LLM systems and the VEDA HTTP API.

LLMs may read system state and propose actions through these tools. They may not mutate system state without explicit operator confirmation.

All mutation follows the rule:

Propose → Review → Apply

---

## Design Principles

MCP tools follow these rules:

- API-only interaction
- deterministic outputs
- project-scoped operations
- no silent mutation

All project-scoped tools resolve project scope using:

resolveProjectId()

Related documents:
- `docs/ROADMAP.md`
- `docs/specs/VEDA-OPERATOR-SURFACES.md`
- `docs/specs/VEDA-REPO-NATIVE-WORKFLOW.md`

---

## Role Of MCP In Operator Workflows

MCP is the safe bridge between LLM assistants and VEDA system state.

It exists to support operator-facing workflows in surfaces such as:

- web UX
- VS Code
- future operator clients

MCP does **not** make the LLM the source of truth.

Responsibility split:

- **VEDA** owns deterministic structural truth and project-scoped state.
- **MCP** exposes that truth through controlled API access.
- **LLMs** interpret, narrate, draft, and propose.
- **Workspace / repo tools** support local file execution workflows outside VEDA state mutation.
- **Humans** review and apply both VEDA changes and repo changes.

Repo edits and VEDA state changes are related but distinct flows. MCP does not justify silent repository mutation, silent VEDA mutation, or bypassing review discipline.

---

## Implemented MCP Tool Groups

### Project Management

Tools for project creation and retrieval.

Implemented tools:

```
create_project
get_project
list_projects
```

`create_project` — Creates a new VEDA project container. Project starts in `created` lifecycle state. Slug is auto-derived from name if not provided. Returns the created project record.

`get_project` — Retrieves a single project by ID with full details including `lifecycleState`.

`list_projects` — Lists all projects accessible to the current user, ordered alphabetically by slug. Supports pagination.

---

### Entity Tools

Tools for reading entities within a project.

Implemented tools:

```
search_entities
get_entity
get_entity_graph
```

`search_entities` — Searches and filters entities within a project. Supports filtering by entityType, status, conceptKind, and text search. Returns results in reverse chronological order.

`get_entity` — Retrieves a single entity by UUID with full details.

`get_entity_graph` — Retrieves an entity with its relationship graph up to depth 2. Supports filtering by relationship type.

---

### Content Intelligence Tools

Read-only tools for content signal data.

Implemented tools:

```
list_search_performance
list_quotable_blocks
```

`list_search_performance` — Lists Google Search Console performance records for the project. Supports filtering by query, pageUrl, entityId, and date range.

`list_quotable_blocks` — Lists quotable citation blocks for GEO optimization within the project. Supports filtering by entityId, claimType, and topicTag.

---

### SERP Observation Tools

Tools that expose computed SERP observatory surfaces for individual keyword targets.

Implemented tools:

```
get_keyword_overview
get_keyword_volatility
get_change_classification
get_event_timeline
get_event_causality
get_intent_drift
get_feature_volatility
get_domain_dominance
get_serp_similarity
get_serp_delta
get_volatility_breakdown
get_volatility_spikes
```

All tools in this group require a `keywordTargetId` UUID.

`get_keyword_overview` — Composite SIL-15 overview: volatility, classification, timeline, causality, intent drift, feature volatility, domain dominance, and SERP similarity in one payload.

`get_keyword_volatility` — Volatility profile: score (0–100), regime, maturity, and SIL-7 attribution components.

`get_change_classification` — SIL-12 change classification label, confidence score, and contributing signals.

`get_event_timeline` — SIL-13 ordered stream of SERP classification transitions (emits only on classification changes).

`get_event_causality` — SIL-14 event causality patterns: recognized adjacent transition pairs.

`get_intent_drift` — Per-snapshot intent distributions and transitions between dominant intent buckets.

`get_feature_volatility` — Transitions in SERP feature family presence and a ranked summary of the most volatile features.

`get_domain_dominance` — Domain dominance for the latest SERP snapshot: top domains by result count and dominance index.

`get_serp_similarity` — Consecutive-pair Jaccard similarity scores on domain sets and feature family sets.

`get_serp_delta` — Rank delta between the two most recent SERP snapshots: URL moves, entries, exits, and AI Overview state change.

`get_volatility_breakdown` — URLs driving rank volatility for a keyword target, scored by total absolute rank shift. Sorted by totalAbsShift descending.

`get_volatility_spikes` — Top-N highest-volatility consecutive snapshot pairs with spike metadata (pairVolatilityScore, rank shift, feature change count, AI Overview flip).

---

### Composite Diagnostic Tools

Tools that fan out to multiple SERP surfaces and return a merged result in a single call.

Implemented tools:

```
get_keyword_diagnostic
get_spike_delta
get_operator_insight
```

`get_keyword_diagnostic` — Compact operator diagnostic for a single keyword target. Fans out to overview, event timeline, and event causality in parallel. Use instead of calling those three tools individually.

`get_spike_delta` — Finds the single worst volatility spike for a keyword target, then fetches the full SERP rank delta for that snapshot pair in one call.

`get_operator_insight` — Synthesized operator insight for a single keyword target: volatility regime, maturity, dominant risk driver, spike evidence, feature transition count, and a structured recommendation.

---

### Project-Level Observatory Tools

Tools that compute project-wide intelligence across all monitored keywords.

Implemented tools:

```
get_project_diagnostic
get_top_volatile_keywords
get_operator_reasoning
get_operator_briefing
get_risk_attribution_summary
run_project_investigation
```

`get_project_diagnostic` — Compact project-level diagnostic. Fans out to volatility-summary, volatility-alerts, and risk-attribution-summary in parallel. Returns overall volatility score, stability distribution, top alert keywords, and risk attribution percentages. Use as the first tool when diagnosing project health.

`get_top_volatile_keywords` — Ranked list of the most volatile keywords in the project. Returns keywordTargetId, query, volatility score, severity, and attribution components. Supports a `limit` parameter (default 10, max 50).

`get_operator_reasoning` — Operator reasoning output for the project: synthesized SEO intelligence derived from SERP signals, volatility, and classification data.

`get_operator_briefing` — Operator briefing for the project: structured summary of current SEO state, top risks, and recommended focus areas.

`get_risk_attribution_summary` — Risk attribution summary: ranked breakdown of volatility contributors and risk signals across all monitored keywords.

`run_project_investigation` — Full VEDA project investigation. Orchestrates project diagnostic, volatility alerts, per-keyword overview and causality, and operator reasoning into a single compact packet. `alertsSource` field indicates whether alert data came from the volatility-alerts endpoint (`"alerts"`) or from a preliminary fallback (`"fallback"`).

---

### Proposal Surface Tools

Read-only tools for SERP-to-Content-Graph proposals.

Implemented tools:

```
get_proposals
```

`get_proposals` — Returns Phase C1 SERP-to-Content-Graph proposals for the active project: archetype alignment proposals (`archetypeProposals`) and schema gap proposals (`schemaProposals`). Proposals are evidence-backed and deterministic. Returns proposals and summary counts.

---

## Relationship To System Layers

MCP tools act as a gateway to the VEDA architecture stack.

```
LLM Assistant
      ↓
MCP Tools
      ↓
HTTP API
      ↓
VEDA System Layers
```

This separation ensures assistants remain outside the core system.

When used alongside VS Code or other repo-aware operator surfaces, MCP should be understood as the VEDA-state side of the workflow. Repository reads, diffs, edits, commits, and deployment remain separate concerns and must not be conflated with VEDA API mutation.

---

## Future MCP Tool Groups

Future expansions may include tools for:

- social surface observatories
- keyword target management
- blueprint proposal and application
- content graph management
- execution planning
- SEO lab experimentation

These tools will follow the same deterministic and proposal-driven interaction model.

---

## Non Goals

MCP tools must not:

- access the database directly
- bypass API validation
- perform hidden mutations
- bypass project isolation

The MCP layer is an interface, not a control plane.
