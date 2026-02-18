# Phase 1 MCP Tools Specification

## Overview

Phase 1 MCP tools provide read-only access to PsyMetric entities with strict project isolation. No write operations, event logging, or cross-phase features are permitted.

## Standard Error Envelope

All tools use a consistent error response structure:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {
      "field": "Additional context if applicable"
    }
  }
}
```

### Common Error Codes
- `PROJECT_NOT_FOUND`: Invalid or inaccessible projectId
- `VALIDATION_ERROR`: Invalid input parameters
- `ENTITY_NOT_FOUND`: Requested entity does not exist
- `INTERNAL_ERROR`: System error

## Tool Definitions

### 1. list_projects

**Purpose**: Enumerate projects accessible to this MCP server instance.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {},
  "additionalProperties": false
}
```

**Output Schema**:
```json
{
  "type": "object",
  "properties": {
    "projects": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "string", "format": "uuid" },
          "name": { "type": "string" },
          "slug": { "type": "string" },
          "description": { "type": ["string", "null"] },
          "createdAt": { "type": "string", "format": "date-time" },
          "updatedAt": { "type": "string", "format": "date-time" }
        },
        "required": ["id", "name", "slug", "createdAt", "updatedAt"]
      }
    }
  },
  "required": ["projects"]
}
```

**Ordering**: name ASC (case-insensitive)
**Hard Limits**: Maximum 100 projects per user
**Prohibited Behavior**: 
- No project creation
- No metadata modification

### 2. search_entities

**Purpose**: Search entities within a specific project using text matching.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "projectId": { "type": "string", "format": "uuid" },
    "query": { 
      "type": "string", 
      "minLength": 1, 
      "maxLength": 256 
    },
    "entityTypes": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": ["guide", "concept", "project", "news"]
      },
      "uniqueItems": true,
      "maxItems": 4
    },
    "limit": { 
      "type": "integer", 
      "minimum": 1, 
      "maximum": 50,
      "default": 20
    }
  },
  "required": ["projectId", "query"],
  "additionalProperties": false
}
```

**Output Schema**:
```json
{
  "type": "object",
  "properties": {
    "entities": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "string", "format": "uuid" },
          "entityType": { 
            "type": "string",
            "enum": ["guide", "concept", "project", "news"]
          },
          "title": { "type": "string" },
          "slug": { "type": "string" },
          "summary": { "type": ["string", "null"] },
          "status": {
            "type": "string",
            "enum": ["draft", "publish_requested", "published", "archived"]
          },
          "createdAt": { "type": "string", "format": "date-time" },
          "updatedAt": { "type": "string", "format": "date-time" }
        },
        "required": ["id", "entityType", "title", "slug", "status", "createdAt", "updatedAt"]
      }
    },
    "totalCount": { "type": "integer" }
  },
  "required": ["entities", "totalCount"]
}
```

**ProjectId Enforcement**: All queries filtered by `WHERE projectId = $1`
**Ordering**: updatedAt DESC, then id ASC. The secondary sort by id guarantees stable ordering when updatedAt timestamps are identical.
**Hard Limits**: 
- Maximum 50 results per request
- Query string maximum 256 characters
- Maximum 4 entity types in filter
**Prohibited Behavior**:
- No cross-project searches
- No entity creation during search

### 3. get_entity

**Purpose**: Retrieve complete details for a specific entity within a project.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "projectId": { "type": "string", "format": "uuid" },
    "entityId": { "type": "string", "format": "uuid" }
  },
  "required": ["projectId", "entityId"],
  "additionalProperties": false
}
```

**Output Schema**:
```json
{
  "type": "object",
  "properties": {
    "entity": {
      "type": "object",
      "properties": {
        "id": { "type": "string", "format": "uuid" },
        "entityType": { 
          "type": "string",
          "enum": ["guide", "concept", "project", "news"]
        },
        "title": { "type": "string" },
        "slug": { "type": "string" },
        "summary": { "type": ["string", "null"] },
        "difficulty": {
          "type": ["string", "null"],
          "enum": ["beginner", "intermediate", "advanced", null]
        },
        "conceptKind": {
          "type": ["string", "null"],
          "enum": ["standard", "model", "comparison", null]
        },
        "comparisonTargets": {
          "type": "array",
          "items": { "type": "string", "format": "uuid" }
        },
        "repoUrl": { "type": ["string", "null"] },
        "repoDefaultBranch": { "type": ["string", "null"] },
        "license": { "type": ["string", "null"] },
        "status": {
          "type": "string",
          "enum": ["draft", "publish_requested", "published", "archived"]
        },
        "canonicalUrl": { "type": ["string", "null"] },
        "contentRef": { "type": ["string", "null"] },
        "publishedAt": { "type": ["string", "null"], "format": "date-time" },
        "archivedAt": { "type": ["string", "null"], "format": "date-time" },
        "createdAt": { "type": "string", "format": "date-time" },
        "updatedAt": { "type": "string", "format": "date-time" },
        "relationshipCounts": {
          "type": "object",
          "properties": {
            "outgoing": { "type": "integer" },
            "incoming": { "type": "integer" }
          },
          "required": ["outgoing", "incoming"]
        }
      },
      "required": ["id", "entityType", "title", "slug", "status", "createdAt", "updatedAt", "relationshipCounts"]
    }
  },
  "required": ["entity"]
}
```

