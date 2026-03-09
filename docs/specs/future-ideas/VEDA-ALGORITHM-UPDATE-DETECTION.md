# VEDA Algorithm Update Detection Engine (Future Idea)

Status: Concept — isolated from active system development.

This document describes a potential future capability for detecting large-scale search engine algorithm updates using aggregated SERP telemetry collected by VEDA.

This concept MUST NOT influence current SIL implementations.

---

## Motivation

SEO practitioners typically identify algorithm updates after widespread ranking disruption. VEDA already collects deterministic signals capable of revealing these disruptions in real time.

Existing signals include:

- volatilityScore
- volatility spikes
- AI overview churn
- feature transitions
- domain dominance shifts
- SERP similarity collapse

If aggregated across many keywords, these signals could reveal patterns consistent with algorithm updates.

---

## Concept

Introduce a diagnostic layer that analyzes **cross-keyword telemetry patterns**.

Example indicators:

- sudden increase in volatility spikes across many keywords
- synchronized domain dominance changes
- SERP similarity collapse waves
- feature turbulence clusters

These signals could be combined into a potential "update likelihood" indicator.

This would remain **observational only**.

No system mutations.

---

## Example Detection Pattern

Possible signal combination:

- project volatility distribution shifts sharply
- volatility spikes detected across >X% of keywords
- domain dominance changes cluster in same time window

Result:

"Possible search algorithm update detected."

This would not claim certainty.

It simply alerts the operator to investigate.

---

## Architectural Constraints

1. Must remain **read-only analytics**.
2. Must not alter SIL calculations.
3. Must not introduce background automation initially.
4. Must not affect operator reasoning outputs unless explicitly approved.

---

## Possible Future Implementation

Potential endpoint:

GET /api/seo/update-detection

Possible output:

- updateLikelihood
- volatilityClusterCount
- featureTurbulenceClusters
- dominanceShiftClusters

---

## Key Principle

VEDA should remain an **observatory**, not a speculation engine.

Algorithm detection would provide **signals**, not conclusions.
