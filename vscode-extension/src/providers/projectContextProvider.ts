// ─── providers/projectContextProvider.ts ────────────────────────────────────
//
// Sidebar webview provider. Displays active project context: name, domain,
// lifecycle state, maturity summary, next valid action.
// Phase 1.8: lifecycle badge with colour emphasis; nextValidAction prominently displayed.
// Phase 1.9: lifecycle-guided fallback hints; blueprint discoverability for created/draft.
// Phase 1.10: diagnostic-to-next-step continuity — fallback hints now name explicit destinations.

import * as vscode from 'vscode';
import { StateService } from '../services/stateService';
import { escapeHtml, capitalise } from '../utils/formatting';

// ── Lifecycle presentation helpers ────────────────────────────────────────────

/**
 * Return a CSS variable name for the lifecycle state accent colour.
 * Uses only VS Code semantic colour tokens — no hardcoded hex.
 */
function lifecycleColor(state: string): string {
  const s = state.toLowerCase();
  if (s === 'seasoned' || s === 'mature')             return 'var(--vscode-terminal-ansiGreen)';
  if (s === 'observing' || s === 'targeting')         return 'var(--vscode-terminal-ansiGreen)';
  if (s === 'developing' || s === 'active')           return 'var(--vscode-textLink-foreground)';
  if (s === 'researching')                            return 'var(--vscode-textLink-foreground)';
  if (s === 'draft')                                  return 'var(--vscode-editorWarning-foreground)';
  if (s === 'created' || s === 'new')                 return 'var(--vscode-editorWarning-foreground)';
  return 'var(--vscode-descriptionForeground)';
}

/**
 * Return a short operational next-step hint for a lifecycle state.
 * Used only as a fallback when the server does not supply nextValidAction.
 * Hints are intentionally brief — one actionable clause, no prose.
 */
function lifecycleFallbackHint(state: string): string {
  switch (state.toLowerCase()) {
    case 'created':     return 'Draft the project blueprint to define brand identity, surfaces, and keyword territory. Run VEDA: Open Project Blueprint Workflow from the command palette to open the blueprint spec.';
    case 'draft':       return 'Review and apply the project blueprint before beginning keyword research. Run VEDA: Open Project Blueprint Workflow from the command palette to open the blueprint spec.';
    case 'researching': return 'Define keyword targets from the discovery pool to begin SERP observation. Run VEDA: Keyword Diagnostic to inspect candidate queries, then add confirmed targets via the VEDA API or MCP tools.';
    case 'targeting':   return 'Begin SERP observation to collect snapshot and volatility data. Open SERP Observatory to check climate state, then use VEDA Brain to review structural gaps.';
    case 'developing':  return 'Content work is in progress. Open VEDA Brain to track structural gaps and coverage quality. Use Page Command Center to manage per-page content actions. Return to SERP Observatory to monitor climate shifts as content lands.';
    case 'observing':   return 'Open SERP Observatory to check active alerts and operator hints. Then review VEDA Brain diagnostics — use the ↗ icons to jump to Page Command Center for per-page action.';
    default:            return 'Open SERP Observatory for climate state and alerts. Open VEDA Brain for structural diagnostics and Page Command Center links.';
  }
}

/**
 * Return true for lifecycle states where blueprint work is the immediate priority.
 * Used to render a blueprint discoverability note in Project Context.
 */
function isBlueprintPhase(state: string): boolean {
  const s = state.toLowerCase();
  return s === 'created' || s === 'draft';
}

/**
 * Return a short display label for the lifecycle state.
 * Backend may return lowercase slugs; normalise to upper for badge display.
 */
function lifecycleLabel(state: string): string {
  return state.toUpperCase();
}

export class ProjectContextProvider implements vscode.WebviewViewProvider {
  public static readonly VIEW_ID = 'veda.projectContext';

  private _view?: vscode.WebviewView;
  private _stateDisposable: vscode.Disposable;

  constructor(private readonly state: StateService) {
    this._stateDisposable = state.onStateChange(() => this._render());
  }