**ProjectId Enforcement**: Composite key lookup `WHERE projectId = $1 AND id = $2`
**Ordering**: N/A (single entity)
**Hard Limits**: Single entity per request
**Prohibited Behavior**:
- No cross-project entity access
- No entity modification

### 4. get_entity_graph

**Purpose**: Retrieve entity with connected relationships up to specified depth.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "projectId": { "type": "string", "format": "uuid" },
    "entityId": { "type": "string", "format": "uuid" },
    "depth": { 
      "type": "integer", 
      "minimum": 1, 
      "maximum": 2,
      "default": 1
    },
    "relationshipTypes": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "GUIDE_USES_CONCEPT",
          "GUIDE_EXPLAINS_CONCEPT", 
          "GUIDE_REFERENCES_SOURCE",
          "CONCEPT_RELATES_TO_CONCEPT",
          "CONCEPT_REFERENCES_SOURCE",
          "NEWS_DERIVED_FROM_SOURCE",
          "NEWS_REFERENCES_SOURCE",
          "NEWS_REFERENCES_CONCEPT",
          "PROJECT_IMPLEMENTS_CONCEPT",
          "PROJECT_REFERENCES_SOURCE",
          "PROJECT_HAS_GUIDE",
          "DISTRIBUTION_PROMOTES_GUIDE",
          "DISTRIBUTION_PROMOTES_CONCEPT",
          "DISTRIBUTION_PROMOTES_PROJECT",
          "DISTRIBUTION_PROMOTES_NEWS",
          "VIDEO_EXPLAINS_GUIDE",
          "VIDEO_EXPLAINS_CONCEPT",
          "VIDEO_EXPLAINS_PROJECT",
          "VIDEO_EXPLAINS_NEWS"
        ]
      },
      "uniqueItems": true,
      "maxItems": 50
    }
  },
  "required": ["projectId", "entityId"],
  "additionalProperties": false
}
```

**Output Schema**:
```json
{
  "type": "object",
  "properties": {
    "nodes": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "string", "format": "uuid" },
          "entityType": { 
            "type": "string",
            "enum": ["guide", "concept", "project", "news"]
          },
          "title": { "type": "string" },
          "slug": { "type": "string" },
          "summary": { "type": ["string", "null"] },
          "status": {
            "type": "string",
            "enum": ["draft", "publish_requested", "published", "archived"]
          },
          "depth": { "type": "integer", "minimum": 0, "maximum": 2 }
        },
        "required": ["id", "entityType", "title", "slug", "status", "depth"]
      }
    },
    "edges": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "fromEntityId": { "type": "string", "format": "uuid" },
          "toEntityId": { "type": "string", "format": "uuid" },
          "relationType": { 
            "type": "string",
            "enum": [
              "GUIDE_USES_CONCEPT",
              "GUIDE_EXPLAINS_CONCEPT", 
              "GUIDE_REFERENCES_SOURCE",
              "CONCEPT_RELATES_TO_CONCEPT",
              "CONCEPT_REFERENCES_SOURCE",
              "NEWS_DERIVED_FROM_SOURCE",
              "NEWS_REFERENCES_SOURCE",
              "NEWS_REFERENCES_CONCEPT",
              "PROJECT_IMPLEMENTS_CONCEPT",
              "PROJECT_REFERENCES_SOURCE",
              "PROJECT_HAS_GUIDE",
              "DISTRIBUTION_PROMOTES_GUIDE",
              "DISTRIBUTION_PROMOTES_CONCEPT",
              "DISTRIBUTION_PROMOTES_PROJECT",
              "DISTRIBUTION_PROMOTES_NEWS",
              "VIDEO_EXPLAINS_GUIDE",
              "VIDEO_EXPLAINS_CONCEPT",
              "VIDEO_EXPLAINS_PROJECT",
              "VIDEO_EXPLAINS_NEWS"
            ]
          },
          "notes": { "type": ["string", "null"] }
        },
        "required": ["fromEntityId", "toEntityId", "relationType"]
      }
    }
  },
  "required": ["nodes", "edges"]
}
```

**Entity-Only Traversal**: Graph traversal includes ONLY edges where both endpoints are Entity records. Any relation that targets non-Entity types (SourceItem, DistributionEvent, Video, MetricSnapshot, etc.) must be excluded from nodes/edges.

**ProjectId Enforcement**: Traversal filters EntityRelation rows by `relation.projectId = requested projectId` before loading entities. All traversed entities validated against projectId.
**Ordering**: 
- Nodes: depth ASC, then title ASC (case-insensitive)
- Edges: fromEntityId ASC, then toEntityId ASC
**Hard Limits**:
- Maximum depth: 2
- Maximum nodes: 100
- Maximum edges: 200
**Prohibited Behavior**:
- No cross-project relationship traversal
- No relationship modification

## Global Constraints

### Project Isolation
- All tools except `list_projects` require valid `projectId`
- No silent fallback to default project
- Cross-project data access returns `ENTITY_NOT_FOUND`

### Deterministic Behavior
- All ordering rules explicitly defined
- Consistent results for identical inputs
- No non-deterministic relationship traversal

### Performance Safeguards
- Hard limits prevent runaway queries
- Timeout enforcement at 30 seconds per request
- Memory-bounded result sets

### Phase 1 Restrictions
- No write operations
- No event logging
- No caching mechanisms
- No semantic analysis features
