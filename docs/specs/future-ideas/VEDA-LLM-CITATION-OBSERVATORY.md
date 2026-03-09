# VEDA LLM Citation Observatory

## Purpose

This document describes a future observatory within VEDA dedicated to tracking how large language models reference, cite, and mention domains when answering prompts.

While the existing VEDA architecture focuses on Google SERP dynamics, the LLM Citation Observatory expands the system to monitor visibility within AI-generated answers.

This creates an additional observational surface for understanding how information authority is evolving across the web.

---

# Position Within VEDA Architecture

VEDA ultimately observes search ecosystems across **multiple complementary graphs**.

These observational systems include:

Search Graph (SERP Observatory)
- Google ranking behavior
- feature volatility
- intent drift
- domain dominance

Content Graph
- project website structure
- internal links
- schema usage
- entity and topic coverage

Competitor Content Observatory
- structure of competing pages
- schema patterns
- archetype dominance
- internal support structures

LLM Citation Observatory
- which domains are cited in AI responses
- citation frequency
- model-specific citation patterns

Together these systems allow VEDA to reason across:

- search engine ranking behavior
- competitor implementation patterns
- project site structure
- AI knowledge citation behavior

This multi-surface observation model enables deeper strategic intelligence than any single data source alone.

---

# Concept

Large language models frequently provide answers that reference external sources. These references act as **citations** and represent a new form of visibility.

Instead of measuring ranking position, the LLM Citation Observatory measures:

- which domains are referenced
- how frequently domains are cited
- how citations differ across models
- how citation patterns evolve over time

Example pipeline:

Prompt
   ↓
LLM Response
   ↓
Citation Extraction
   ↓
Citation Signals

---

# Example

Prompt:

"best project management software"

Example model outputs:

Claude citations:
- asana.com
- clickup.com
- monday.com

GPT citations:
- asana.com
- notion.so
- clickup.com

Gemini citations:
- asana.com
- monday.com

These references form a measurable signal.

---

# Citation Signals

Possible signals derived from citation data:

citationFrequency
modelCoverage
domainCitationShare
citationVolatility
promptIntentDrift

Example metric:

Domain Citation Share

percentage of prompts where a domain appears as a cited source.

---

# Example Record

{
  "prompt": "best project management software",
  "model": "Claude",
  "citations": [
    "asana.com",
    "clickup.com",
    "monday.com"
  ]
}

Over time VEDA can track citation frequency and volatility.

---

# Relationship to SERP Observatory

The LLM Citation Observatory does not replace the SERP Observatory.

Instead it operates alongside it.

SERP Observatory measures:

- Google ranking
- feature volatility
- intent drift
- domain dominance

LLM Citation Observatory measures:

- AI answer visibility
- citation patterns
- model-specific authority

Combining the two surfaces enables deeper analysis.

Example insight:

A domain may rank poorly in Google but be frequently cited by LLMs.

Or a domain may dominate Google rankings but rarely appear in AI answers.

These mismatches represent emerging search behavior patterns.

---

# Example Composite Signals

SERP Rank
+
LLM Citation Frequency
+
Domain Dominance
+
Entity Coverage

Possible derived metric:

Knowledge Authority Score

This metric would represent how often a domain is treated as a trusted knowledge source across both search engines and LLM systems.

---

# Data Sources

Candidate data sources include:

DataForSEO LLM Mentions API
- domain mentions within AI-generated answers
- prompt to domain relationships

AI Overview citation signals from SERP ingest
- domains referenced inside Google AI Overviews

Direct LLM response capture
- Claude
- GPT
- Gemini
- Perplexity

These signals together provide a broader picture of AI citation behavior.

---

# Future Architecture

VEDA

SERP Observatory
Competitor Content Observatory
Content Graph
LLM Citation Observatory

        ↓

Strategy Synthesis Layer
        ↓

Execution Planning Layer
        ↓

Tactics Layer
        ↓

SEO Lab

---

# Implementation Timing

This observatory should not be implemented until the core SERP observatory is stable.

Immediate priorities remain:

SERP ingest stability
sensor validation
timeline determinism
causality verification

Once the SERP observatory is proven with real data, the LLM Citation Observatory can be introduced using providers such as DataForSEO's AI Optimization APIs.

---

# Summary

The LLM Citation Observatory allows VEDA to track a new form of visibility: **AI answer exposure**.

Instead of only measuring where a site ranks, VEDA can measure how often it is treated as a trusted source by AI systems.

This creates an additional observational layer that complements traditional SERP analysis and integrates with the broader VEDA intelligence architecture.
