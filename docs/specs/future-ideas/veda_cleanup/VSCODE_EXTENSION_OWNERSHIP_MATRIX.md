# VS Code Extension Ownership Matrix
## Current Extension Surface Classification Across Project V, VEDA, and V Forge

**Document Status:** Architecture Alignment Working Doc  
**Applies To:** The current VS Code extension surface  
**Purpose:** Classify extension features by true system owner so the extension can evolve cleanly with the V Ecosystem split.

---

# 1. Why This Document Exists

The VS Code extension was built during a period when VEDA was carrying too many conceptual responsibilities.

As the architecture has clarified, the ecosystem now has three primary bounded systems:

- **Project V** — planning and orchestration
- **VEDA** — observability and intelligence
- **V Forge** — execution and production

That means extension surfaces created earlier may no longer belong where they first appeared.

This document classifies each major surface into one of four buckets:

- **VEDA**
- **Project V**
- **V Forge**
- **Shared / Transitional**

The goal is not to move everything immediately.
The goal is to make ownership clear before more work is added.

---

# 2. Classification Rules

## VEDA
A feature belongs to VEDA if it is primarily about:

- observability
- diagnostics
- graph intelligence
- search / YouTube / LLM surface analysis
- proposals derived from observed signals
- command-center style observatory analysis

## Project V
A feature belongs to Project V if it is primarily about:

- project setup
- project selection as orchestration state
- project lifecycle
- roadmap / blueprint coordination
- planning and sequencing
- deciding what should happen next

## V Forge
A feature belongs to V Forge if it is primarily about:

- content production
- editorial workflow
- publishing
- execution of work products
- draft or asset handling

## Shared / Transitional
A feature is Shared / Transitional if:

- it currently bridges domains
- it was created before the split hardened
- it may need to be split into separate surfaces later

---

# 3. Ownership Matrix

| Extension Surface / Feature | Current Purpose | Recommended Owner | Confidence | Notes |
|---|---|---:|---:|---|
| **Brain panel** | Main intelligence / proposal viewing surface | **VEDA** | High | This is fundamentally an observatory/intelligence surface. It should remain VEDA-aligned. |
| **Proposals view / proposals section** | Surface for proposal inspection derived from diagnostics | **VEDA** | High | Proposal generation is downstream of observatory analysis. Project V may consume proposals, but generation/primary visibility belongs to VEDA. |
| **Project diagnostics panel / command surface** | Shows observatory-derived project analysis | **VEDA** | High | Diagnostics are observatory truth, not planning state. |
| **Page Command Center** | Page-relevant observatory packet and search intelligence | **VEDA** | High | This is a classic VEDA surface: entity / search / observability synthesis. |
| **SERP / search intelligence views** | Search ecosystem monitoring | **VEDA** | High | Belongs fully inside the observatory/intelligence layer. |
| **YouTube lens views (future)** | Video surface observability | **VEDA** | High | New lens surface, clearly VEDA-owned. |
| **LLM citation observatory views (future)** | Citation monitoring and source analysis | **VEDA** | High | Another observatory-native surface. |
| **Content graph diagnostics / graph health views** | Graph analysis, coverage, gap detection | **VEDA** | High | Content graph is used here as observatory truth, not as editorial execution. |
| **View Proposals command** | Command that opens proposal-oriented insight surface | **VEDA** | High | Command can remain extension-level, but it should route to a VEDA-owned panel. |
| **Blueprint workflow command** | Workflow for project bootstrap / blueprint orchestration | **Project V** | Medium-High | Blueprints now read more like project planning/orchestration than observatory truth. VEDA may inform them, but Project V should own the flow. |
| **Setup workflow command** | Project setup and first-run structure guidance | **Project V** | High | Setup is orchestration and lifecycle initiation, not observatory logic. |
| **Project selection UI / current project selector** | Selects active project context for extension work | **Shared / Transitional** | Medium | Conceptually orchestration-like, so long-term it leans Project V, but VEDA also needs scoped project context. Keep shared for now, define as ecosystem-level context service. |
| **First-run continuity / setup affordances** | Helping operator orient and initialize work | **Project V** | Medium-High | This is fundamentally project orchestration and onboarding. |
| **Cross-panel linking: Brain → Page Command Center** | Navigation between intelligence surfaces | **VEDA** | High | This is navigation within the observatory family of surfaces. |
| **Project bootstrap visibility in extension** | Support for creating / setting up project state | **Project V** | Medium-High | The extension may currently host it under VEDA-heavy assumptions, but ownership belongs with planner/orchestration. |
| **Create project flow (future / missing)** | Create new project from extension | **Project V** | High | This should not be a VEDA concern. |
| **Environment reachability / context diagnostics** | Tell operator if backend/system/project context is valid | **Shared / Transitional** | Medium | This is infrastructure-adjacent and useful across all systems. It may ultimately become a shared extension utility layer rather than belonging to a single domain. |
| **Operator briefing surfaces** | Structured summaries of what matters now | **Shared / Transitional** | Medium | If the briefing is purely observatory-derived, it is VEDA. If it becomes “what should the project do next,” it leans Project V. Needs sharper splitting later. |
| **Task / roadmap / planning surfaces (future)** | Project sequencing and decision management | **Project V** | High | These should live with the planner, not with observability. |
| **Draft creation / editing surfaces (future)** | Content production workflows | **V Forge** | High | This is exactly the kind of thing that should not live in VEDA long-term. |
| **Publishing / review / asset surfaces (future)** | Execution and editorial workflow | **V Forge** | High | Clearly production-side. |
| **Distribution tooling surfaces (future, Link Synapse Lite support)** | Tracked link operations and distribution utility support | **Shared / Transitional** | Medium | Core runtime likely remains adjacent, but extension support may be shared depending on whether the surface is operational, planning, or observability-focused. |