  dispose(): void {
    this._stateDisposable.dispose();
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: false };
    this._render();
  }

  refresh(): void {
    this._render();
  }

  private _render(): void {
    if (!this._view) return;
    this._view.webview.html = this._buildHtml();
  }

  private _buildHtml(): string {
    const project = this.state.activeProject;
    const cfg = vscode.workspace.getConfiguration('veda');
    const envName = capitalise(cfg.get<string>('activeEnvironment') ?? 'local');
    const envKey  = (cfg.get<string>('activeEnvironment') ?? 'local');
    const envs    = cfg.get<Record<string, { baseUrl?: string }>>('environments') ?? {};
    const baseUrl = envs[envKey]?.baseUrl ?? null;

    const styles = `
<style>
  :root {
    --bg: var(--vscode-sideBar-background);
    --fg: var(--vscode-sideBar-foreground);
    --border: var(--vscode-panel-border);
    --muted: var(--vscode-descriptionForeground);
    --accent: var(--vscode-textLink-foreground);
    --warn: var(--vscode-editorWarning-foreground);
    --badge-bg: var(--vscode-badge-background);
    --badge-fg: var(--vscode-badge-foreground);
    --editor-bg: var(--vscode-editor-background);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family, sans-serif);
    font-size: var(--vscode-font-size, 12px);
    color: var(--fg);
    background: var(--bg);
    padding: 10px 12px;
    line-height: 1.5;
  }
  .env-pill {
    display: inline-block;
    font-size: 0.78em;
    padding: 1px 7px;
    border-radius: 10px;
    background: var(--badge-bg);
    color: var(--badge-fg);
    margin-bottom: 8px;
  }
  h2 {
    font-size: 0.82em; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.06em; color: var(--muted); margin-bottom: 6px;
  }
  .project-name { font-size: 1em; font-weight: 600; margin-bottom: 6px; }
  .lifecycle-badge {
    display: inline-block;
    font-size: 0.78em;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 3px;
    letter-spacing: 0.07em;
    border: 1px solid currentColor;
    margin-bottom: 6px;
  }
  .row { display: flex; justify-content: space-between; padding: 2px 0; font-size: 0.88em; }
  .row .lbl { color: var(--muted); }
  .row .val { font-weight: 500; }
  .divider { border: none; border-top: 1px solid var(--border); margin: 10px 0; }
  .next-action {
    background: var(--editor-bg);
    border: 1px solid var(--border);
    border-left: 3px solid var(--accent);
    border-radius: 3px;
    padding: 7px 10px;
    font-size: 0.84em;
    margin-top: 8px;
  }
  .next-action .label {
    color: var(--muted);
    font-size: 0.78em;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 3px;
  }
  .next-action .text { color: var(--fg); font-weight: 500; }
  .empty {
    color: var(--muted);
    font-size: 0.88em;
    text-align: center;
    padding: 24px 0;
  }
  .empty strong { display: block; margin-bottom: 4px; font-size: 1em; color: var(--fg); }
</style>`;

    if (!project) {
      const urlLine = baseUrl
        ? `<span style="display:block;margin-top:4px;font-size:0.78em;color:var(--muted)">${escapeHtml(baseUrl)}</span>`
        : `<span style="display:block;margin-top:4px;font-size:0.78em;color:var(--warn)">No base URL configured for this environment. Check Settings › veda.environments.</span>`;
      return `<!DOCTYPE html><html><head><meta charset="UTF-8">${styles}</head><body>
<div class="env-pill">ENV: ${escapeHtml(envName.toUpperCase())}</div>
${urlLine}
<div class="empty">
  <strong>No project selected</strong>
  <span>Run <em>VEDA: Select Project</em> from the command palette to choose an active project.</span>
  <span style="display:block;margin-top:8px;font-size:0.82em;color:var(--warn)">
    If no projects exist yet, run <em>VEDA: Open Project Setup Workflow</em> from the command palette to create one, then run <em>VEDA: Open Project Blueprint Workflow</em> to draft the blueprint.
  </span>
</div>
</body></html>`;
    }

    // ── Lifecycle badge (prominent, colour-coded) ─────────────────────────
    const lifecycleBadge = project.lifecycleState
      ? `<div class="lifecycle-badge" style="color:${lifecycleColor(project.lifecycleState)}">${escapeHtml(lifecycleLabel(project.lifecycleState))}</div>`
      : '';

    // ── Supporting rows ───────────────────────────────────────────────────
    const domainRow = project.domain
      ? `<div class="row"><span class="lbl">Domain</span><span class="val">${escapeHtml(project.domain)}</span></div>`
      : '';

    const maturityRow = project.maturitySummary
      ? `<div class="row"><span class="lbl">Maturity</span><span class="val">${escapeHtml(project.maturitySummary)}</span></div>`
      : '';

    // ── Next valid action — server-provided or lifecycle fallback ────────
    //
    // If the server supplies nextValidAction, render it verbatim (existing behaviour).
    // If absent, derive a short hint from the lifecycle state so the panel is never
    // silent about what the operator should do next.
    const actionText  = project.nextValidAction?.trim() || '';
    const actionLabel = project.nextValidAction?.trim() ? 'Next Action' : 'Next Step';
    const actionBody  = actionText || (project.lifecycleState ? lifecycleFallbackHint(project.lifecycleState) : '');

    const nextActionBlock = actionBody
      ? `<div class="next-action">
           <div class="label">${actionLabel}</div>
           <div class="text">${escapeHtml(actionBody)}</div>
         </div>`
      : '';

    // ── Blueprint discoverability note (created / draft only) ────────────
    //
    // Shown only when the server supplies nextValidAction — in that case the
    // fallback hint is not rendered, so the blueprint command pointer would
    // otherwise be absent. When the fallback hint is active it already names
    // the command directly, so the note would duplicate it.
    const blueprintNote = project.lifecycleState && isBlueprintPhase(project.lifecycleState) && !!actionText
      ? `<div style="margin-top:8px;font-size:0.8em;color:var(--muted);border-top:1px solid var(--border);padding-top:7px">
           <span style="color:var(--warn);font-weight:600">Blueprint</span>
           &nbsp;— foundational workflow for this stage. Run
           <em>VEDA: Open Project Blueprint Workflow</em> from the command palette
           to open the blueprint spec in the editor.
         </div>`
      : '';

    const envUrlLine = baseUrl
      ? `<div style="font-size:0.75em;color:var(--muted);margin-bottom:8px">${escapeHtml(baseUrl)}</div>`
      : `<div style="font-size:0.75em;color:var(--warn);margin-bottom:8px">No base URL configured — check Settings › veda.environments.</div>`;

    return `<!DOCTYPE html><html><head><meta charset="UTF-8">${styles}</head><body>
<div class="env-pill">ENV: ${escapeHtml(envName.toUpperCase())}</div>
${envUrlLine}
<h2>Active Project</h2>
<div class="project-name">${escapeHtml(project.name)}</div>
${lifecycleBadge}
<hr class="divider">
${domainRow}
${maturityRow}
${nextActionBlock}
${blueprintNote}
</body></html>`;
  }
}
