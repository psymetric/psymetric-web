# Wiki Content Types & Page Anatomy

## Purpose
This document defines the **canonical content types** used in the Wiki surface and the **required anatomy** of each page type.

It exists to:
- lock search intent per page type
- ensure deterministic structure for SEO and LLM citation
- prevent content-role drift over time

This document intentionally favors predictability over creativity.

---

## Global Rules (Apply to All Wiki Pages)

- Each page serves **one primary intent**.
- Each page has **one canonical purpose**.
- Page anatomy is consistent across all pages of the same type.
- Definitions live only on Wiki pages.
- Marketing language, persuasion, and hype are forbidden.
- Relationships are rendered explicitly, not implied via prose.

If a page violates its role, it is incorrect even if the content is accurate.

---

## Entity Backing (DB Alignment)

The Wiki has five page types, but only four DB entities:

| Page Type | DB Entity | conceptKind |
|-----------|-----------|-------------|
| Concept | Concept | `standard` |
| Model | Concept | `model` |
| Comparison | Concept | `comparison` |
| Guide | Guide | — |
| Project | Project | — |

**Model pages** and **Comparison pages** are subtypes of Concept.

This keeps:
- One unified entity system
- Stable identity via UUID
- Relationship reuse (`CONCEPT_RELATES_TO_CONCEPT`)
- Clean URLs (`/models/{slug}` and `/comparisons/{slug}` resolve to Concept records)

### Comparison Target Ordering

Comparison pages compare exactly two (or more) entities. To preserve order and intent:

- Store `comparisonTargets: [conceptIdA, conceptIdB]` in the Concept record metadata
- Relationships (`CONCEPT_RELATES_TO_CONCEPT`) still exist for navigation/discovery
- The `comparisonTargets` array is authoritative for rendering order

This avoids new relationship types while keeping comparisons deterministic.

---

## 1. Concept Pages

### Role
Concept pages define **one technical concept or mental model**.

They are the atomic units of the knowledge system.

### Primary Search Intent
- “What is X?”
- “How does X work?”
- “Explain X simply”

### Allowed Content
- Plain-language definitions
- Conceptual explanations
- Mechanism overviews
- Common mistakes or misconceptions
- Illustrative examples

### Forbidden Content
- Step-by-step tutorials
- Vendor or model promotion
- Performance claims
- News or release commentary
- Opinionated framing

---

### Required Page Anatomy (In Order)

1. **Title (H1)**
   - Exact concept name
   - Singular, unambiguous

2. **Definition (Above the Fold)**
   - 1–2 paragraphs
   - Must stand alone if quoted
   - No citations required if conceptual

3. **Why It Matters**
   - Practical relevance
   - Avoid hype or evaluation

4. **How It Works (Conceptually)**
   - Mechanism-level explanation
   - No implementation steps

5. **Common Mistakes / Misunderstandings**
   - Clarifies boundaries of the concept

6. **Examples (Illustrative)**
   - Non-exhaustive
   - Used to reinforce understanding

7. **Related Concepts**
   - Auto-rendered from DB relationships

8. **Used In**
   - Guides
   - Projects
   - Models (if applicable)

9. **Sources / References (Optional)**
   - Only for non-conceptual claims

---

## 2. Model Pages

### Role
Model pages describe **specific LLMs or AI systems** as reference entities.

They are factual, time-scoped, and source-backed.

### Primary Search Intent
- “What is [Model Name]?”
- “[Model A] vs [Model B]”
- “[Model] capabilities”

### Allowed Content
- Documented capabilities
- Architectural or functional characteristics
- Limitations and constraints
- Linked Concepts used by the model

### Forbidden Content
- Marketing language
- Personality narratives
- Speculation about intent or roadmap
- Opinionated comparisons

---

### Required Page Anatomy (In Order)

1. **Title (H1)**
   - Official model name

2. **Summary (Reference Definition)**
   - What the model is
   - Scope and positioning

3. **Key Capabilities**
   - Bullet-style factual list
   - Source-backed where applicable

4. **Known Limitations**
   - Explicit constraints
   - Date-qualified when necessary

5. **Concepts Used**
   - Auto-rendered Concept relationships

6. **Comparisons**
   - Links to Comparison pages

7. **Sources / References**
   - Required for factual claims

---

## 3. Comparison Pages

### Role
Comparison pages contrast **two or more concepts or models** without declaring winners.

### Primary Search Intent
- “X vs Y”
- “Difference between X and Y”

### Allowed Content
- Symmetric comparison
- Tradeoffs
- Use-case distinctions

### Forbidden Content
- Rankings
- Subjective judgments
- Benchmark claims without context

---

### Required Page Anatomy (In Order)

1. **Title (H1)**
   - “X vs Y”

2. **Summary**
   - What is being compared and why

3. **Core Differences**
   - High-level distinctions

4. **Comparison Table (Optional)**
   - Only when it adds clarity

5. **When to Use Each**
   - Contextual guidance

6. **Related Concepts / Models**

7. **Sources / References**

---

## 4. Guide Pages

### Role
Guide pages provide **procedural instruction**.

They teach *how to do something*, not *what something is*.

### Primary Search Intent
- “How to…”
- “Build…”
- “Implement…”

### Allowed Content
- Step-by-step instructions
- Practical advice
- Debugging tips

### Forbidden Content
- Canonical definitions
- Performance claims
- Benchmarking language

---

### Required Page Anatomy (In Order)

1. **Title (H1)**

2. **What You Will Build / Learn**

3. **Prerequisites**

4. **Steps**

5. **Common Failures / Debugging**

6. **Related Concepts**

7. **Related Projects**

---

## 5. Project Pages

### Role
Project pages document **concrete build artifacts**.

They demonstrate that a concept can be implemented.

### Primary Search Intent
- “Example implementation of X”
- “X demo project”

### Allowed Content
- High-level architecture
- Repository links
- Usage overview
- Limitations

### Forbidden Content
- Step-by-step tutorials
- Marketing claims
- Production readiness claims

---

### Required Page Anatomy (In Order)

1. **Title (H1)**

2. **What This Project Is**

3. **What It Demonstrates**

4. **How It Works (High-Level)**

5. **How to Run It**

6. **Limitations**

7. **Related Guides**

8. **Related Concepts**

---

## Enforcement Note

Page anatomy is not advisory.

If content does not fit the role of its page type, it must be moved or rewritten.

---

## Status
This document defines canonical Wiki page structure.

Future documents will define:
- URL & routing strategy
- Internal linking and relationship rendering rules
- Schema and metadata mapping
- Publishing and indexing behavior

End of document.

