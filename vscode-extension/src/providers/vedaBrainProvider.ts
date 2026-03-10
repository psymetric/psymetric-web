// ─── providers/vedaBrainProvider.ts ─────────────────────────────────────────
//
// Sidebar webview provider for the VEDA Brain Diagnostics panel.
// Renders Phase 1 mismatch diagnostics from:
//
//   GET /api/veda-brain/project-diagnostics
//
// Panels rendered:
//   Brain Overview          (readinessClassification categoryCounts)
//   Archetype Mismatches    (archetypeAlignment.entries where !aligned)
//   Entity Coverage Gaps    (entityGapAnalysis.entries where missingFromProject.length > 0)
//   Topic Territory Gaps    (topicTerritoryGaps.untrackedTopics + uncategorizedKeywords)
//   Authority Opportunities (authorityOpportunity.opportunities where type !== 'none')
//   Schema Opportunities    (schemaOpportunity.entries where missingSchemaTypes.length > 0)
//
// Read-only. No mutations. No recomputation. No caching.
// The extension is a visualization surface only.

import * as vscode from 'vscode';
import { VedaClient } from '../services/vedaClient';
import { StateService } from '../services/stateService';
import { escapeHtml } from '../utils/formatting';
import { showApiError } from '../utils/errors';
import {
  VedaBrainDiagnosticsResponse,
  VedaBrainDiagnostics,
  ReadinessClassification,
  ArchetypeAlignment,
  EntityGapAnalysis,
  TopicTerritoryGaps,
  AuthorityOpportunity,
  SchemaOpportunity,
} from '../types/vedaBrain';

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

export class VedaBrainProvider implements vscode.WebviewViewProvider {
  public static readonly VIEW_ID = 'veda.vedaBrain';

  private _view?: vscode.WebviewView;
  private _data: VedaBrainDiagnosticsResponse | null | undefined = undefined;
  // undefined = not yet loaded; null = load failed; object = loaded
  private _loading = false;
  private _stateDisposable: vscode.Disposable;

  constructor(
    private readonly client: VedaClient,
    private readonly state: StateService
  ) {
    this._stateDisposable = state.onStateChange(() => {
      this._data = undefined;
      this._load();
    });
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
    if (this.state.activeProject && this._data === undefined) {
      this._load();
    }
  }

