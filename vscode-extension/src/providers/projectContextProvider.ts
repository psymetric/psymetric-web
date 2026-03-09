// ─── providers/projectContextProvider.ts ────────────────────────────────────
//
// Sidebar webview provider. Displays active project context: name, domain,
// lifecycle state, maturity summary, next valid action.

import * as vscode from 'vscode';
import { StateService } from '../services/stateService';
import { escapeHtml, capitalise } from '../utils/formatting';

export class ProjectContextProvider implements vscode.WebviewViewProvider {
  public static readonly VIEW_ID = 'veda.projectContext';

  private _view?: vscode.WebviewView;
  private _stateDisposable: vscode.Disposable;

  constructor(private readonly state: StateService) {
    // Register the state listener once here, not inside resolveWebviewView.
    // resolveWebviewView can be called multiple times (e.g. panel hide/show)
    // and registering there would accumulate duplicate listeners.
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
  h2 { font-size: 0.82em; font-weight: 600; text-transform: uppercase;
       letter-spacing: 0.06em; color: var(--muted); margin-bottom: 6px; }
  .project-name { font-size: 1em; font-weight: 600; margin-bottom: 2px; }
  .row { display: flex; justify-content: space-between; padding: 2px 0; font-size: 0.88em; }
  .row .lbl { color: var(--muted); }
  .row .val { font-weight: 500; }
  .divider { border: none; border-top: 1px solid var(--border); margin: 10px 0; }
  .next-action {
    background: var(--vscode-editor-background);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 8px 10px;
    font-size: 0.85em;
    margin-top: 4px;
  }
  .next-action .label { color: var(--muted); font-size: 0.8em; margin-bottom: 3px; }
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

    const lifecycleRow = project.lifecycleState
      ? `<div class="row"><span class="lbl">Lifecycle</span><span class="val">${escapeHtml(capitalise(project.lifecycleState))}</span></div>`
      : '';

    const domainRow = project.domain
      ? `<div class="row"><span class="lbl">Domain</span><span class="val">${escapeHtml(project.domain)}</span></div>`
      : '';

    const maturityRow = project.maturitySummary
      ? `<div class="row"><span class="lbl">Maturity</span><span class="val">${escapeHtml(project.maturitySummary)}</span></div>`
      : '';

    const nextAction = project.nextValidAction
      ? `<div class="next-action"><div class="label">Next Action</div>${escapeHtml(project.nextValidAction)}</div>`
      : '';

    return `<!DOCTYPE html><html><head><meta charset="UTF-8">${styles}</head><body>
<div class="env-pill">ENV: ${escapeHtml(envName.toUpperCase())}</div>
<h2>Active Project</h2>
<div class="project-name">${escapeHtml(project.name)}</div>
<hr class="divider">
${domainRow}
${lifecycleRow}
${maturityRow}
${nextAction}
</body></html>`;
  }
}
