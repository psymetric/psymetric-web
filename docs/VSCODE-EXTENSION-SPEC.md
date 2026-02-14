# PsyMetric VS Code Extension — Content Ops Cockpit

**Status:** Future Vision (not active development)  
**Last updated:** February 13, 2026  
**Depends on:** Voltron core system fully operational + 2 weeks dogfooding minimum  
**Related:** docs/REBECCA-SPEC.md (Rebecca can surface through this extension)

---

## 1. Purpose

A VS Code extension that surfaces PsyMetric's operational state directly in the editor, eliminating browser context-switching for routine content operations. The extension is a **client of the Voltron API** — it does not access the database, bypass validation, or perform any operation the dashboard can't.

---

## 2. Core Constraint

**The extension talks to the API. Never the database.**

Every read goes through `GET /api/*`. Every mutation goes through `POST/PATCH/PUT/DELETE /api/*`. If an operation isn't available through the API, that's a signal to add an API route — not to bypass the API from the extension. This is the same rule as Rebecca (Rule 3) and the dashboard.

---

## 3. Feature Ladder

Implementation order based on effort-to-value ratio. Each level is independently useful — don't skip ahead.

### Level 1 — Environment Switcher (Status Bar)

**Build first. Prevents the most dangerous class of mistake.**

A status bar item showing the current Voltron environment:

- `PsyMetric: LOCAL` (default, neutral color)
- `PsyMetric: STAGE` (yellow)
- `PsyMetric: PROD` (red background)

Click to switch via Quick Pick. Stores base URL + auth token per environment in VS Code settings. All subsequent extension API calls use the selected environment.

**Configuration:**

```json
{
  "psymetric.environments": {
    "local": { "baseUrl": "http://localhost:3000", "token": "" },
    "stage": { "baseUrl": "https://stage.psymetric.dev", "token": "" },
    "prod": { "baseUrl": "https://psymetric.dev", "token": "" }
  },
  "psymetric.activeEnvironment": "local"
}
```

**Why first:** Operating against the wrong environment is the single most dangerous mistake in a CMS. Red status bar for prod prevents real damage.

### Level 2 — Entity Explorer (Tree View)

**The "file explorer" for your content system.**

A sidebar tree view under a PsyMetric icon:

```
PSYMETRIC
├── Entities
│   ├── By Type
│   │   ├── Guides (12)
│   │   ├── Concepts (8)
│   │   ├── Projects (3)
│   │   └── News (5)
│   ├── By Status
│   │   ├── Draft (15)
│   │   ├── Publish Requested (2)
│   │   └── Published (11)
│   └── Saved Filters
│       ├── Recently Updated
│       ├── Orphans (no relationships)
│       └── Stale Drafts (>30 days)
├── Publish Queue (2)
├── Source Inbox (7 ingested)
└── Alerts (1)
```

**Node behaviors:**

- Clicking an entity opens a read-only detail view (webview panel)
- Right-click context menu: Validate, Request Publish, Open in Dashboard
- Counts refresh on tree view focus (not polling — explicit refresh button)
- Custom icons per entity type and status badges

**Data source:** `GET /api/entities` with filters, `GET /api/source-items` with status filter.

### Level 3 — Command Palette Actions

**Power-user speed for lifecycle operations.**

Commands registered:

```
PsyMetric: Create Entity
PsyMetric: Validate Entity
PsyMetric: Request Publish
PsyMetric: Publish
PsyMetric: Reject
PsyMetric: Capture Source
PsyMetric: Promote Source to Entity
PsyMetric: Create Relationship
PsyMetric: Remove Relationship
PsyMetric: Run API Hammer
PsyMetric: Open Entity by ID
PsyMetric: Open Entity by Slug
PsyMetric: Switch Environment
PsyMetric: Refresh Entity Tree
PsyMetric: Show Daily Briefing (when Rebecca Phase A is active)
```

Commands that require entity selection use Quick Pick with search (backed by `GET /api/entities?search=`). Commands that mutate state require confirmation.

### Level 4 — Entity Detail Webview

**Rich detail panel for when tree view context menus aren't enough.**

A webview panel that renders when clicking an entity in the tree view:

**Tabs:**

- **Overview** — Type, status, slug, dates, summary, canonicalUrl, contentRef, difficulty, repoUrl
- **Relationships** — Table of inbound/outbound relationships with remove buttons
- **Events** — Chronological event log timeline
- **Distribution** — Distribution events for this entity, inline "Record Distribution" form
- **Metrics** — Metric snapshots for this entity, inline "Record Snapshot" form

**Actions available in the webview:**

- Edit allowlisted fields (title, summary, contentRef, canonicalUrl, difficulty, repoUrl)
- Lifecycle buttons (Validate, Request Publish, Publish, Reject) based on current status
- Create relationship to another entity
- All mutations go through the API with confirmation

**Data sources:** `GET /api/entities/{id}`, `GET /api/relationships?entityId=`, `GET /api/events?entityId=`, `GET /api/distribution-events?primaryEntityId=`, `GET /api/metric-snapshots?entityId=`

### Level 5 — Editor Integration (CodeLens + Diagnostics)

