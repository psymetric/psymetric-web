# VEDA Tactics Layer and SEO Lab

## Purpose

VEDA currently functions as a **Search Observatory Engine**. Its purpose is to observe and analyze search ecosystems through deterministic sensors and temporal reasoning.

Future development will expand VEDA beyond observation into **tactics generation and controlled experimentation**.

The goal is to transform VEDA from:

Search Observatory

into:

Search Research Laboratory

This document outlines two future architectural layers:

1. Tactics Layer
2. SEO Lab Layer

These layers are intentionally separated from the current SIL architecture and will not be implemented until the observatory foundation is fully stable.

---

# Current VEDA Architecture

The system currently operates as a deterministic compute-on-read observatory.

SERP Snapshots
        ↓
Sensors
        ↓
Change Classification
        ↓
Event Timeline
        ↓
Event Causality
        ↓
Operator Reasoning
        ↓
Operator Briefing

This architecture answers:

What happened?
Why did it happen?

Future layers will answer:

What should we try?
Did it work?

---

# The Tactics Layer

## Purpose

The tactics layer converts **observatory signals** into **candidate SEO actions**. It acts as a structured hypothesis generator.

Example flow:

Observatory Signals
        ↓
Diagnosis
        ↓
Tactic Generation

Example signals:

{
  "classification": "feature_turbulence",
  "volatilityScore": 42,
  "aiOverviewChurn": 3,
  "featureTransitionCount": 4
}

Example tactic output:

{
  "tacticType": "SERP_FEATURE_CAPTURE",
  "priority": "high",
  "triggerSignals": [
    "feature_turbulence",
    "high_feature_transition_count"
  ],
  "recommendedActions": [
    "add FAQ schema",
    "add table formatting",
    "expand definition paragraph",
    "target featured snippet structure"
  ],
  "expectedImpact": "improve SERP feature capture probability",
  "confidence": 0.62
}

---

## Possible Tactic Types

SERP_FEATURE_CAPTURE
AI_OVERVIEW_DEFENSE
COMPETITOR_COUNTER
ENTITY_EXPANSION
INTENT_REALIGNMENT
AUTHORITY_SIGNAL_STRENGTHENING

These should remain structured and deterministic. LLMs may assist with explanation but tactics should originate from defined signal patterns.

---

# The SEO Lab Layer

## Purpose

The SEO Lab layer enables controlled experimentation and introduces the scientific method into search optimization.

Experiment cycle:

Hypothesis
    ↓
Tactic applied
    ↓
SERP observation
    ↓
Outcome analysis

---

## Core Lab Entities (Future)

Experiment
Hypothesis
TacticApplied
ExperimentWindow
ObservedImpact
ConfidenceScore

Example experiment record:

{
  "experimentId": "...",
  "keywordTargetId": "...",
  "hypothesis": "FAQ schema increases PAA appearance probability",
  "tacticApplied": "Add FAQ structured data",
  "startSnapshotId": "...",
  "endSnapshotId": "...",
  "observedImpact": {
    "featurePresenceChange": "+1",
    "volatilityImpact": "low"
  },
  "confidenceScore": 0.58
}

Over time, the lab layer can produce evidence-backed SEO playbooks.

---

# SERP Experiments Without Touching Rankings Directly

A key design principle for the SEO Lab is:

Observe SERP behavior rather than manipulating rankings directly.

Experiments should focus on:

SERP feature dynamics
AI overview behavior
domain dominance shifts
intent drift patterns

Example experiments:

Feature Appearance Sensitivity
AI Overview Expansion
Domain Dominance Decay

These experiments observe the ecosystem rather than attempting to force ranking changes.

---

# Role of LLMs

LLMs act as research assistants that help generate hypotheses, explain patterns, and synthesize strategies. VEDA remains the deterministic signal engine.

---

# Long-Term Vision

VEDA

SERP Observatory
LLM Citation Observatory
Research Signal Observatory

        ↓

Analysis Layer
        ↓

Tactics Layer
        ↓

SEO Lab

Each layer answers progressively deeper questions:

What happened?
Why did it happen?
What does it mean?
What should we try?
Did it work?

---

# Implementation Timing

These layers should only be implemented after the observatory foundation is stable.

Immediate priorities remain:

SERP ingest stability
sensor correctness
timeline determinism
causality reliability
MCP tooling

---

# Summary

VEDA is evolving toward a search research platform.

Observatory → Strategy Engine → SEO Research Lab

The observatory measures the ecosystem. The tactics layer proposes actions. The lab determines which actions actually work.
