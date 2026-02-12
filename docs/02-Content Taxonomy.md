02 — Content Taxonomy (Guides, Concepts, Projects, News)
Purpose

This document defines PsyMetric’s public-facing content types and how they work together.

PsyMetric is a learning brand. Content is designed to be:

beginner-friendly without insulting experts

practical and build-oriented

traceable across the DB, website, social platforms, and GitHub

This document is intentionally simple and enforceable.

Core Content Types

PsyMetric publishes four primary content types:

Guides

Concepts

Projects

News

Each type has a different role in the learning ecosystem. Together they form a connected graph.

1) Guides
Definition

A Guide is a hands-on tutorial or walkthrough that teaches a skill, pattern, or workflow.

Guides are the primary driver of:

learning value

repeatable practice

SEO discovery (long-tail)

social distribution

What Guides Are

practical and runnable

project-oriented (build something)

anchored to Concepts

linked to Projects when applicable

What Guides Are Not

benchmarks or evaluations

“best tool” listicles

performance comparisons

authority claims without evidence

Required DB Fields (Guide)

id (UUID)

type = guide

title

slug

status (draft|published|archived)

summary (short)

difficulty (beginner|intermediate|advanced)

estimatedTimeMinutes (number, optional but recommended)

primaryConceptIds (≥ 1)

projectIds (0+)

sourceItemIds (0+)

createdAt, updatedAt

Guide Page Anatomy (Required Sections)

What you’ll build / learn

Prerequisites

Steps

Common failures / debugging

Next steps

Related Concepts

Related Projects (if any)

Mandatory Disclaimer (Guides)

Every Guide must include a short, explicit line:

Disclaimer: This is a practical tutorial, not a benchmark or empirical evaluation. Performance claims require controlled testing.

This protects brand credibility long-term.

2) Concepts
Definition

A Concept explains an idea, term, mechanism, or mental model used in AI/LLM building.

Concepts are your evergreen anchors and internal linking hubs.

What Concepts Are

definitions + explanation + intuition

beginner-friendly first, deeper second

referenced by Guides and Projects

What Concepts Are Not

tutorials (that’s Guides)

news (that’s News)

project docs (that’s Projects)

Concept Subtypes (Optional)

Concepts may be tagged/subtyped as:

core (fundamental)

applied (practical explanation)

pattern (repeatable technique)

showcase (demonstration-style concept page)

This is optional; don’t over-engineer early.

Required DB Fields (Concept)

id (UUID)

type = concept

title

slug

status

summary (short)

difficulty (beginner|intermediate|advanced)

relatedConceptIds (0+)

createdAt, updatedAt

Concept Page Anatomy (Required Sections)

Plain-language definition (beginner)

Why it matters

How it works (deeper)

Common mistakes

Examples

Related Concepts

Used in Guides / Projects (auto-rendered from relationships)

3) Projects
Definition

A Project is a build artifact, usually backed by a GitHub repository, intended as:

a reference implementation

a demo

a learning vehicle

Projects are how PsyMetric earns credibility without needing “lab testing.”

What Projects Are

real code

documented clearly

tied to Guides (how to build/use it)

tied to Concepts (what it demonstrates)

What Projects Are Not

SaaS products (unless explicitly later)

long-term support commitments

“frameworks” unless intentionally scoped that way

Required DB Fields (Project)

id (UUID)

type = project

title

slug

status

summary

repoUrl (GitHub)

repoDefaultBranch (optional)

license (optional)

primaryConceptIds (0+ but recommended)

guideIds (0+ but recommended)

createdAt, updatedAt

Project Page Anatomy (Required Sections)

What it is

What it demonstrates

Repo link + quickstart

How it works (high level)

How to run it

Limitations

Related Guides

Related Concepts

4) News
Definition

News is curated signal: updates, releases, and noteworthy patterns in the AI world, explained in PsyMetric’s voice.

News exists to:

keep the site alive and current

feed future Guides and Projects

help beginners understand “what changed” without hype

What News Is

curated and explained (not a feed dump)

tied to Concepts (what it means)

optionally tied to Sources (RSS items, links)

What News Is Not

an RSS mirror

hot takes

fear-based or hype-based posting

Required DB Fields (NewsItem)

id (UUID)

type = news

title

slug

status

summary

sourceItemIds (0+)

relatedConceptIds (0+)

createdAt, updatedAt

News Page Anatomy (Required Sections)

What happened

Why it matters

What it enables

What could be misunderstood

Links / Sources

Related Concepts

Next Guide/Project candidates (optional but powerful)

Cross-Type Linking Rules (Simple, Enforced)

To keep the knowledge graph alive:

Every Guide must link to ≥ 1 Concept

Every Project must link to its GitHub repo

Every News item should link to ≥ 1 Concept where possible

Relationships are stored in DB (first-class edges)

Inline links in MDX are allowed, but DB relationships are authoritative.

Distribution Rules (Preview)

Social posts should not float untracked.

Every SocialPost should reference one of:

Guide

Project

Concept

NewsItem

This is enforced later in the Distribution & Traceability doc.

Status Model (Simple)

For v1, use a minimal status model:

draft (not public)

published (public)

archived (public but not promoted)

Avoid complex lifecycle states early.

End of document