// ─── providers/projectContextProvider.ts ────────────────────────────────────
//
// Sidebar webview provider. Displays active project context: name, domain,
// lifecycle state, maturity summary, next valid action.
// Phase 1.8: lifecycle badge with colour emphasis; nextValidAction prominently displayed.

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
  if (s === 'seasoned' || s === 'mature')    return 'var(--vscode-terminal-ansiGreen)';
  if (s === 'developing' || s === 'active')  return 'var(--vscode-textLink-foreground)';
  if (s === 'observing' || s === 'new')      return 'var(--vscode-editorWarning-foreground)';
  return 'var(--vscode-descriptionForeground)';
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
    const envName = capitalise(
      vscode.workspace.getConfiguration('veda').get<string>('activeEnvironment') ?? 'local'
    );

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
      return `<!DOCTYPE html><html><head><meta charset="UTF-8">${styles}</head><body>
<div class="env-pill">ENV: ${escapeHtml(envName.toUpperCase())}</div>
<div class="empty">
  <strong>No project selected</strong>
  Run <em>VEDA: Select Project</em> to begin.
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

    // ── Next valid action — rendered as a left-accented guidance block ────
    const nextActionBlock = project.nextValidAction
      ? `<div class="next-action">
           <div class="label">Next Action</div>
           <div class="text">${escapeHtml(project.nextValidAction)}</div>
         </div>`
      : '';

    return `<!DOCTYPE html><html><head><meta charset="UTF-8">${styles}</head><body>
<div class="env-pill">ENV: ${escapeHtml(envName.toUpperCase())}</div>
<h2>Active Project</h2>
<div class="project-name">${escapeHtml(project.name)}</div>
${lifecycleBadge}
<hr class="divider">
${domainRow}
${maturityRow}
${nextActionBlock}
</body></html>`;
  }
}
