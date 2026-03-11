# Project Blueprint Specification

## Purpose

The Project Blueprint defines the intended **brand ecosystem structure** for a project before keyword targeting begins.

It acts as the architectural contract that guides research, targeting, observation, and execution planning.

The blueprint is created during the `draft` lifecycle stage and must be reviewed and approved before the project proceeds to keyword targeting.

Blueprints do not mutate system state automatically. All changes follow the rule:

Propose → Review → Apply

Related documents:
- `docs/ROADMAP.md`
- `docs/specs/VEDA-CREATE-PROJECT-WORKFLOW.md`
- `docs/specs/VEDA-BRAND-SURFACE-REGISTRY.md`

---

## Role In VEDA Architecture

VEDA manages projects as **brand ecosystem containers**.

A project blueprint defines:

- the strategic niche
- the operational surfaces
- the website architecture model
- the content and entity structure
- the authority model
- the initial keyword territory

This blueprint becomes the structural reference used by the research, targeting, and strategy layers.

---

## Blueprint Components

### Brand Identity

Defines the conceptual identity of the project.

Fields may include:

- projectName
- strategicNiche
- audience
- authorityPosture

---

### Surface Registry

Defines which brand surfaces the project will operate.

Possible surfaces include:

- website
- wiki
- blog
- X
- YouTube
- future surfaces

Surfaces declared here determine which observatories and signal collectors are active.

A project may declare multiple accounts or channels on the same platform when needed. The blueprint should preserve intended surface identity clearly enough that later implementation does not collapse a platform into a single ambiguous slot.

---

### Website Architecture Model

Defines the structural pattern of the website if a website surface is declared.

Examples of elements:

- page archetypes
- content clusters
- navigation model
- entity coverage

The website implementation itself may be built in frameworks such as Next.js.

The blueprint only describes structure.

---

### Content Archetypes

Defines the expected page types within the project.

Examples:

- guide
- comparison
- tutorial
- reference
- review

These archetypes influence content graph modeling and future execution planning.

---

### Entity Clusters

Defines the conceptual territory the project intends to cover.

Entities may include:

- topics
- products
- concepts
- ingredients
- technologies

This becomes the foundation for the project's **Content Graph coverage model**.

---

### Initial Keyword Territory

Defines the conceptual territory for keyword research.

The blueprint does not create `KeywordTarget` records.

Instead it provides the strategic boundary for the research stage.

---

### Authority Model

Defines how the project intends to accumulate authority across surfaces.

Examples may include:

- informational authority
- instructional authority
- media authority

This model influences surface planning and future content strategy.

---

## Blueprint Lifecycle

Blueprint creation occurs during the `draft` lifecycle stage.

Typical workflow:

1. Operator creates project container
2. LLM proposes project blueprint
3. Operator reviews blueprint
4. Operator applies blueprint
5. Project proceeds to research phase

LLM systems may assist in drafting blueprint proposals but cannot apply them.

---

## Relationship To Other Layers

The blueprint informs several VEDA layers.

Research Layer
- Defines the keyword discovery territory.

Content Graph Layer
- Defines structural expectations for pages and entities.

Execution Planning Layer
- Guides page and content creation strategy.

Observational Surfaces
- Determines which surfaces are active for the project.

Operator Surfaces
- Provides project structure that may later be surfaced in web UX, VS Code, and MCP-assisted workflows.

---

## Non Goals

The blueprint does not:

- automatically generate content
- mutate system state without operator approval
- publish pages
- create keyword targets

It is a planning artifact used to guide the system.

---

## Future Extensions

Future iterations may include:

- blueprint templates
- blueprint diffing
- blueprint evolution tracking

These capabilities will allow VEDA to manage long-term evolution of brand ecosystems.
