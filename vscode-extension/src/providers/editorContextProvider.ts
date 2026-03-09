// ─── providers/editorContextProvider.ts ──────────────────────────────────────
//
// Read-only WebviewViewProvider for the Editor Context sidebar view.
// Listens to VS Code active editor change events and renders lightweight
// file classification context for the currently open file.
//
// No backend calls. No polling. No mutations.
// Phase 1.9: editor context foundation.

import * as vscode from 'vscode';
import { escapeHtml } from '../utils/formatting';
import { deriveFileContext, FileContext } from '../utils/pageHeuristics';

export class EditorContextProvider implements vscode.WebviewViewProvider {
  public static readonly VIEW_ID = 'veda.editorContext';

  private _view?: vscode.WebviewView;
  private _editorDisposable: vscode.Disposable;

  constructor(context: vscode.ExtensionContext) {
    // Listen for active editor changes and re-render.
    this._editorDisposable = vscode.window.onDidChangeActiveTextEditor(() => {
      this._render();
    }, null, context.subscriptions);
  }

  dispose(): void {
    this._editorDisposable.dispose();
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

  /** Force a re-render — useful when called from the refresh command. */
  refresh(): void {
    this._render();
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  private _render(): void {
    if (!this._view) return;
    this._view.webview.html = this._buildHtml();
  }

  private _buildHtml(): string {
    const editor = vscode.window.activeTextEditor;

    const styles = `
<style>
  :root {
    --bg: var(--vscode-sideBar-background);
    --fg: var(--vscode-sideBar-foreground);
    --border: var(--vscode-panel-border);
    --muted: var(--vscode-descriptionForeground);
    --accent: var(--vscode-textLink-foreground);
    --badge-bg: var(--vscode-badge-background);
    --badge-fg: var(--vscode-badge-foreground);
    --editor-bg: var(--vscode-editor-background);
    --warn: var(--vscode-editorWarning-foreground);
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
  h2 {
    font-size: 0.82em; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.06em; color: var(--muted); margin-bottom: 6px;
  }
  .file-name {
    font-size: 1em; font-weight: 600; margin-bottom: 2px;
    word-break: break-all;
  }
  .path {
    font-size: 0.82em; color: var(--muted);
    margin-bottom: 8px; word-break: break-all;
  }
  .divider { border: none; border-top: 1px solid var(--border); margin: 8px 0; }
  .row { display: flex; justify-content: space-between; padding: 2px 0; font-size: 0.88em; gap: 8px; }
  .row .lbl { color: var(--muted); white-space: nowrap; }
  .row .val { font-weight: 500; text-align: right; word-break: break-all; }
  .relevance-badge {
    display: inline-block;
    font-size: 0.78em; font-weight: 600;
    padding: 1px 7px; border-radius: 3px;
    margin-bottom: 6px;
    background: var(--badge-bg); color: var(--badge-fg);
  }
  .relevance-badge.page  { background: var(--accent); color: var(--editor-bg); }
  .relevance-badge.layout { background: var(--accent); color: var(--editor-bg); opacity: 0.85; }
  .route-hint {
    background: var(--editor-bg);
    border: 1px solid var(--border);
    border-left: 3px solid var(--accent);
    border-radius: 3px;
    padding: 6px 9px;
    font-size: 0.84em;
    margin-top: 8px;
    font-family: var(--vscode-editor-font-family, monospace);
    word-break: break-all;
  }
  .route-hint .label {
    color: var(--muted);
    font-size: 0.78em;
    font-family: var(--vscode-font-family, sans-serif);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 2px;
  }
  .empty {
    color: var(--muted); font-size: 0.88em;
    text-align: center; padding: 24px 0;
  }
  .empty strong { display: block; margin-bottom: 4px; font-size: 1em; color: var(--fg); }
</style>`;

    // ── No active editor ──────────────────────────────────────────────────
    if (!editor) {
      return `<!DOCTYPE html><html><head><meta charset="UTF-8">${styles}</head><body>
<div class="empty"><strong>No active editor</strong>Open a file to see its context.</div>
</body></html>`;
    }

    const uri = editor.document.uri;

    // ── Untitled / non-file scheme ────────────────────────────────────────
    if (uri.scheme !== 'file') {
      return `<!DOCTYPE html><html><head><meta charset="UTF-8">${styles}</head><body>
<div class="empty"><strong>No workspace file selected</strong>This buffer is not a workspace file.</div>
</body></html>`;
    }

    const ctx: FileContext = deriveFileContext(
      uri.fsPath,
      vscode.workspace.workspaceFolders
    );

    // ── Non-page file — minimal display ───────────────────────────────────
    if (ctx.relevance === 'non-page') {
      const pathLine = ctx.workspacePath
        ? `<div class="path">${escapeHtml(ctx.workspacePath)}</div>`
        : '';
      return `<!DOCTYPE html><html><head><meta charset="UTF-8">${styles}</head><body>
<h2>Editor Context</h2>
<div class="file-name">${escapeHtml(ctx.fileName)}</div>
${pathLine}
<span class="relevance-badge">${escapeHtml(ctx.relevanceLabel)}</span>
</body></html>`;
    }

    // ── Page-relevant file — full display ─────────────────────────────────
    const badgeClass = ctx.relevance === 'route-page' ? 'page'
      : ctx.relevance === 'layout' ? 'layout'
      : '';

    const pathLine = ctx.workspacePath
      ? `<div class="path">${escapeHtml(ctx.workspacePath)}</div>`
      : '';

    const routeBlock = ctx.routeHint
      ? `<div class="route-hint">
           <div class="label">Route hint</div>
           ${escapeHtml(ctx.routeHint)}
         </div>`
      : '';

    return `<!DOCTYPE html><html><head><meta charset="UTF-8">${styles}</head><body>
<h2>Editor Context</h2>
<div class="file-name">${escapeHtml(ctx.fileName)}</div>
${pathLine}
<span class="relevance-badge ${badgeClass}">${escapeHtml(ctx.relevanceLabel)}</span>
<hr class="divider">
<div class="row">
  <span class="lbl">Type</span>
  <span class="val">${escapeHtml(ctx.relevanceLabel)}</span>
</div>
${routeBlock}
</body></html>`;
  }
}
