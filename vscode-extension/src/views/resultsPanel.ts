// ─── views/resultsPanel.ts ───────────────────────────────────────────────────
//
// Reusable webview panel for structured observatory responses.
// Renders: project investigation packets, keyword diagnostic packets.
// No React. Plain HTML/CSS rendered once per command.

import * as vscode from 'vscode';
import { StateService } from '../services/stateService';
import { escapeHtml, formatPercent, formatVolatility, capitalise } from '../utils/formatting';

export class ResultsPanel {
  private static readonly VIEW_TYPE = 'veda.results';

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly state: StateService
  ) {}

  // ── Public API ────────────────────────────────────────────────────────────

  showInvestigation(title: string, data: unknown): void {
    const panel = this._getOrCreatePanel(title);
    panel.webview.html = this._renderInvestigation(title, data);
    panel.reveal();
  }

  showKeywordDiagnostic(title: string, data: unknown): void {
    const panel = this._getOrCreatePanel(title);
    panel.webview.html = this._renderKeywordDiagnostic(title, data);
    panel.reveal();
  }

  // ── Panel lifecycle ───────────────────────────────────────────────────────

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
        enableScripts: false, // no client-side JS needed
        retainContextWhenHidden: true,
      }
    );

    panel.onDidDispose(() => {
      this.state.setOpenPanel(null);
    });

    this.state.setOpenPanel(panel);
    return panel;
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  private _shell(title: string, body: string): string {
    const project = this.state.activeProject;
    const envName = capitalise(
      vscode.workspace.getConfiguration('veda').get<string>('activeEnvironment') ?? 'local'
    );
    const projectLine = project
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
  header h1 { font-size: 1.1em; font-weight: 600; margin-bottom: 4px; }
  .meta { font-size: 0.85em; color: var(--muted); display: flex; gap: 10px; flex-wrap: wrap; }
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
    ${projectLine}
    <span>${escapeHtml(envName)}</span>
  </div>
</header>
${body}
</body>
</html>`;
  }

  private _renderInvestigation(title: string, raw: unknown): string {
    const data = raw as Record<string, unknown>;
    const summary = data.summary as Record<string, unknown> | undefined;
    const alerts  = data.alerts  as Record<string, unknown> | undefined;
    const risk    = data.risk    as Record<string, unknown> | undefined;

    // ── Summary section ───────────────────────────────────────────────────
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

    // ── Risk attribution section ───────────────────────────────────────────
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

    // ── Alerts section ────────────────────────────────────────────────────
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

    // ── Reasoning section ─────────────────────────────────────────────────
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

    return this._shell(title, summaryHtml + riskHtml + alertsHtml + reasoningHtml);
  }

  private _renderKeywordDiagnostic(title: string, raw: unknown): string {
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

    const body = `
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

    return this._shell(title, body);
  }
}
