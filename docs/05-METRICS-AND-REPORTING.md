05 — Metrics & Reporting
Purpose

This document defines how PsyMetric collects, stores, and reasons about metrics without assuming full or paid API access.

Metrics are treated as:

time-based facts

platform-constrained

incomplete by default

The system is designed to:

work with free or limited APIs

accept partial data honestly

upgrade cleanly when richer APIs become available

support new platforms without schema changes

avoid turning metrics into goals

Core Principle

Metrics are observations, not conclusions.

PsyMetric records what can be observed, when it was observed, and how it was obtained.
Missing data is acceptable and must never be inferred.

Metric Model (Platform-Agnostic)

All metrics are stored as MetricSnapshot entities.

Required Fields (MetricSnapshot)

id (UUID)

targetEntityId (Guide | Concept | Project | News | SocialPost | Video)

platform (website | x | youtube | github | other)

metricType (views | likes | replies | shares | stars | forks | etc.)

value (number)

capturedAt (timestamp)

source (api | manual | analytics | scrape)

confidence (high | medium | low, optional)

notes (optional)

Rules

MetricSnapshots are append-only

Values are never overwritten

Absence of a metric ≠ zero

Metric Domains (Must Not Be Mixed)

Metrics represent different phenomena depending on origin.

Website metrics → learning & consumption

Social metrics → distribution & amplification

GitHub metrics → adoption & reuse

LLMs and humans must not collapse these into a single “success score”.

Platform: PsyMetric Website
Data Source

First-party analytics

Privacy-respecting by default

Typical Metrics

page views

unique sessions (if available)

referrer (search / social / direct)

time window (daily or weekly)

Storage Rules

platform = website

source = analytics

confidence = high

Website metrics attach to:

Guides

Concepts

Projects

NewsItems

Interpretation Rules

Website metrics indicate actual usage

Evergreen traffic is meaningful

Short-term spikes are noted, not optimized for automatically

Platform: X (Twitter)
Current Reality (No Paid API)

Available methods:

manual entry

limited scraping (where legal/ethical)

creator analytics (manual capture)

Typically observable:

view count (if visible)

likes

reposts

replies

post timestamp

post URL

Storage Rules

source = manual | scrape

confidence = low | medium

Future Upgrade

When paid API access is available:

automated polling

richer engagement breakdowns

higher confidence snapshots

Rule: No schema changes are required when upgrading access.

Platform: YouTube
Current Reality (Free API)

Available via YouTube Data API:

views

likes

comments count

publish time

channel association

Limitations:

rate limits

delayed updates

evolving metric availability

Storage Rules

source = api

confidence = high

YouTube metrics attach to:

Video entities

indirectly inform related Guides/Projects

Platform: GitHub
Data Source

GitHub public API (free tier)

authenticated API (optional later)

Typical Metrics

stars

forks

watchers

open issues count

coarse commit activity

Storage Rules

platform = github

source = api

confidence = high

GitHub metrics attach only to Project entities.

Interpretation Rules

represent interest and adoption

do not represent quality

never used alone to drive decisions

Manual Metrics Entry (First-Class)

Manual entry is a supported and expected path.

Use cases:

platforms with no API

early-stage platforms

screenshots of creator dashboards

partial or delayed access

Manual metrics must:

set source = manual

include explanatory notes

optionally reference a stored screenshot (object storage)

Comment & Reply Text (Explicitly Not Metrics)

Comment and reply text is never treated as a metric.

Comment text is captured manually only

Captured via the Chrome extension

Stored as SourceItem entities with snapshots

Used as qualitative signal and context

Counts (e.g., reply count) may be stored as metrics, but content is not ingested automatically.

Metric Collection Cadence

Metrics may be collected:

at publish time

at fixed intervals (e.g., 24h / 7d / 30d)

opportunistically

Cadence is advisory, not enforced.

Reporting & Interpretation Rules
Allowed

trend summaries

time-based comparisons

correlation hypotheses

qualitative + quantitative synthesis

Not Allowed

declaring success/failure

inferring causation

automatic content optimization

engagement-maximization logic

Metrics inform humans. Humans decide.

LLM Usage Rules (Metrics)

LLMs may:

summarize metrics

highlight anomalies

suggest follow-up analysis

ask for missing data

LLMs must:

cite MetricSnapshot IDs

acknowledge gaps

respect confidence levels

LLMs must not:

fabricate metrics

infer unseen platform data

rank content by “performance”

Platform Expansion

Adding a new platform requires:

defining observable metrics

mapping them to metricType

documenting access constraints

No schema changes are required.

Change Control

Any changes to:

metric definitions

acquisition methods

interpretation rules

must be documented and versioned.