**This is the feature that justifies the extension existing instead of bookmarking the dashboard.**

#### 5a. CodeLens on Content Files

If a file path matches an entity's `contentRef`, show CodeLens annotations at the top of the file:

```
[Entity: "Transformer Architecture" | Status: draft | Validate | Request Publish | Open in PsyMetric]
```

This requires a lookup: when a file opens, check `GET /api/entities?search={filename}` and match against `contentRef`. Cache results per session.

#### 5b. Diagnostics Panel

Warnings surfaced in VS Code's Problems panel:

- `Entity "prompt-engineering-basics": contentRef missing (required for publish)`
- `Entity "attention-mechanism": referenced by 4 guides but entity does not exist`
- `Entity "rag-patterns": in draft for 47 days with no updates`

These run on extension activation and tree view refresh, not continuously. Backed by the same queries Rebecca Phase A would use.

#### 5c. Hover Tooltips

Hovering over a slug or entity ID in any file shows a tooltip with entity summary and status. Useful when editing relationship configs or content files that reference other entities.

### Level 6 — Rebecca Integration

**Only after Rebecca Phase A is operational.**

- Daily briefing rendered in a webview panel or output channel
- Typed action proposals rendered as clickable buttons in the briefing
- Approve/reject directly from VS Code
- Briefing history queryable via command palette

This level depends entirely on Rebecca's skill module infrastructure being built and tested.

---

## 4. API Hammer Integration

The existing `api-hammer.ps1` script (or a future cross-platform Node equivalent) runs as a VS Code Task:

```json
{
  "label": "PsyMetric: API Hammer",
  "type": "shell",
  "command": "powershell",
  "args": ["-File", "${workspaceFolder}/scripts/api-hammer.ps1", "-Base", "${config:psymetric.environments.${config:psymetric.activeEnvironment}.baseUrl}"],
  "group": "test",
  "presentation": {
    "reveal": "always",
    "panel": "new"
  }
}
```

Results streamed into Output panel. Failures summarized in a webview report. Future: parse output and surface failures as diagnostics.

---

## 5. Authentication Model

Phase 1 (now): No auth on API routes. Extension uses base URL only.

Future: API key or JWT per environment, stored in VS Code's `SecretStorage` API (encrypted, per-machine). Never in settings.json, never in plaintext, never committed to git.

```typescript
// Future auth pattern
const secret = context.secrets.get(`psymetric.token.${env}`);
const headers = secret ? { Authorization: `Bearer ${secret}` } : {};
```

---

## 6. Offline / Degraded Mode

Voltron's database is remote (Neon). Connection drops are real.

**Behavior when API is unreachable:**

- Tree view shows last-known state with `[STALE]` suffix on root node
- Status bar shows `PsyMetric: PROD (offline)` in grey
- All mutation commands disabled with "API unreachable" message
- Read-only cached data remains browsable
- Automatic reconnect attempt on next explicit action (not polling)

**No local cache database.** Just in-memory last-known state that clears on extension restart. Keep it simple.

---

## 7. What This Extension Is NOT

- Not a database client (no Prisma, no SQL, no direct Neon access)
- Not an autonomous agent (no background operations without user action)
- Not a replacement for the web dashboard (both are API clients, user picks preferred surface)
- Not a code generator (no scaffolding, no template creation)
- Not a git workflow tool (no PR creation, no branch management)

It is a **content operations interface** that happens to live where you write code.

---

## 8. Technical Stack

- **Language:** TypeScript
- **VS Code API version:** Target latest stable
- **HTTP client:** Built-in `fetch` or `node-fetch` (no heavy dependencies)
- **Webview framework:** Plain HTML/CSS/JS or lightweight (no React in webviews unless complexity demands it)
- **State management:** VS Code `Memento` for persistent settings, in-memory for session cache
- **Testing:** `@vscode/test-electron` for integration tests, standard Jest for unit tests

---

## 9. Development Sequence

| Step | Deliverable | Depends On |
|------|------------|------------|
| 1 | Extension scaffold + env switcher | Voltron deployed |
| 2 | Entity tree view (read-only) | GET /api/entities working |
| 3 | Command palette lifecycle actions | All lifecycle API routes working |
| 4 | Entity detail webview | GET /api/entities/{id} working |
| 5 | CodeLens on content files | Entities with contentRef populated |
| 6 | Diagnostics panel | Validation logic stable |
| 7 | API Hammer task integration | api-hammer script cross-platform |
| 8 | Rebecca briefing panel | Rebecca Phase A operational |

Each step is a standalone PR. No step requires the next one to be useful.

---

## 10. Relationship to Rebecca

Rebecca and the VS Code extension are **separate systems that share a surface.**

- Rebecca is the intelligence layer (analysis, recommendations, briefings)
- The extension is the UI surface (tree views, webviews, commands)
- Rebecca's output can render in the extension, but Rebecca doesn't depend on the extension
- The extension doesn't depend on Rebecca — Levels 1–5 work without her

When both exist, the extension becomes Rebecca's preferred display surface for operators who live in VS Code. But each stands alone.