  refresh(): void {
    this._data = undefined;
    this._load();
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private async _load(): Promise<void> {
    if (!this.state.activeProject) {
      this._render();
      return;
    }
    this._loading = true;
    this._render();

    try {
      const res = await this.client.getVedaBrainDiagnostics();
      this._data = res.data;
    } catch (err) {
      showApiError('VEDA Brain', err);
      this._data = null;
    } finally {
      this._loading = false;
      this._render();
    }
  }

  private _render(): void {
    if (!this._view) return;
    this._view.webview.html = this._buildHtml();
  }

  // ── HTML builder ─────────────────────────────────────────────────────────

  private _buildHtml(): string {
    if (!this.state.activeProject) {
      return _shell(_emptyState('Select a project to view VEDA Brain diagnostics.'));
    }
    if (this._loading || this._data === undefined) {
      return _shell(_emptyState('Loading Brain diagnostics…'));
    }
    if (this._data === null) {
      return _shell(_errorState('Failed to load VEDA Brain diagnostics.'));
    }

    const d: VedaBrainDiagnostics = this._data.diagnostics;
    const sections: string[] = [];

    sections.push(_renderOverview(d.readinessClassification));
    sections.push(_renderArchetypeMismatches(d.archetypeAlignment));
    sections.push(_renderEntityGaps(d.entityGapAnalysis));
    sections.push(_renderTopicTerritoryGaps(d.topicTerritoryGaps));
    sections.push(_renderAuthorityOpportunities(d.authorityOpportunity));
    sections.push(_renderSchemaOpportunities(d.schemaOpportunity));

    return _shell(sections.join('\n'));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Section renderers (pure functions)
// ─────────────────────────────────────────────────────────────────────────────

function _renderOverview(rc: ReadinessClassification): string {
  const c = rc.categoryCounts;
  const total = rc.classifications.length;

  const rows = [
    _statRow('Total Keywords', String(total)),
    _statRow('Structurally Aligned', String(c.structurally_aligned), 'good'),
    _statRow('Archetype Misaligned', String(c.archetype_misaligned), c.archetype_misaligned > 0 ? 'warn' : 'good'),
    _statRow('Entity Incomplete', String(c.entity_incomplete), c.entity_incomplete > 0 ? 'warn' : 'good'),
    _statRow('Under Covered', String(c.under_covered), c.under_covered > 0 ? 'warn' : 'good'),
    _statRow('Weak Authority', String(c.weak_authority_support), c.weak_authority_support > 0 ? 'warn' : 'good'),
    _statRow('Schema Underpowered', String(c.schema_underpowered), c.schema_underpowered > 0 ? 'warn' : 'good'),
    _statRow('Unmapped', String(c.unmapped), c.unmapped > 0 ? 'error' : 'good'),
  ].join('');

  return _section('Brain Overview', `<div class="stat-grid">${rows}</div>`);
}

function _renderArchetypeMismatches(aa: ArchetypeAlignment): string {
  const mismatches = aa.entries.filter(e =>
    !e.aligned &&
    e.mismatchReason !== 'no_serp_archetype_signal' &&
    e.mismatchReason !== 'no_mapped_page'
  );

  if (mismatches.length === 0) {
    const msg = aa.entries.length === 0
      ? '<p class="muted">No keyword data available.</p>'
      : '<p class="muted">No archetype mismatches detected.</p>';
    return _section('Archetype Mismatches', msg);
  }

  const items = mismatches.map(e => {
    const topSerp = e.serpDominantArchetypes[0]?.archetype ?? '—';
    const pageArch = e.mappedPageArchetype ?? '(none)';
    return `<div class="mismatch-item">
  <div class="mismatch-query">${escapeHtml(e.query)}</div>
  <div class="mismatch-detail">
    <span class="lbl">Page</span> <span class="arch-val arch-page">${escapeHtml(pageArch)}</span>
    <span class="arrow">→</span>
    <span class="lbl">SERP expects</span> <span class="arch-val arch-serp">${escapeHtml(topSerp)}</span>
  </div>
</div>`;
  }).join('');

  return _section(`Archetype Mismatches (${mismatches.length})`, items);
}

function _renderEntityGaps(eg: EntityGapAnalysis): string {
  const withGaps = eg.entries.filter(e => e.missingFromProject.length > 0);

  if (withGaps.length === 0) {
    const msg = eg.entries.length === 0
      ? '<p class="muted">No keyword data available.</p>'
      : '<p class="muted">No entity gaps detected.</p>';
    return _section('Entity Coverage Gaps', msg);
  }

  const items = withGaps.slice(0, 20).map(e => {
    const missing = e.missingFromProject.map(m => `<span class="entity-tag entity-missing">${escapeHtml(m)}</span>`).join('');
    return `<div class="gap-item">
  <div class="gap-query">${escapeHtml(e.query)}</div>
  <div class="gap-missing">${missing}</div>
</div>`;
  }).join('');

  const extra = withGaps.length > 20
    ? `<p class="muted extra-note">…and ${withGaps.length - 20} more keywords with gaps.</p>`
    : '';

  return _section(`Entity Coverage Gaps (${eg.keywordsWithGaps} keywords, ${eg.totalGaps} gaps)`, items + extra);
}

function _renderTopicTerritoryGaps(ttg: TopicTerritoryGaps): string {
  const s = ttg.summary;
  const hasIssues = s.untrackedTopicCount > 0 || s.uncategorizedKeywordCount > 0 || s.thinTopicCount > 0;

  if (!hasIssues) {
    return _section('Topic Territory Gaps', '<p class="muted">No topic territory gaps detected.</p>');
  }

  let body = '';

  if (ttg.untrackedTopics.length > 0) {
    const tags = ttg.untrackedTopics.map(t => `<span class="entity-tag entity-missing">${escapeHtml(t)}</span>`).join('');
    body += `<div class="sub-header">Untracked Topics (${ttg.untrackedTopics.length})</div>
<div class="tag-row">${tags}</div>`;
  }

  if (ttg.thinTopics.length > 0) {
    const tags = ttg.thinTopics.map(t => `<span class="entity-tag entity-warn">${escapeHtml(t)}</span>`).join('');
    body += `<div class="sub-header" style="margin-top:8px">Thin Topics ≤1 page (${ttg.thinTopics.length})</div>
<div class="tag-row">${tags}</div>`;
  }

  if (ttg.uncategorizedKeywords.length > 0) {
    const shown = ttg.uncategorizedKeywords.slice(0, 15);
    const items = shown.map(u =>
      `<div class="uncategorized-item">
  <span class="kw-bullet">•</span>
  <span class="uncategorized-query">${escapeHtml(u.query)}</span>
  <span class="muted" style="font-size:0.75em">${u.hasMapping ? 'mapped' : 'unmapped'}</span>
</div>`
    ).join('');
    const extra = ttg.uncategorizedKeywords.length > 15
      ? `<p class="muted extra-note">…and ${ttg.uncategorizedKeywords.length - 15} more.</p>`
      : '';
    body += `<div class="sub-header" style="margin-top:8px">Uncategorized Keywords (${ttg.uncategorizedKeywords.length})</div>${items}${extra}`;
  }

  return _section('Topic Territory Gaps', body);
}

function _renderAuthorityOpportunities(ao: AuthorityOpportunity): string {
  const actionable = ao.opportunities.filter(o => o.opportunityType !== 'none');

  if (actionable.length === 0) {
    return _section('Authority Opportunities', '<p class="muted">No authority gaps detected.</p>');
  }

  const TYPE_LABELS: Record<string, string> = {
    isolated_target: 'Isolated',
    high_value_undersupported: 'High Value',
    weak_support: 'Weak Support',
  };
  const TYPE_CLS: Record<string, string> = {
    isolated_target: 'badge-error',
    high_value_undersupported: 'badge-warn',
    weak_support: 'badge-muted',
  };

  const items = actionable.slice(0, 20).map(o => {
    const label = TYPE_LABELS[o.opportunityType] ?? o.opportunityType;
    const cls = TYPE_CLS[o.opportunityType] ?? 'badge-muted';
    const urlDisplay = o.mappedPageUrl.replace(/^https?:\/\/[^\/]+/, '') || '/';
    return `<div class="auth-item">
  <span class="auth-badge ${cls}">${escapeHtml(label)}</span>
  <div class="auth-body">
    <div class="auth-query">${escapeHtml(o.query)}</div>
    <div class="auth-meta">
      <span class="muted">${escapeHtml(urlDisplay)}</span>
      <span class="auth-links">${o.inboundLinkCount} inbound</span>
    </div>
  </div>
</div>`;
  }).join('');

  const extra = actionable.length > 20
    ? `<p class="muted extra-note">…and ${actionable.length - 20} more.</p>`
    : '';

  const s = ao.summary;
  const summaryLine = `<div class="auth-summary muted">
  ${s.isolatedTargets > 0 ? `<span>${s.isolatedTargets} isolated</span>` : ''}
  ${s.highValueUndersupported > 0 ? `<span>${s.highValueUndersupported} high-value</span>` : ''}
  ${s.weaklySupported > 0 ? `<span>${s.weaklySupported} weak</span>` : ''}
</div>`;

  return _section(`Authority Opportunities (${actionable.length})`, summaryLine + items + extra);
}

function _renderSchemaOpportunities(so: SchemaOpportunity): string {
  const withGaps = so.entries.filter(e => e.missingSchemaTypes.length > 0);

  if (withGaps.length === 0) {
    const msg = so.entries.length === 0
      ? '<p class="muted">No keyword data available.</p>'
      : '<p class="muted">No schema gaps detected.</p>';
    return _section('Schema Opportunities', msg);
  }

  let freqBlock = '';
  if (so.serpSchemaFrequency.length > 0) {
    const top = so.serpSchemaFrequency.slice(0, 5)
      .map(f => `<span class="entity-tag entity-schema">${escapeHtml(f.schemaType)} ×${f.count}</span>`)
      .join('');
    freqBlock = `<div class="sub-header">SERP Schema Signals</div><div class="tag-row" style="margin-bottom:8px">${top}</div>`;
  }

  const items = withGaps.slice(0, 20).map(e => {
    const missing = e.missingSchemaTypes.map(s => `<span class="entity-tag entity-missing">${escapeHtml(s)}</span>`).join('');
    const pageSchemas = e.pageSchemaTypes.length > 0
      ? e.pageSchemaTypes.map(s => `<span class="entity-tag entity-present">${escapeHtml(s)}</span>`).join('')
      : '<span class="muted" style="font-size:0.78em">none</span>';
    return `<div class="gap-item">
  <div class="gap-query">${escapeHtml(e.query)}</div>
  <div class="schema-row">
    <span class="lbl">Has</span> ${pageSchemas}
    <span class="lbl" style="margin-left:6px">Missing</span> ${missing}
  </div>
</div>`;
  }).join('');

  const extra = withGaps.length > 20
    ? `<p class="muted extra-note">…and ${withGaps.length - 20} more keywords with schema gaps.</p>`
    : '';

  return _section(
    `Schema Opportunities (${so.totalMissingSchemaOpportunities} gaps, ${so.pagesWithoutSchema} pages no schema)`,
    freqBlock + items + extra
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shell + section helpers
// ─────────────────────────────────────────────────────────────────────────────

function _statRow(label: string, value: string, emphasis?: 'good' | 'warn' | 'error'): string {
  const cls = emphasis === 'good' ? 'stat-good'
    : emphasis === 'warn' ? 'stat-warn'
    : emphasis === 'error' ? 'stat-error'
    : '';
  return `<div class="stat-row">
  <span class="stat-lbl">${escapeHtml(label)}</span>
  <span class="stat-val ${cls}">${escapeHtml(value)}</span>
</div>`;
}

function _section(heading: string, body: string): string {
  return `<div class="brain-section">
  <div class="brain-section-heading">${escapeHtml(heading)}</div>
  <div class="brain-section-body">${body}</div>
</div>`;
}

function _emptyState(msg: string): string {
  return `<div class="empty-state">${escapeHtml(msg)}</div>`;
}

function _errorState(msg: string): string {
  return `<div class="error-state">${escapeHtml(msg)}</div>`;
}

function _shell(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  :root {
    --bg:      var(--vscode-sideBar-background);
    --fg:      var(--vscode-sideBar-foreground, var(--vscode-editor-foreground));
    --border:  var(--vscode-panel-border);
    --muted:   var(--vscode-descriptionForeground);
    --accent:  var(--vscode-textLink-foreground);
    --warn:    var(--vscode-editorWarning-foreground);
    --error:   var(--vscode-editorError-foreground);
    --green:   var(--vscode-terminal-ansiGreen);
    --section: var(--vscode-editor-background);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family, sans-serif);
    font-size: var(--vscode-font-size, 12px);
    color: var(--fg);
    background: var(--bg);
    padding: 8px 10px 16px 10px;
    line-height: 1.5;
  }

  /* ── Sections ─────────────────────────────────────────────── */
  .brain-section {
    margin-bottom: 10px;
    background: var(--section);
    border: 1px solid var(--border);
    border-radius: 3px;
    overflow: hidden;
  }
  .brain-section-heading {
    font-size: 0.75em;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--muted);
    padding: 6px 10px;
    border-bottom: 1px solid var(--border);
    background: var(--bg);
  }
  .brain-section-body { padding: 8px 10px; }

  /* ── Sub-heading ──────────────────────────────────────────── */
  .sub-header {
    font-size: 0.72em;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--accent);
    margin-bottom: 4px;
  }

  /* ── Overview stat grid ───────────────────────────────────── */
  .stat-grid { display: flex; flex-direction: column; gap: 2px; }
  .stat-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 2px 0;
    font-size: 0.88em;
    border-bottom: 1px solid var(--border);
  }
  .stat-row:last-child { border-bottom: none; }
  .stat-lbl { color: var(--muted); }
  .stat-val { font-weight: 600; }
  .stat-good  { color: var(--green); }
  .stat-warn  { color: var(--warn); }
  .stat-error { color: var(--error); }

  /* ── Mismatch items ───────────────────────────────────────── */
  .mismatch-item {
    padding: 5px 0;
    border-bottom: 1px solid var(--border);
  }
  .mismatch-item:last-child { border-bottom: none; }
  .mismatch-query { font-size: 0.88em; font-weight: 600; margin-bottom: 2px; }
  .mismatch-detail {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 0.82em;
    flex-wrap: wrap;
  }
  .lbl { color: var(--muted); font-size: 0.9em; }
  .arrow { color: var(--muted); }
  .arch-val {
    font-weight: 600;
    padding: 1px 5px;
    border-radius: 2px;
    font-size: 0.9em;
  }
  .arch-page { color: var(--warn); background: color-mix(in srgb, var(--warn) 15%, transparent); }
  .arch-serp { color: var(--green); background: color-mix(in srgb, var(--green) 15%, transparent); }

  /* ── Gap items ────────────────────────────────────────────── */
  .gap-item {
    padding: 5px 0;
    border-bottom: 1px solid var(--border);
  }
  .gap-item:last-child { border-bottom: none; }
  .gap-query { font-size: 0.88em; font-weight: 600; margin-bottom: 3px; }
  .gap-missing { display: flex; flex-wrap: wrap; gap: 3px; }
  .schema-row { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; font-size: 0.82em; }

  /* ── Entity / schema tags ─────────────────────────────────── */
  .tag-row { display: flex; flex-wrap: wrap; gap: 4px; }
  .entity-tag {
    font-size: 0.75em;
    padding: 1px 5px;
    border-radius: 10px;
    font-weight: 600;
  }
  .entity-missing { background: color-mix(in srgb, var(--error) 20%, transparent); color: var(--error); }
  .entity-warn    { background: color-mix(in srgb, var(--warn) 20%, transparent); color: var(--warn); }
  .entity-present { background: color-mix(in srgb, var(--green) 20%, transparent); color: var(--green); }
  .entity-schema  { background: color-mix(in srgb, var(--accent) 20%, transparent); color: var(--accent); }

  /* ── Uncategorized keywords ───────────────────────────────── */
  .uncategorized-item {
    display: flex;
    align-items: baseline;
    gap: 5px;
    padding: 2px 0;
    font-size: 0.88em;
  }
  .kw-bullet { color: var(--muted); flex-shrink: 0; }
  .uncategorized-query { flex: 1; }

  /* ── Authority items ──────────────────────────────────────── */
  .auth-summary { font-size: 0.8em; display: flex; gap: 10px; margin-bottom: 6px; }
  .auth-summary span::before { content: "• "; }
  .auth-item {
    display: flex;
    align-items: flex-start;
    gap: 7px;
    padding: 5px 0;
    border-bottom: 1px solid var(--border);
  }
  .auth-item:last-child { border-bottom: none; }
  .auth-badge {
    font-size: 0.7em;
    font-weight: 700;
    letter-spacing: 0.04em;
    padding: 2px 5px;
    border-radius: 2px;
    white-space: nowrap;
    flex-shrink: 0;
    margin-top: 1px;
  }
  .badge-error { background: var(--error); color: var(--bg); }
  .badge-warn  { background: var(--warn); color: var(--bg); }
  .badge-muted { color: var(--muted); border: 1px solid var(--border); }
  .auth-body { flex: 1; min-width: 0; }
  .auth-query { font-size: 0.88em; font-weight: 600; }
  .auth-meta  { display: flex; align-items: center; gap: 8px; font-size: 0.78em; margin-top: 1px; }
  .auth-links { color: var(--accent); }

  /* ── Utility ──────────────────────────────────────────────── */
  .muted { color: var(--muted); font-size: 0.88em; }
  .extra-note { font-size: 0.8em; color: var(--muted); font-style: italic; margin-top: 4px; }
  .empty-state {
    color: var(--muted);
    font-size: 0.88em;
    text-align: center;
    padding: 24px 0;
  }
  .error-state {
    color: var(--warn);
    font-size: 0.88em;
    text-align: center;
    padding: 24px 0;
  }
</style>
</head>
<body>
${body}
</body>
</html>`;
}
