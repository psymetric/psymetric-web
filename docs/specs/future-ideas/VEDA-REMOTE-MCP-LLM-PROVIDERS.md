# VEDA Remote MCP + LLM Providers (Future Idea)

## Purpose

This document preserves the idea that VEDA may later support a **remote/API-accessible MCP layer** for use with external LLM providers.

This is separate from the current local/desktop MCP workflow.

The goal is to ensure VEDA can later expose its MCP tool surface to multiple model providers without coupling the VEDA core architecture to any single provider.

This idea is explicitly **future-facing**.
It is not part of the current active implementation scope.

---

## Core Position

VEDA should remain:

- API-first
- provider-agnostic
- project-scoped
- deterministic where deterministic outputs are expected
- proposal-driven for any mutation-capable workflow

Any future remote MCP integration should treat model providers as **transport/execution options**, not as architectural dependencies.

In other words:

```text
VEDA API
→ VEDA MCP server
→ provider adapter / remote client layer
→ model provider
```

not:

```text
VEDA core
→ hard-coupled to one model vendor
```

---

## Candidate Initial Provider

A likely first candidate provider is:

- OpenRouter

Reason:

- unified access to multiple model APIs
- useful for comparative testing across major LLMs
- convenient for experimentation without hard-binding VEDA to one vendor-specific SDK path

This should be treated as a **candidate first provider**, not a permanent architectural center.

---

## Why This Matters

A remote/API-accessible MCP path may later enable:

- testing VEDA MCP tools against multiple major LLMs
- comparing model behavior on the same canonical tool surface
- supporting operator workflows outside a desktop-local MCP client
- future tactics-layer experimentation without changing VEDA core internals

This is especially relevant if VEDA later evaluates:

- groundedness across models
- comparative reasoning quality
- overreach vs usefulness
- multi-model tactical review patterns

---

## Architectural Boundary

The remote/provider layer must remain **outside** the core VEDA system.

VEDA core should not:

- depend on OpenRouter-specific semantics
- depend on a single model provider’s auth model
- mix provider concerns into deterministic diagnostics
- allow provider transport choices to reshape API invariants

The remote layer should adapt to VEDA, not the other way around.

---

## Initial Future Scope

A future first implementation could include:

- a remote-accessible MCP wrapper for VEDA MCP tools
- provider configuration abstraction
- OpenRouter as an initial provider option
- model selection via configuration
- explicit API key handling outside VEDA core
- read-only workflow testing first

The first realistic read-only remote MCP test target would likely be:

- get_project
- create_project (only with explicit operator intent)
- get_proposals
- existing read-only observatory/diagnostic tools

---

## Recommended Design Principles

### 1. Provider-agnostic model adapter

Any remote model integration should be expressed as a provider abstraction, for example conceptually:

- provider
- model
- base URL
- auth mechanism
- provider-specific optional headers

### 2. MCP stays canonical

The MCP tool contracts should remain canonical.

The provider layer should not rewrite VEDA semantics.

### 3. Read-only first

Future remote MCP experimentation should begin with read-only tools before any mutation-capable workflows are exposed.

### 4. Mutation remains proposal-driven

If mutation-capable tools are later exposed through a remote provider path, they must preserve:

- Propose → Review → Apply
- EventLog discipline
- transaction discipline
- project isolation

### 5. No provider lock-in

The architecture should make it cheap to test:

- OpenRouter
- future direct provider adapters
- future multi-provider comparison flows

without rewriting VEDA core.

---

## Likely Future Questions

Before implementation, the following questions will need answers:

- What exact remote MCP shape should be exposed?
- Should remote access be internal-only, operator-only, or broader?
- How should auth and project scoping be enforced safely?
- Should provider config live in the MCP layer, a separate adapter, or a thin gateway?
- Which tools are safe for initial exposure?
- How should model/provider testing be recorded or compared?

---

## Recommended First Future Step

When this moves from idea to planning, the first step should be a **design/spec pass**, not implementation.

That design pass should define:

- remote MCP access model
- provider abstraction shape
- OpenRouter-specific integration requirements
- read-only initial tool set
- auth and scoping rules
- evaluation goals for comparative model testing

---

## Non Goals For Now

This document does not authorize:

- implementation of a remote MCP service now
- OpenRouter integration now
- provider-specific code in VEDA core now
- tactics-layer implementation now
- external model orchestration now

This is preserved for future consideration only.

---

## Guiding Principle

VEDA should be able to speak to many model providers later without becoming structurally dependent on any one of them.

That means provider choice should remain a plug, not a spine.
