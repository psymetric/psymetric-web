# Chrome Extension – Scope & Behavior

## Purpose
This document defines the **intended scope, behavior, and constraints** of the PsyMetric Chrome extension.

It exists to:
- support manual, intentional source capture
- enable LLM-assisted drafting without automation risk
- preserve platform Terms of Service compliance
- prevent the extension from becoming an autonomous agent

The extension is a **capture tool**, not a publishing tool.

---

## Core Principle

**The extension assists observation, not action.**

- Humans decide what to capture
- Humans decide what to post
- The extension records context and intent

At no point does the extension publish content or act on behalf of the user.

---

## What the Extension Is

The Chrome extension is a lightweight interface for:
- capturing selected text and context
- recording operator intent
- creating SourceItems in the PsyMetric database

It acts as a bridge between the open web and the internal system.

---

## What the Extension Is Not

The extension is explicitly **not**:
- a social media bot
- an auto-reply tool
- an auto-posting agent
- an automation system
- a content generator visible to external platforms

All posting remains manual.

---

## Supported Capture Contexts

The extension may be used on:
- social media platforms (e.g., replies, threads)
- articles and blog posts
- documentation pages
- repositories
- videos (via page metadata)

The extension captures *what the user selects*, not entire pages by default.

---

## Captured Data (Minimum)

When a capture occurs, the extension records:
- selected text
- page URL
- page title (if available)
- timestamp
- operator note / intent (required)

Optional captured metadata:
- platform name
- author/handle (if visible)
- parent post URL (for replies)

---

## Operator Intent (Required)

Every capture requires a short operator note describing *why* the source was captured.

Examples:
- "Good faith question worth answering"
- "Common misunderstanding"
- "Strong objection I should respond to"
- "Useful phrasing"

This intent is stored with the SourceItem and guides downstream LLM assistance.

---

## LLM Interaction Model

The extension itself:
- does not call LLMs directly
- does not generate replies

Captured SourceItems may later be:
- summarized by an LLM
- used to draft suggested responses

All LLM output is reviewed and posted manually by the operator.

---

## Compliance & Safety Guarantees

The extension enforces the following guarantees:

- No automated posting
- No credential usage for external platforms
- No background scraping or bulk ingestion
- No impersonation or autonomous behavior

These constraints exist to preserve platform compliance and user accountability.

---

## Relationship to Source Capture Workflow

- Every capture creates a SourceItem
- SourceItems enter the Inbox in `ingested` state
- All downstream actions follow `01-SOURCE-CAPTURE-AND-INBOX.md`

The extension does not bypass existing workflow rules.

---

## Anti-Patterns (Explicitly Forbidden)

- Auto-reply buttons
- One-click posting
- Background monitoring of feeds
- Silent capture without operator intent

If a proposed feature conflicts with this section, it must not be implemented.

---

## Invariants

- The extension never posts content
- The extension never decides intent
- The extension never bypasses review

If future changes conflict with these invariants, this document wins unless explicitly amended.

---

## Status
This document defines the canonical scope of the Chrome extension.

It is intentionally conservative by design.

End of document.

