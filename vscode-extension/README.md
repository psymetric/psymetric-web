# VEDA VS Code Extension — Phase 1

Thin client for the VEDA observatory. Surfaces project investigation and
keyword diagnostics inside VS Code via the VEDA HTTP API.

---

## Development Setup

```bash
cd vscode-extension
npm install
npm run compile
```

Then press **F5** in VS Code with the `vscode-extension/` folder open to launch
the Extension Development Host.

---

## Configuration

Add to your VS Code `settings.json`:

```json
{
  "veda.environments": {
    "local": { "baseUrl": "http://localhost:3000" },
    "stage": { "baseUrl": "https://stage.example.com" },
    "prod":  { "baseUrl": "https://example.com" }
  },
  "veda.activeEnvironment": "local"
}
```

---

## Commands

| Command | Description |
|---|---|
| `VEDA: Switch Environment` | Change active environment via status bar |
| `VEDA: Select Project` | Choose active project from available projects |
| `VEDA: Refresh Context` | Refresh the Project Context sidebar view |
| `VEDA: Investigate Project` | Run full project investigation; renders results panel |
| `VEDA: Keyword Diagnostic` | Select a keyword target and view its diagnostic packet |

---

## Architecture

```
extension.ts          — activation, service wiring
registerCommands.ts   — command registration hub

commands/             — one file per command
services/             — VedaClient (HTTP), StateService, ConfigService
providers/            — ProjectContextProvider (sidebar webview)
views/                — ResultsPanel (investigation + keyword panels)
types/                — API response shapes
utils/                — error handling, HTML formatting helpers
```

**The extension is a thin client.** No business logic, no DB access, no local
analytics. All intelligence lives in VEDA.

---

## Phase 1 Scope

Read-only. No mutation surfaces.

Out of scope until later phases: entity explorer, lifecycle transitions,
content graph writes, patch review, CodeLens, audit runner, background polling.
