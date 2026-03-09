# VEDA Roadmap (Binding)

This roadmap is the **single source of truth for scope**.

Rules:
- If it's not in the current active phase, it is out of scope.
- Any scope change requires an explicit roadmap edit.
- System invariants are non-negotiable: **project isolation**, **transactional mutations + event logging**, **determinism**, **API-only assistants**.

Related specs:
- `docs/BYDA-S-SPEC.md`
- `docs/VSCODE-EXTENSION-SPEC.md`
- `docs/04-LLM-OPERATING-RULES.md`
- `docs/07-RELATIONSHIP-AND-EVENT-VOCABULARY.md`
- `docs/specs/SIL-1-OBSERVATION-LEDGER.md`

---

## VEDA Observational Surfaces

VEDA is designed as a **multi-surface observatory for search ecosystems**. Rather than analyzing only rankings or only content, the system observes several complementary data surfaces that together describe how knowledge flows across the web.

Each surface represents a different perspective on the same search landscape.

### Search Graph — SERP Observatory

The Search Graph models the **external search ecosystem**.

Signals come from SERP snapshots and the SIL sensor stack.

Examples:

- ranking positions
- domain dominance
- feature presence
- intent drift
- SERP volatility
- AI overview behavior

This surface answers the question:

*What is happening in the search results?*

---

### Content Graph — Project Website

The Content Graph models the **internal structure of the project website**.

Unlike competitor systems, this graph is **explicitly stewarded** through VEDA workflows when pages are created, updated, or removed.

Examples:

- pages and page types
- internal linking relationships
- anchor text usage
- schema usage
- topic and entity coverage

This surface answers the question:

*What structure does our site expose to search engines?*

---

### Competitor Content Observatory

Competitor sites cannot be stewarded directly. Instead, VEDA observes the structure of competitor pages that appear in tracked SERPs.

SERP snapshots act as the **selection mechanism** for competitor page observation.

Examples of observed signals:

- page archetype patterns
- schema usage
- internal support structures
- citation and reference patterns

This surface answers the question:

*How are competing pages structured, and why might they be winning?*

---

### LLM Citation Observatory

This system monitors **AI assistant citation behavior** across models such as ChatGPT, Claude, Gemini, and Perplexity.

Signals include:

- domain citation frequency
- entity mention frequency
- citation volatility
- cross-model citation coverage

These signals represent a new form of visibility beyond traditional rankings.

This surface answers the question:

*Which domains are treated as authoritative sources by AI systems?*

---

### Multi-Surface Intelligence

By observing all surfaces simultaneously, VEDA can reason across relationships such as:

- strong SERP rankings but weak AI citations
- strong AI citations but weak search visibility
- competitor structural patterns correlated with ranking stability
- gaps between SERP expectations and site structure

This multi-surface model is the foundation for the **Strategy Synthesis Layer**, which compares demand signals (search ecosystem behavior) with supply signals (site and competitor structures).

---

## Architectural Layers

VEDA is organized as a strict stack of layers. Each layer depends only on the layers below it.

```
┌──────────────────────────────────────────────┐
│         Operator Interfaces                  │
│   VS Code Extension · MCP Bridge · (UI TBD)  │
├──────────────────────────────────────────────┤
│         SEO Lab / Experiments Layer          │
│   (Post-MVP — ranking hypothesis testing)    │
├──────────────────────────────────────────────┤
│         Tactics Layer  ("Checkers SEO")       │
│   Mechanical ranking signal execution        │
│   Keywords · Links · Schema · Entity · YT    │
├──────────────────────────────────────────────┤
│         Execution Planning Layer             │
│   Page-level plans · Playbooks · Defense     │
├──────────────────────────────────────────────┤
│         Strategy Synthesis Layer             │
│   Synthesis · Territory Intelligence         │
├──────────────────────────────────────────────┤
│         Operator Reasoning Layer             │
│   Operator Reasoning · Briefing · Insights   │
├──────────────────────────────────────────────┤
│         Diagnostics Layer                    │
│   Project Diagnostic · Keyword Diagnostic    │
│   Spike Delta · Risk Attribution             │
├──────────────────────────────────────────────┤
│         SIL Sensor Layer  ("Chess SEO")       │
│   SIL-1 → SIL-20: Volatility · Class.        │
│   Causality · Intent · Features · Radar      │
├──────────────────────────────────────────────┤
│         Observation Ledger                   │
│   SERPSnapshot · KeywordTarget · MetricSnap  │
│   EventLog · QuotableBlock · SearchPerf      │
├──────────────────────────────────────────────┤
│         Data Ingestion Layer                 │
│   DataForSEO Live SERP Ingest (W5)           │
│   Search Console Ingest · Manual Capture     │
└──────────────────────────────────────────────┘
```

Each layer is append-only and compute-on-read. No materialized volatility state.
All mutations are transactional and emit event log entries.

---

(remaining roadmap content unchanged)
