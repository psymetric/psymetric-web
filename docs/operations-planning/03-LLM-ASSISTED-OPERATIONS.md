# LLM‑Assisted Operations

## Purpose
This document defines **how Large Language Models (LLMs) are used as assistants** within the PsyMetric system.

It exists to:
- accelerate drafting and analysis
- preserve human authority and intent
- prevent automation drift
- keep system behavior predictable and auditable

LLMs are operators, not owners.

---

## Core Principle

**LLMs assist. Humans decide. The system enforces.**

At no point does an LLM:
- define canonical truth
- publish content
- decide what matters
- act autonomously in public spaces

LLMs operate strictly within constraints defined by the system.

---

## Allowed LLM Capabilities

LLMs may be used to:

- Draft content bodies (Concepts, Guides, Projects, News)
- Summarize SourceItems
- Propose relationships between entities
- Suggest comparisons or clarifications
- Draft responses to captured social feedback
- Reformat content to match canonical page anatomy

All outputs are considered **draft artifacts** until reviewed.

---

## Forbidden LLM Capabilities

LLMs may not:

- Publish or update `status` to `published`
- Delete canonical entities
- Invent sources or citations
- Capture external content without operator action
- Post or reply on external platforms
- Modify system invariants

If an LLM can do it unsupervised, it is outside scope.

---

## Drafting Workflow

1. Operator captures a SourceItem
2. Operator requests LLM assistance
3. LLM drafts content or a response
4. Draft is stored as non‑canonical text
5. Operator reviews, edits, or rejects
6. Operator may request publish after validation

LLM drafts never bypass review steps.

---

## Relationship Suggestions

LLMs may suggest:
- related Concepts
- Concepts used by Guides or Projects
- potential Comparison pages

All relationship suggestions must be:
- explicitly approved
- validated against existing vocabularies

No relationship is created implicitly.

---

## Validation Before Promotion

Before any LLM‑assisted draft may be promoted:

- Page anatomy must pass validation
- Required relationships must exist
- Citation rules must be satisfied
- Operator intent must be preserved

Validation failures must be corrected before publish requests.

---

## Event Logging

All LLM actions are logged with:
- actor = `llm`
- action type
- affected entity
- timestamp

This preserves traceability and accountability.

---

## Tone and Safety Constraints

LLM output must:
- remain neutral and non‑persuasive in the Wiki
- avoid hype or speculation
- reflect uncertainty explicitly when present

Tone is corrected by humans, not learned implicitly.

---

## Failure Handling

If LLM output:
- violates structure
- invents facts
- ignores operator intent

The correct response is correction or rejection, not silent acceptance.

Errors are signals, not shortcuts.

---

## Invariants

- LLMs assist but do not decide
- All LLM output is reviewable
- System rules outrank model suggestions

If an LLM recommendation conflicts with this document, this document wins unless explicitly amended.

---

## Status
This document defines canonical LLM usage behavior.

Next operations‑planning documents will define:
- Publish review and gating
- Event logging and auditability
- Deployment and infrastructure baseline

End of document.

