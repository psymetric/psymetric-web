# 08 — METRIC TYPE VOCABULARY (CANONICAL LIST)

## Purpose

This document defines the canonical `metricType` values PsyMetric uses in `MetricSnapshot.metricType`.

`metricType` remains a string in the DB for flexibility, but the application layer MUST validate values against this list to prevent naming drift (e.g., `viewCount` vs `views`).

This list is intentionally small. Add new values only when necessary and record changes in `SystemConfig` (or via an EventLog entry of `SYSTEM_CONFIG_CHANGED`).

---

## General Rules

- Use **lowercase snake_case**
- Prefer **platform-neutral** names when possible
- Do not encode platform into the metricType (platform is already a field)
- Store **facts**, not judgments (no `viral_score`, `success`, etc.)
- Metrics are **append-only snapshots**

---

## Core Metric Types (Recommended)

These are the default metrics PsyMetric should use across platforms when available.

### Reach / Consumption

- `views`
- `impressions` (only when platforms define this meaningfully)
- `unique_views` (only if reliably available)
- `watch_time_minutes` (video only, when available)

### Engagement

- `likes`
- `comments`
- `replies` (for platforms that distinguish replies vs comments)
- `shares`
- `reposts` (if a platform explicitly distinguishes this from shares)
- `bookmarks` (when available)

### Click/Traffic

- `clicks`
- `link_clicks` (preferred when platform provides explicit link click counts)
- `ctr` (click-through rate, store as integer basis points if possible; otherwise document format)

### Website-specific (first-party)

- `pageviews` (preferred on website instead of `views` if you want to distinguish)
- `sessions`
- `unique_sessions`
- `avg_time_on_page_seconds`
- `bounce_rate` (store as integer basis points if possible; otherwise document format)

### GitHub adoption (Project only)

- `stars`
- `forks`
- `watchers`
- `issues_open`
- `issues_closed`
- `pull_requests_open`
- `pull_requests_merged`

---

## Platform Notes

### X (Twitter)

Commonly observable:
- `views` (if visible)
- `likes`
- `replies`
- `reposts` (or `shares` depending on platform semantics)

If only partial data is available, store what you have and set confidence accordingly.

### YouTube

Commonly available:
- `views`
- `likes`
- `comments`

Optional if available:
- `watch_time_minutes`
- `impressions`
- `ctr`

### Website

Prefer website-native terms:
- `pageviews`
- `sessions`
- `unique_sessions`
- `avg_time_on_page_seconds`

### GitHub

Use GitHub-specific adoption signals:
- `stars`, `forks`, `watchers`, etc.

---

## Value Formatting Rules

- `value` is stored as an **integer**
- Rates should be stored as **basis points** when possible:
  - Example: 12.34% → store `1234`
  - Store the formatting convention in `notes` or in SystemConfig once and keep it consistent
- Durations:
  - store seconds (`avg_time_on_page_seconds`) or minutes (`watch_time_minutes`) explicitly in the metricType name

---

## Change Control

If adding a new metricType:

1. Add it to this document
2. Update validation in the application layer
3. Record a `SYSTEM_CONFIG_CHANGED` event (or SystemConfig update) noting the change

---

## End of Document
