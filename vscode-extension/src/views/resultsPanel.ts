// ─── views/resultsPanel.ts ───────────────────────────────────────────────────
//
// Reusable webview panel for structured observatory responses.
// Renders: project investigation packets, keyword diagnostic packets,
//          page context packets (Page Command Center).
// No React. Plain HTML/CSS rendered once per command.

import * as vscode from 'vscode';
import { StateService } from '../services/stateService';
import { escapeHtml, formatPercent, formatVolatility, capitalise } from '../utils/formatting';
import { FileContext } from '../utils/pageHeuristics';
import { RecentWorkflowEntry } from '../services/pageWorkflowMemory';
import { PageCommandCenterPacket } from '../types/pageCommandCenter';

// Suppress unused-import warning — capitalise is re-exported from this module
void capitalise;

// ── Metadata carried into every render ───────────────────────────────────────

interface RenderMeta {
  source: string;       // command label, e.g. "VEDA: Investigate Project"
  fetchedAt: string;    // ISO-like display timestamp, captured at call time
}

export class ResultsPanel {
  private static readonly VIEW_TYPE      = 'veda.results';
  private static readonly PAGE_VIEW_TYPE = 'veda.pageContext';

  // ── Separate panel for page context (scripts enabled for action buttons) ─
  private _pagePanel: vscode.WebviewPanel | null = null;
  /** Workspace-relative path (or absolute) of the file currently displayed. */
  private _pagePanelFilePath: string | null = null;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly state: StateService
  ) {}

  // ── Public API ────────────────────────────────────────────────────────────

  showInvestigation(title: string, data: unknown): void {
    const meta = this._captureMeta('VEDA: Investigate Project');
    const panel = this._getOrCreatePanel(title);
    this.state.setPanelProjectId(this.state.activeProject?.id ?? null);
    panel.webview.html = this._renderInvestigation(title, data, meta);
    panel.reveal();
  }

  showKeywordDiagnostic(
    title: string,
    data: unknown,
    source = 'VEDA: Keyword Diagnostic',
    pageOrigin?: FileContext
  ): void {
    const meta = this._captureMeta(source);
    const panel = this._getOrCreatePanel(title);
    this.state.setPanelProjectId(this.state.activeProject?.id ?? null);
    panel.webview.html = this._renderKeywordDiagnostic(title, data, meta, pageOrigin);
    panel.reveal();
  }

  /**
   * Render the Page Command Center panel.
   *
   * packet:
   *   - undefined  → no project selected; show reduced panel
   *   - null       → API fetch failed; show error state
   *   - PageCommandCenterPacket → render full backend packet
   *
   * isReplayed = true when context came from session memory rather than live
   * active editor.
   */
  showPageContext(
    title: string,
    ctx: FileContext,
    packet: PageCommandCenterPacket | null | undefined,
    recentEntries: RecentWorkflowEntry[] = [],
    isReplayed = false
  ): void {
    const meta = this._captureMeta(
      isReplayed
        ? 'VEDA: Replayed Page Context'
        : 'VEDA: Investigate Current Page Context'
    );
    const panel = this._getOrCreatePagePanel(title);
    this.state.setPanelProjectId(this.state.activeProject?.id ?? null);
    if (!isReplayed) {
      this._pagePanelFilePath = ctx.workspacePath ?? ctx.fileName;
    }
    panel.webview.html = this._renderPageContext(
      title, ctx, meta, packet, recentEntries, isReplayed
    );
    panel.reveal();
  }

  /**
   * Called by extension.ts when the active editor changes.
   * If the page panel is open and showing a different live file, replace with
   * a stale banner. Does NOT auto-refresh.
   */
  notifyEditorChanged(newFilePath: string | null): void {
    if (!this._pagePanel) return;
    if (this._pagePanelFilePath === null) return;

    const currentFile = this._pagePanelFilePath;
    if (newFilePath === currentFile) return;

    this._pagePanel.webview.html = this._renderPageContextStale(currentFile);
  }

  /**
   * Called when the active project changes. Replaces the open panel content
   * with a "project changed" notice.
   */
  notifyProjectChanged(): void {
    const panel = this.state.openPanel;
    if (!panel) return;

    const panelProjectId = this.state.panelProjectId;
    const currentProjectId = this.state.activeProject?.id ?? null;

    if (panelProjectId === null || panelProjectId === currentProjectId) return;

    const newProjectName = this.state.activeProject?.name ?? 'None';
    panel.webview.html = this._renderProjectChanged(newProjectName);
    this.state.setPanelProjectId(null);
  }

  // ── Panel lifecycle ───────────────────────────────────────────────────────

  /** Shared panel for investigation + keyword diagnostic (no scripts). */
  private _getOrCreatePanel(title: string): vscode.WebviewPanel {
    const existing = this.state.openPanel;
    if (existing) {
      existing.title = title;
      return existing;
    }

    const panel = vscode.window.createWebviewPanel(
      ResultsPanel.VIEW_TYPE,
      title,
      vscode.ViewColumn.Beside,
      {
        enableScripts: false,
        retainContextWhenHidden: true,
      }
    );

    panel.onDidDispose(() => {
      this.state.setOpenPanel(null);
      this.state.setPanelProjectId(null);
    });

    this.state.setOpenPanel(panel);
    return panel;
  }

  /**
   * Dedicated panel for Page Command Center (scripts enabled for action buttons).
   */
  private _getOrCreatePagePanel(title: string): vscode.WebviewPanel {
    if (this._pagePanel) {
      this._pagePanel.title = title;
      return this._pagePanel;
    }

    const panel = vscode.window.createWebviewPanel(
      ResultsPanel.PAGE_VIEW_TYPE,
      title,
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    panel.webview.onDidReceiveMessage(
      (msg: { command?: string; keywordTargetId?: string; query?: string; entry?: unknown }) => {
        if (msg.command === 'investigateProject') {
          vscode.commands.executeCommand('veda.investigateProject');
        } else if (msg.command === 'keywordDiagnostic') {
          vscode.commands.executeCommand('veda.keywordDiagnostic');
        } else if (msg.command === 'pageKeywordDiagnostic') {
          vscode.commands.executeCommand('veda.pageKeywordDiagnostic');
        } else if (msg.command === 'refreshPageContext') {
          vscode.commands.executeCommand('veda.investigateCurrentPage');
        } else if (
          (msg.command === 'riskKeywordDiagnostic' || msg.command === 'routeMatchDiagnostic')
          && msg.keywordTargetId
        ) {
          vscode.commands.executeCommand(
            'veda.riskKeywordFromPageContext',
            msg.keywordTargetId,
            msg.query ?? msg.keywordTargetId
          );
        } else if (msg.command === 'replayWorkflowEntry' && msg.entry) {
          vscode.commands.executeCommand('veda.replayWorkflowEntry', msg.entry);
        }
      },
      undefined,
      this.context.subscriptions
    );

    panel.onDidDispose(() => {
      this._pagePanel = null;
      this._pagePanelFilePath = null;
    });

    this._pagePanel = panel;
    return panel;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private _captureMeta(source: string): RenderMeta {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const fetchedAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} `
      + `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    return { source, fetchedAt };
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  /** Shared CSS + HTML shell used by investigation and keyword panels. */
  private _shell(title: string, meta: RenderMeta, body: string): string {
    const project = this.state.activeProject;
    const envName = (
      vscode.workspace.getConfiguration('veda').get<string>('activeEnvironment') ?? 'local'
    ).toUpperCase();

    const projectBadge = project
      ? `<span class="badge">${escapeHtml(project.name)}</span>`
      : `<span class="badge warn">No project selected</span>`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>
  :root {
    --bg: var(--vscode-editor-background);
    --fg: var(--vscode-editor-foreground);
    --border: var(--vscode-panel-border);
    --accent: var(--vscode-textLink-foreground);
    --warn: var(--vscode-editorWarning-foreground);
    --muted: var(--vscode-descriptionForeground);
    --section-bg: var(--vscode-sideBar-background);
    --badge-bg: var(--vscode-badge-background);
    --badge-fg: var(--vscode-badge-foreground);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family, sans-serif);
    font-size: var(--vscode-font-size, 13px);
    color: var(--fg);
    background: var(--bg);
    padding: 16px 20px;
    line-height: 1.5;
  }
  header {
    border-bottom: 1px solid var(--border);
    padding-bottom: 10px;
    margin-bottom: 16px;
  }
  header h1 { font-size: 1.1em; font-weight: 600; margin-bottom: 6px; }
  .meta {
    font-size: 0.82em;
    color: var(--muted);
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2px 10px;
  }
  .meta .lbl { color: var(--muted); }
  .meta .val { font-weight: 500; color: var(--fg); }
  .badge {
    display: inline-block;
    padding: 1px 7px;
    border-radius: 10px;
    background: var(--badge-bg);
    color: var(--badge-fg);
    font-size: 0.8em;
  }
  .badge.warn { background: var(--warn); color: var(--bg); }
  section {
    background: var(--section-bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 12px 14px;
    margin-bottom: 12px;
  }
  section h2 {
    font-size: 0.9em;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted);
    margin-bottom: 8px;
  }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 3px 0; vertical-align: top; }
  td.key { color: var(--muted); width: 45%; font-size: 0.88em; }
  td.val { font-weight: 500; }
  ul { list-style: none; padding: 0; }
  li { padding: 4px 0; border-bottom: 1px solid var(--border); font-size: 0.88em; }
  li:last-child { border-bottom: none; }
  .score-high { color: var(--vscode-editorError-foreground); }
  .score-mid  { color: var(--warn); }
  .score-low  { color: var(--vscode-terminal-ansiGreen); }
  .fallback-note {
    font-size: 0.8em;
    color: var(--warn);
    margin-bottom: 6px;
    font-style: italic;
  }
  pre {
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 0.82em;
    white-space: pre-wrap;
    word-break: break-all;
    background: var(--bg);
    border: 1px solid var(--border);
    padding: 8px;
    border-radius: 3px;
    margin-top: 6px;
    max-height: 200px;
    overflow-y: auto;
  }
</style>
</head>
<body>
<header>
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">
    <span class="lbl">Project</span>  <span class="val">${projectBadge}</span>
    <span class="lbl">Environment</span><span class="val">${escapeHtml(envName)}</span>
    <span class="lbl">Source</span>   <span class="val">${escapeHtml(meta.source)}</span>
    <span class="lbl">Fetched</span>  <span class="val">${escapeHtml(meta.fetchedAt)}</span>
  </div>
</header>
${body}
</body>
</html>`;
  }

  private _renderProjectChanged(newProjectName: string): string {
    const envName = (
      vscode.workspace.getConfiguration('veda').get<string>('activeEnvironment') ?? 'local'
    ).toUpperCase();

    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8">
<style>
  :root {
    --bg: var(--vscode-editor-background); --fg: var(--vscode-editor-foreground);
    --border: var(--vscode-panel-border); --muted: var(--vscode-descriptionForeground);
    --section-bg: var(--vscode-sideBar-background);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: var(--vscode-font-family, sans-serif); font-size: var(--vscode-font-size, 13px);
    color: var(--fg); background: var(--bg); padding: 40px 20px; text-align: center; }
  .notice { background: var(--section-bg); border: 1px solid var(--border); border-radius: 4px;
    padding: 24px; max-width: 400px; margin: 0 auto; }
  .notice h1 { font-size: 1em; font-weight: 600; margin-bottom: 8px; }
  .notice p { font-size: 0.88em; color: var(--muted); margin-bottom: 4px; }
  .project-name { font-weight: 600; color: var(--fg); }
</style></head>
<body>
<div class="notice">
  <h1>Project Changed</h1>
  <p>Active project is now:</p>
  <p class="project-name">${escapeHtml(newProjectName)}</p>
  <p style="margin-top:12px">Run a new command to load fresh results.</p>
  <p style="margin-top:4px; font-size:0.8em">${escapeHtml(envName)}</p>
</div>
</body></html>`;
  }

  private _renderPageContextStale(previousFile: string): string {
    const displayFile = previousFile.replace(/\\/g, '/').split('/').pop() ?? previousFile;

    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8">
<style>
  :root {
    --bg: var(--vscode-editor-background); --fg: var(--vscode-editor-foreground);
    --border: var(--vscode-panel-border); --warn: var(--vscode-editorWarning-foreground);
    --muted: var(--vscode-descriptionForeground); --section-bg: var(--vscode-sideBar-background);
    --accent: var(--vscode-textLink-foreground);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: var(--vscode-font-family, sans-serif); font-size: var(--vscode-font-size, 13px);
    color: var(--fg); background: var(--bg); padding: 40px 20px; }
  .banner { background: var(--section-bg); border: 1px solid var(--warn);
    border-left: 4px solid var(--warn); border-radius: 4px; padding: 20px;
    max-width: 440px; margin: 0 auto; }
  .banner h1 { font-size: 1em; font-weight: 600; color: var(--warn); margin-bottom: 8px; }
  .banner p { font-size: 0.88em; color: var(--muted); margin-bottom: 12px; }
  .banner code { font-family: var(--vscode-editor-font-family, monospace); font-size: 0.85em; color: var(--fg); }
  .refresh-btn { display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px;
    background: var(--vscode-button-background, var(--accent));
    color: var(--vscode-button-foreground, var(--bg)); border: none; border-radius: 3px;
    font-family: var(--vscode-font-family, sans-serif); font-size: 0.88em; font-weight: 600; cursor: pointer; }
  .refresh-btn:hover { opacity: 0.9; }
</style></head>
<body>
<div class="banner">
  <h1>Active editor changed</h1>
  <p>This panel was showing context for <code>${escapeHtml(displayFile)}</code>.<br>
     Refresh page context to inspect the current file.</p>
  <button class="refresh-btn" onclick="vscode.postMessage({command:'refreshPageContext'})">
    Refresh Page Context
  </button>
</div>
<script>const vscode = acquireVsCodeApi();</script>
</body></html>`;
  }

  // ── Page Command Center ───────────────────────────────────────────────────

  private _renderPageContext(
    title: string,
    ctx: FileContext,
    meta: RenderMeta,
    packet: PageCommandCenterPacket | null | undefined,
    recentEntries: RecentWorkflowEntry[] = [],
    isReplayed = false
  ): string {
    const isPageRelevant = ctx.relevance !== 'non-page';
    const project = this.state.activeProject;

    // ── Summary block ─────────────────────────────────────────────────────
    const summaryLines: string[] = [];

    if (isReplayed) {
      summaryLines.push(`<li class="sum-line sum-replay">Viewing replayed page context.</li>`);
    }

    summaryLines.push(
      isPageRelevant
        ? `<li class="sum-line sum-ok">Current file is page-relevant.</li>`
        : `<li class="sum-line sum-muted">Current file is not a page file.</li>`
    );

    if (!project) {
      summaryLines.push(`<li class="sum-line sum-muted">No project selected. Observatory signals unavailable.</li>`);
    } else if (packet === null) {
      summaryLines.push(`<li class="sum-line sum-warn">Failed to load Page Command Center data.</li>`);
    } else if (packet !== undefined) {
      const obs = packet.observatorySummary;
      summaryLines.push(`<li class="sum-line sum-ok">Project: ${escapeHtml(packet.projectContext.projectName)}.</li>`);

      if (obs.topRiskKeywordCount > 0) {
        summaryLines.push(`<li class="sum-line sum-ok">Project risk keywords available (${obs.topRiskKeywordCount}).</li>`);
      } else {
        summaryLines.push(`<li class="sum-line sum-muted">No volatile keywords detected for this project.</li>`);
      }

      if (obs.routeTextOverlapCount > 0) {
        summaryLines.push(`<li class="sum-line sum-ok">${obs.routeTextOverlapCount} route-text keyword overlap${obs.routeTextOverlapCount !== 1 ? 's' : ''} found.</li>`);
      } else {
        summaryLines.push(`<li class="sum-line sum-muted">No route-text keyword overlaps detected.</li>`);
      }
    }

    if (recentEntries.length > 0) {
      summaryLines.push(`<li class="sum-line sum-ok">Recent workflow available (${recentEntries.length} entr${recentEntries.length !== 1 ? 'ies' : 'y'}).</li>`);
    } else {
      summaryLines.push(`<li class="sum-line sum-muted">No recent page workflow yet.</li>`);
    }

    const summaryBlock = `
<div class="pcc-header">
  <div class="pcc-title-row">
    <span class="pcc-title">Page Command Center</span>
    ${isReplayed ? '<span class="pcc-replay-badge">Replayed from recent workflow</span>' : ''}
  </div>
  <ul class="sum-list">${summaryLines.join('\n')}</ul>
</div>`;

    // ── Editor File section ───────────────────────────────────────────────
    const fileRows = [
      `<tr><td class="key">File</td><td class="val">${escapeHtml(ctx.fileName)}</td></tr>`,
      ctx.workspacePath
        ? `<tr><td class="key">Path</td><td class="val">${escapeHtml(ctx.workspacePath)}</td></tr>`
        : '',
      `<tr><td class="key">Type</td><td class="val">${escapeHtml(ctx.relevanceLabel)}</td></tr>`,
      ctx.routeHint
        ? `<tr><td class="key">Route hint</td><td class="val"><code>${escapeHtml(ctx.routeHint)}</code></td></tr>`
        : '',
    ].join('');
    const fileSection = _collapsible('Editor File', `<table>${fileRows}</table>`, false);

    // ── Page Context Status section ───────────────────────────────────────
    const statusNote = isPageRelevant
      ? `<p class="section-note">This is the current editor context sent to the observatory.</p>`
      : `<p class="section-note">This file is not page-relevant. Open a <code>page.tsx</code>, <code>layout.tsx</code>, or <code>route.ts</code> file under <code>src/app/</code> to see page context.</p>`;
    const statusSection = _collapsible(
      isPageRelevant ? 'Page Context Status' : 'Not a Page File',
      statusNote,
      !isPageRelevant
    );

    // ── API error state ───────────────────────────────────────────────────
    if (packet === null) {
      const errorSection = `<div class="error-banner"><p>Failed to load Page Command Center data.</p><p class="section-note" style="margin-top:4px">Check the backend connection and try again.</p></div>`;
      const actionsStrip = _buildActionsStrip([]);
      const body = _pageStyles() + summaryBlock + fileSection + statusSection + errorSection + actionsStrip;
      return this._shell(title, meta, body);
    }

    // ── No project ────────────────────────────────────────────────────────
    if (packet === undefined) {
      const noProjectSection = `<p class="section-note" style="padding:8px 0">Select a project to view observatory signals.</p>`;
      const actionsStrip = _buildActionsStrip([]);
      const body = _pageStyles() + summaryBlock + fileSection + statusSection + noProjectSection + actionsStrip;
      return this._shell(title, meta, body);
    }

    // ── Project Top Risk Keywords section ─────────────────────────────────
    let riskBody = '';
    if (packet.topRiskKeywords.length === 0) {
      riskBody = `<p class="section-note">No volatile keywords detected for this project.</p>`;
    } else {
      const kwItems = packet.topRiskKeywords.map(kw => {
        const score = kw.volatilityScore ?? 0;
        const cls   = score >= 70 ? 'risk-kw--high' : score >= 40 ? 'risk-kw--mid' : 'risk-kw--low';
        const scoreLabel = `${score.toFixed(0)} · ${kw.regime ?? ''}${kw.maturity ? ' · ' + kw.maturity : ''}`;
        const payload = JSON.stringify({ command: 'riskKeywordDiagnostic', keywordTargetId: kw.keywordTargetId, query: kw.query });
        return `<li><button class="kw-btn ${cls}" onclick="vscode.postMessage(${escapeHtml(payload)})">
          <span class="kw-query">${escapeHtml(kw.query)}</span>
          <span class="kw-score">${escapeHtml(scoreLabel)}</span>
        </button></li>`;
      }).join('');
      riskBody = `<p class="section-note" style="margin-bottom:8px">Click to run a keyword diagnostic.</p><ul class="kw-list">${kwItems}</ul>`;
    }
    const riskSection = _collapsible('Project Top Risk Keywords', riskBody, false);

    // ── Route-text keyword matches section ────────────────────────────────
    let routeBody = '';
    if (packet.routeTextKeywordMatches.length === 0) {
      routeBody = `<p class="section-note">No route-text keyword overlaps detected.</p>
        <p class="section-caption">Heuristic text overlap with route or filename. No page analysis performed.</p>`;
    } else {
      const rmItems = packet.routeTextKeywordMatches.map(kw => {
        const payload = JSON.stringify({ command: 'routeMatchDiagnostic', keywordTargetId: kw.keywordTargetId, query: kw.query });
        return `<li><button class="kw-btn" onclick="vscode.postMessage(${escapeHtml(payload)})">
          <span class="kw-query">${escapeHtml(kw.query)}</span>
        </button></li>`;
      }).join('');
      routeBody = `<p class="section-caption" style="margin-bottom:8px">Heuristic text overlap with route or filename. No page analysis performed.</p>
        <ul class="kw-list">${rmItems}</ul>`;
    }
    const routeMatchSection = _collapsible('Possible Route-Text Keyword Matches', routeBody, false);

    // ── Honesty notes ─────────────────────────────────────────────────────
    let notesBody = '';
    if (packet.notes && packet.notes.length > 0) {
      notesBody = `<ul class="notes-list">${packet.notes.map(n => `<li>${escapeHtml(n)}</li>`).join('')}</ul>`;
    }
    const notesSection = notesBody
      ? _collapsible('Observatory Notes', notesBody, true)
      : '';

    // ── Recent Page Activity section ──────────────────────────────────────
    let recentBody = '';
    if (recentEntries.length === 0) {
      recentBody = `<p class="section-note">No recent page workflow yet.</p>`;
    } else {
      const recentItems = recentEntries.slice(0, 3).map(entry => {
        const routeLabel = escapeHtml(entry.routeHint ?? entry.fileName);
        const desc = entry.keywordQuery
          ? `→ ${escapeHtml(entry.keywordQuery)}`
          : '→ page context';
        const payload = JSON.stringify({ command: 'replayWorkflowEntry', entry });
        return `<li><button class="kw-btn" onclick="vscode.postMessage(${escapeHtml(payload)})">
          <span class="kw-query">${routeLabel}</span>
          <span class="kw-score">${desc}</span>
        </button></li>`;
      }).join('');
      recentBody = `<ul class="kw-list">${recentItems}</ul>`;
    }
    const recentSection = _collapsible('Recent Page Activity', recentBody, false);

    // ── Available Observatory Actions strip ───────────────────────────────
    const actionsStrip = _buildActionsStrip(packet.availableActions);

    const body = _pageStyles()
      + summaryBlock
      + fileSection
      + statusSection
      + riskSection
      + routeMatchSection
      + notesSection
      + recentSection
      + actionsStrip;

    return this._shell(title, meta, body);
  }

  private _renderInvestigation(title: string, raw: unknown, meta: RenderMeta): string {
    const data = raw as Record<string, unknown>;
    const summary = data.summary as Record<string, unknown> | undefined;
    const alerts  = data.alerts  as Record<string, unknown> | undefined;
    const risk    = data.risk    as Record<string, unknown> | undefined;

    let summaryHtml = '';
    if (summary) {
      const s = (summary as { data?: Record<string, unknown> }).data ?? summary;
      summaryHtml = `
<section>
  <h2>Project Volatility</h2>
  <table>
    <tr><td class="key">Keyword Count</td><td class="val">${s['keywordCount'] ?? '—'}</td></tr>
    <tr><td class="key">Active Keywords</td><td class="val">${s['activeKeywordCount'] ?? '—'}</td></tr>
    <tr><td class="key">Weighted Volatility</td><td class="val">${typeof s['weightedProjectVolatilityScore'] === 'number' ? (s['weightedProjectVolatilityScore'] as number).toFixed(2) : '—'}</td></tr>
    <tr><td class="key">Alert Keywords</td><td class="val">${s['alertKeywordCount'] ?? '—'}</td></tr>
  </table>
</section>`;
    }

    let riskHtml = '';
    if (risk) {
      const r = (risk as { data?: Record<string, unknown> }).data ?? risk;
      const buckets = r['buckets'] as Array<Record<string, number | null>> | undefined;
      const last = buckets ? [...buckets].reverse().find(b => b['rankShare'] !== null) : null;
      if (last) {
        riskHtml = `
<section>
  <h2>Risk Attribution</h2>
  <table>
    <tr><td class="key">Rank Volatility</td><td class="val">${formatPercent(last['rankShare'] as number | null)}</td></tr>
    <tr><td class="key">AI Overview</td><td class="val">${formatPercent(last['aiShare'] as number | null)}</td></tr>
    <tr><td class="key">Feature Volatility</td><td class="val">${formatPercent(last['featureShare'] as number | null)}</td></tr>
  </table>
</section>`;
      }
    }

    let alertsHtml = '';
    if (alerts) {
      const a = (alerts as { data?: Record<string, unknown> }).data ?? alerts;
      const items = a['items'] as Array<Record<string, unknown>> | undefined ?? [];
      const isFallback = items.length > 0 && items[0]['source'] === 'fallback';

      const listItems = items.slice(0, 10).map(item => {
        const score = item['volatilityScore'] as number ?? 0;
        const cls = score >= 70 ? 'score-high' : score >= 40 ? 'score-mid' : 'score-low';
        const regime = item['volatilityRegime'] as string ?? item['regime'] as string ?? '';
        const maturity = item['maturity'] ? ` · ${item['maturity']}` : '';
        return `<li>
          <span class="${cls}">${formatVolatility(score, regime)}</span>
          &nbsp;${escapeHtml(item['query'] as string ?? '')}${escapeHtml(maturity)}
        </li>`;
      }).join('');

      alertsHtml = `
<section>
  <h2>Top Volatile Keywords</h2>
  ${isFallback ? '<p class="fallback-note">⚠ Showing preliminary-maturity keywords (developing-maturity alerts not yet available)</p>' : ''}
  ${items.length === 0 ? '<p style="color:var(--muted);font-size:0.88em">No alerts at current maturity threshold.</p>' : `<ul>${listItems}</ul>`}
</section>`;
    }

    const reasoning = data.reasoning as Record<string, unknown> | undefined;
    let reasoningHtml = '';
    if (reasoning) {
      const r = (reasoning as { data?: Record<string, unknown> }).data ?? reasoning;
      const hyps = r['hypotheses'] as Array<Record<string, unknown>> | undefined ?? [];
      const hypList = hyps.map(h =>
        `<li><strong>${escapeHtml(String(h['type'] ?? ''))}</strong> — confidence ${((h['confidence'] as number ?? 0) * 100).toFixed(0)}% &mdash; ${escapeHtml(String(h['explanation'] ?? ''))}</li>`
      ).join('');

      reasoningHtml = `
<section>
  <h2>Operator Reasoning</h2>
  ${hyps.length > 0 ? `<ul>${hypList}</ul>` : '<p style="color:var(--muted);font-size:0.88em">No hypotheses available.</p>'}
</section>`;
    }

    return this._shell(title, meta, summaryHtml + riskHtml + alertsHtml + reasoningHtml);
  }

  private _renderKeywordDiagnostic(
    title: string,
    raw: unknown,
    meta: RenderMeta,
    pageOrigin?: FileContext
  ): string {
    const data = raw as Record<string, unknown>;
    const inner = (data['data'] as Record<string, unknown>) ?? data;

    const query = inner['query'] as string ?? '—';
    const vol   = inner['volatility'] as Record<string, unknown> | undefined;
    const cls   = inner['classification'] as Record<string, unknown> | undefined;
    const timeline = inner['timeline'] as Array<Record<string, unknown>> | undefined;
    const intentDrift = inner['intentDrift'] as Record<string, unknown> | undefined;

    const volHtml = vol ? `
<section>
  <h2>Volatility</h2>
  <table>
    <tr><td class="key">Score</td><td class="val">${formatVolatility(vol['score'] as number ?? 0, vol['regime'] as string ?? '')}</td></tr>
    <tr><td class="key">Maturity</td><td class="val">${escapeHtml(String(vol['maturity'] ?? '—'))}</td></tr>
    <tr><td class="key">Sample Size</td><td class="val">${vol['sampleSize'] ?? '—'}</td></tr>
    <tr><td class="key">Rank Component</td><td class="val">${((vol['components'] as Record<string, unknown>)?.['rank'] as number)?.toFixed(1) ?? '—'}</td></tr>
    <tr><td class="key">AI Overview Component</td><td class="val">${((vol['components'] as Record<string, unknown>)?.['aiOverview'] as number)?.toFixed(1) ?? '—'}</td></tr>
    <tr><td class="key">Feature Component</td><td class="val">${((vol['components'] as Record<string, unknown>)?.['feature'] as number)?.toFixed(1) ?? '—'}</td></tr>
  </table>
</section>` : '';

    const clsHtml = cls ? `
<section>
  <h2>Classification</h2>
  <table>
    <tr><td class="key">Classification</td><td class="val">${escapeHtml(String(cls['classification'] ?? '—'))}</td></tr>
    <tr><td class="key">Confidence</td><td class="val">${cls['confidence'] ?? '—'}</td></tr>
  </table>
</section>` : '';

    const tlHtml = timeline && timeline.length > 0 ? `
<section>
  <h2>Event Timeline</h2>
  <ul>
    ${timeline.map(e => `<li>${escapeHtml(String(e['capturedAt'] ?? '')).slice(0, 19).replace('T', ' ')} — <strong>${escapeHtml(String(e['event'] ?? ''))}</strong> (confidence ${e['confidence'] ?? '—'})</li>`).join('')}
  </ul>
</section>` : '';

    const driftHtml = intentDrift ? (() => {
      const transitions = intentDrift['transitions'] as Array<Record<string, unknown>> | undefined ?? [];
      if (transitions.length === 0) return '';
      return `
<section>
  <h2>Intent Drift</h2>
  <ul>
    ${transitions.map(t => `<li>${escapeHtml(String(t['capturedAt'] ?? '')).slice(0, 19).replace('T', ' ')} — ${escapeHtml(String(t['fromDominant'] ?? ''))} → ${escapeHtml(String(t['toDominant'] ?? ''))}</li>`).join('')}
  </ul>
</section>`;
    })() : '';

    const originHtml = pageOrigin ? `
<section style="border-left: 3px solid var(--accent); padding-left: 11px;">
  <h2>Opened from Page Context</h2>
  <table>
    <tr><td class="key">File</td><td class="val">${escapeHtml(pageOrigin.fileName)}</td></tr>
    ${pageOrigin.workspacePath ? `<tr><td class="key">Path</td><td class="val">${escapeHtml(pageOrigin.workspacePath)}</td></tr>` : ''}
    ${pageOrigin.routeHint ? `<tr><td class="key">Route hint</td><td class="val"><code>${escapeHtml(pageOrigin.routeHint)}</code></td></tr>` : ''}
  </table>
  <p style="font-size:0.8em;color:var(--muted);margin-top:6px">Context only — no page analysis has been performed.</p>
</section>` : '';

    const body = originHtml + `
<section>
  <h2>Keyword</h2>
  <table>
    <tr><td class="key">Query</td><td class="val">${escapeHtml(query)}</td></tr>
    <tr><td class="key">Locale</td><td class="val">${escapeHtml(String(inner['locale'] ?? '—'))}</td></tr>
    <tr><td class="key">Device</td><td class="val">${escapeHtml(String(inner['device'] ?? '—'))}</td></tr>
    <tr><td class="key">Snapshots</td><td class="val">${inner['snapshotCount'] ?? '—'}</td></tr>
  </table>
</section>
${volHtml}${clsHtml}${tlHtml}${driftHtml}`;

    return this._shell(title, meta, body);
  }
}

// ── Module-level helpers ──────────────────────────────────────────────────────

function _collapsible(heading: string, bodyHtml: string, startClosed: boolean): string {
  const open = startClosed ? '' : ' open';
  return `<details${open}>
  <summary>${escapeHtml(heading)}</summary>
  <div class="section-body">${bodyHtml}</div>
</details>`;
}

/**
 * Build the Available Observatory Actions strip from backend-provided actions.
 * Falls back to a static set of refresh-only buttons when actions array is empty.
 */
function _buildActionsStrip(actions: { action: string; label: string }[]): string {
  // Map backend action identifiers to VS Code command messages
  const ACTION_COMMAND_MAP: Record<string, string> = {
    'project_investigation':  'investigateProject',
    'keyword_diagnostic':     'keywordDiagnostic',
    'page_keyword_diagnostic': 'pageKeywordDiagnostic',
  };

  let actionButtons = actions.map((a, i) => {
    const command = ACTION_COMMAND_MAP[a.action] ?? a.action;
    const isPrimary = i === actions.length - 1;
    const cls = isPrimary ? 'action-btn action-btn--primary' : 'action-btn';
    return `<button class="${cls}" onclick="vscode.postMessage({command:'${escapeHtml(command)}'})">
      ${escapeHtml(a.label)}
    </button>`;
  }).join('');

  // Always append Refresh Page Context
  actionButtons += `<button class="action-btn action-btn--refresh" onclick="vscode.postMessage({command:'refreshPageContext'})">
    Refresh Page Context
  </button>`;

  return `
<section class="actions-strip">
  <h2>Available Observatory Actions</h2>
  <div class="action-list">${actionButtons}</div>
</section>
<script>const vscode = acquireVsCodeApi();</script>`;
}

function _pageStyles(): string {
  return `
<style>
  /* ── Page Command Center header block ─────────────────────────── */
  .pcc-header {
    background: var(--vscode-editor-inactiveSelectionBackground, var(--section-bg));
    border: 1px solid var(--border);
    border-left: 3px solid var(--accent);
    border-radius: 4px;
    padding: 12px 14px;
    margin-bottom: 16px;
  }
  .pcc-title-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
  }
  .pcc-title {
    font-size: 0.85em;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--accent);
  }
  .pcc-replay-badge {
    font-size: 0.75em;
    padding: 1px 7px;
    border-radius: 10px;
    background: var(--warn);
    color: var(--bg);
    font-weight: 600;
  }
  .sum-list { list-style: none; padding: 0; margin: 0; }
  .sum-line { font-size: 0.85em; padding: 1px 0; }
  .sum-ok    { color: var(--fg); }
  .sum-muted { color: var(--muted); }
  .sum-warn  { color: var(--warn); }
  .sum-replay { color: var(--warn); font-weight: 600; }

  /* ── Collapsible sections ──────────────────────────────────────── */
  details {
    background: var(--section-bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    margin-bottom: 8px;
    overflow: hidden;
  }
  summary {
    font-size: 0.85em;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted);
    padding: 9px 14px;
    cursor: pointer;
    user-select: none;
    list-style: none;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  summary::-webkit-details-marker { display: none; }
  summary::before {
    content: '▶';
    font-size: 0.65em;
    opacity: 0.5;
    transition: transform 0.1s;
    flex-shrink: 0;
  }
  details[open] > summary::before { transform: rotate(90deg); }
  .section-body { padding: 0 14px 12px 14px; }

  /* ── Section notes / captions ─────────────────────────────────── */
  .section-note { font-size: 0.88em; color: var(--muted); }
  .section-caption { font-size: 0.78em; color: var(--muted); font-style: italic; margin-top: 4px; }

  /* ── Shared table style ───────────────────────────────────────── */
  .section-body table { width: 100%; border-collapse: collapse; }
  .section-body td { padding: 3px 0; vertical-align: top; }
  .section-body td.key { color: var(--muted); width: 40%; font-size: 0.88em; }
  .section-body td.val { font-weight: 500; }
  code { font-family: var(--vscode-editor-font-family, monospace); font-size: 0.9em; }

  /* ── Notes list ───────────────────────────────────────────────── */
  .notes-list { list-style: none; padding: 0; }
  .notes-list li { font-size: 0.82em; color: var(--muted); font-style: italic; padding: 2px 0; }

  /* ── Error banner ─────────────────────────────────────────────── */
  .error-banner {
    background: var(--section-bg);
    border: 1px solid var(--warn);
    border-left: 3px solid var(--warn);
    border-radius: 4px;
    padding: 12px 14px;
    margin-bottom: 8px;
    font-size: 0.88em;
    color: var(--warn);
  }

  /* ── Keyword / activity list buttons ─────────────────────────── */
  .kw-list { list-style: none; padding: 0; }
  .kw-list li { padding: 2px 0; border-bottom: 1px solid var(--border); }
  .kw-list li:last-child { border-bottom: none; }
  .kw-btn {
    display: flex; justify-content: space-between; align-items: center;
    width: 100%; padding: 5px 6px;
    background: transparent; border: 1px solid transparent; border-radius: 3px;
    font-family: var(--vscode-font-family, sans-serif); font-size: 0.88em;
    cursor: pointer; text-align: left; color: var(--fg);
  }
  .kw-btn:hover { background: var(--vscode-list-hoverBackground); border-color: var(--border); }
  .kw-query { flex: 1; font-weight: 500; }
  .kw-score { font-size: 0.82em; color: var(--muted); margin-left: 8px; white-space: nowrap; }
  .risk-kw--high .kw-score { color: var(--vscode-editorError-foreground); }
  .risk-kw--mid  .kw-score { color: var(--warn); }
  .risk-kw--low  .kw-score { color: var(--vscode-terminal-ansiGreen); }

  /* ── Observatory action strip ─────────────────────────────────── */
  .actions-strip {
    background: var(--section-bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 12px 14px;
    margin-bottom: 12px;
  }
  .actions-strip h2 {
    font-size: 0.85em; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.05em;
    color: var(--muted); margin-bottom: 10px;
  }
  .action-list { display: flex; flex-direction: column; gap: 6px; }
  .action-btn {
    display: flex; align-items: center; gap: 8px; padding: 7px 12px;
    background: var(--vscode-button-secondaryBackground, var(--section-bg));
    color: var(--vscode-button-secondaryForeground, var(--fg));
    border: 1px solid var(--border); border-radius: 3px;
    font-family: var(--vscode-font-family, sans-serif); font-size: 0.88em;
    cursor: pointer; text-align: left; width: 100%;
  }
  .action-btn:hover {
    background: var(--vscode-button-secondaryHoverBackground, var(--vscode-list-hoverBackground));
  }
  .action-btn--primary {
    background: var(--vscode-button-background, var(--accent));
    color: var(--vscode-button-foreground, var(--bg));
    border-color: transparent; font-weight: 600;
  }
  .action-btn--primary:hover {
    background: var(--vscode-button-hoverBackground, var(--accent));
  }
  .action-btn--refresh {
    opacity: 0.75;
    font-size: 0.82em;
  }
  .action-btn--refresh:hover { opacity: 1; }
</style>`;
}
