# VEDA + LLM Integration

## Purpose

This document explains how large language models (LLMs) interact with the VEDA SERP Observatory.

VEDA provides structured, deterministic signals about search engine result pages (SERPs).
LLMs act as reasoning engines that interpret those signals for operators.

The architecture follows a strict separation of concerns:

```text
VEDA = observation + computation
LLM  = interpretation + explanation
```

LLMs must never invent signals or mutate system state.
VEDA remains the source of truth.

---

## System Model

VEDA functions as a SERP observatory.

Pipeline:

```text
SERP Snapshots
→ Sensors
→ Volatility Modeling
→ Diagnostics
→ Alerts
→ Risk Attribution
→ Operator Reasoning
→ Change Classification
→ Event Timeline
→ Event Causality
```

Each stage adds interpretation while preserving the underlying observations.

The system is intentionally:

- deterministic
- compute-on-read
- isolation-safe
- operator controlled

---

## Role of the LLM

LLMs operate as analysis and explanation engines.

They can:

- query VEDA read surfaces
- synthesize multiple signals
- detect patterns
- generate operator explanations
- recommend strategic actions

They cannot:

- mutate SERP data
- fabricate sensor signals
- bypass deterministic system logic
- silently apply changes

The correct operating pattern is:

```text
Propose → Review → Apply
```

---

## Interaction Flow

Example operator question:

> Why did our ranking drop for this keyword?

Expected LLM workflow:

```text
1. Query event timeline
2. Query event causality
3. Query change classification
4. Query keyword volatility
5. Query feature volatility
6. Query intent drift
7. Query domain dominance
8. Query operator reasoning / briefing
```

The model then interprets those signals and produces a human explanation.

---

## Example Reasoning Output

Timeline:

```text
2026-03-01  feature_turbulence
2026-03-03  algorithm_shift
```

Causality:

```text
feature_turbulence_to_algorithm_shift
```

Signals:

```text
volatilityScore: 82
intentDriftEvents: 1
featureTransitions: 4
averageSimilarity: 0.18
```

Interpretation:

> The ranking drop is consistent with a SERP regime change. Feature turbulence emerged first, then transitioned into an algorithm-shift classification as volatility increased and cumulative similarity collapsed.

That is analysis grounded in observed system state, not speculative SEO folklore.

---

## Why VEDA Matters for LLMs

LLMs are poor raw sensors.
They are strong at:

- interpretation
- pattern detection
- hypothesis generation
- explanation
- operator decision support

VEDA supplies the structured sensory layer that LLMs lack.

This creates the stack:

```text
SERP reality
→ VEDA sensors + diagnostics
→ LLM reasoning layer
→ operator decisions
```

Without VEDA, an LLM can only speculate.
With VEDA, an LLM can reason over evidence.

---

## MCP Tooling (Planned)

Future MCP read-only tools should expose VEDA data directly to assistants.

Candidate tools:

```text
get_keyword_volatility
get_change_classification
get_event_timeline
get_event_causality
get_feature_volatility
get_intent_drift
get_domain_dominance
get_operator_reasoning
get_operator_briefing
```

These tools would let LLMs participate in operator workflows without mutating state.

---

## Architectural Analogy

```text
VEDA = telescope
LLM  = astronomer
```

VEDA observes the SERP universe.
The LLM interprets what those observations mean.

A telescope without an astronomer records light.
An astronomer without a telescope guesses.
The combination is where discovery happens.

---

## Current State

VEDA now supports:

- deterministic change classification (SIL-12)
- event timeline reconstruction (SIL-13)
- event causality detection (SIL-14)
- operator reasoning and briefing surfaces
- expanded SERP sensor suite (feature volatility, intent drift, domain dominance, SERP similarity)

This means the system can now answer:

- what happened
- when it changed
- what kind of SERP regime it became
- which adjacent transition pattern occurred

That is the beginning of a search intelligence engine, not just a rank tracker.

---

## Future Evolution

Upcoming SIL layers increase the reasoning power available to LLMs.

### SIL-15 — Regime Persistence

Measure how long keywords remain in specific change regimes.

Examples:

- days in unstable regime
- repeated oscillation between event classes
- persistence of competitor pressure

### SIL-16 — Cross-Keyword Correlation

Detect event classes appearing across multiple keywords at similar times.

Examples:

- algorithm-shift patterns across a topic cluster
- intent shifts across informational queries
- project-wide SERP turbulence

### SIL-17 — Project Event Topology

Aggregate event transitions at the project layer.

Examples:

- percentage of keywords entering `algorithm_shift`
- concentration of `competitor_surge` within one topic group
- project-level transition signatures

These layers move the system from descriptive analysis to pattern-aware explanation.

---

## Design Philosophy

The architecture follows three rules:

```text
1. Deterministic signals first
2. Interpretation second
3. Operator control always
```

This keeps the system:

- explainable
- auditable
- resistant to hallucinated analysis
- safe for human-gated workflows

---

## Non-Goals

This document does not propose:

- autonomous publishing
- silent content mutation
- non-deterministic decision making
- LLM-controlled write paths
- bypassing human review

VEDA is designed to strengthen operators, not replace them.