---

# 4. Key Conclusions

## 1. Most current high-value extension work is VEDA-owned

This is not a problem.
It reflects the fact that VEDA matured first and already has strong observatory surfaces.

The Brain panel, proposals, diagnostics, page command center, and lens-oriented work all remain strongly aligned with VEDA.

## 2. Bootstrap / setup workflows are better owned by Project V

Anything involving:

- setup
- project initialization
- blueprint orchestration
- lifecycle framing

leans toward Project V, even if it was originally implemented under a VEDA-heavy mental model.

## 3. V Forge is mostly future-facing in the extension right now

This is expected.

The extension has more observatory maturity than execution maturity at this stage.
That means many current extension surfaces can remain VEDA-oriented while V Forge surfaces are designed later with cleaner boundaries.

## 4. A small shared utility layer will still exist

Some extension behavior does not belong entirely to one domain.
Examples include:

- active project context
- environment reachability
- navigation plumbing
- top-level operator context

These should be treated as **extension infrastructure**, not as proof that the domain boundaries are wrong.

---

# 5. Recommended Near-Term Actions

## Keep in VEDA

Keep these clearly aligned with VEDA:

- Brain panel
n- proposals view
- project diagnostics
- page command center
- current and future observatory surfaces

## Reframe toward Project V
n
Move or reclassify these conceptually toward Project V:

- setup workflow command
- blueprint workflow command
- project bootstrap flows
- future create-project and planning views

## Defer to V Forge

Do not force execution/CMS concepts into the extension under VEDA labels.
When V Forge surfaces arrive, they should be clearly named and clearly separated.

## Preserve shared utility intentionally

Treat active project selection and environment/reachability utilities as extension-level infrastructure unless and until a better system-specific home is defined.

---

# 6. Recommended Practical Rule

When evaluating any extension feature, ask:

## Is this showing reality?
Then it likely belongs to **VEDA**.

## Is this deciding what the project should do next?
Then it likely belongs to **Project V**.

## Is this making or publishing something?
Then it likely belongs to **V Forge**.

If the answer is mixed, the feature is likely **Shared / Transitional** and should be split later rather than forced into the wrong domain.

---

# 7. Summary

The extension is not “wrong.”
It reflects the order in which the ecosystem matured.

Right now:

- the strongest extension surfaces belong to **VEDA**
- setup and orchestration surfaces increasingly belong to **Project V**
- execution and CMS surfaces should be reserved for **V Forge**
- a small shared extension infrastructure layer is acceptable

This matrix should be used as the basis for future cleanup, naming alignment, and UI surface ownership decisions.

---

# End of Document
