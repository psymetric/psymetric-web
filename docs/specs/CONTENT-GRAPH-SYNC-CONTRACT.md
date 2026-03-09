# Content Graph Sync Contract

## Purpose

Defines how external websites (typically Next.js projects) synchronize their structural metadata with VEDA's Content Graph Layer.

The website remains the source of rendered content. VEDA stores the structural representation required for reasoning.

## Core Principles

1. Websites render independently from the database.
2. The database stores the structural representation of the site.
3. Sync is explicit and deterministic.

## Canonical Page Identity

Canonical page identity:

siteId + canonicalUrl

URLs are the primary identity because search systems operate on URLs rather than file paths.

## Sync Payload Shape

Example payload:

{
  "site": {
    "domain": "example.com"
  },
  "pages": [],
  "links": [],
  "schemaUsage": []
}

## Page Fields

- canonicalUrl
- pageType
- title
- indexable
- sitemapIncluded

## Link Fields

- sourcePage
- targetPage
- anchorText
- linkType

## Schema Fields

- page
- schemaType

## Sync Workflow

1. Developer edits site.
2. Build process extracts metadata.
3. Sync command sends payload to VEDA.
4. VEDA updates Content Graph.

## Determinism

Sync must always produce the same structure for identical site states.

No implicit mutation or background processes.
