// ─── providers/serpObservatoryProvider.ts ────────────────────────────────────
//
// Sidebar webview provider for the SERP Observatory Command Center panel.
// Renders the full SIL-16 through SIL-24 intelligence packet in a single panel:
//
//   SERP Climate         (weather + forecast)
//   Active Alerts        (alerts)
//   Operator Hints       (operatorActionHints)
//   Keyword Impact       (keywordImpactRanking)
//   Keywords Driving Alert (alertAffectedKeywords)
//
// Fetches: GET /api/seo/serp-disturbances?include=hints
// This returns all dependency layers in one request.
//
// Read-only. No mutations. No recomputation. No caching.
// The extension is a visualization surface only.

import * as vscode from 'vscode';
import { VedaClient } from '../services/vedaClient';
import { StateService } from '../services/stateService';
import { escapeHtml } from '../utils/formatting';
import { showApiError } from '../utils/errors';

// ─────────────────────────────────────────────────────────────────────────────
// Response shape (mirrors SIL-16 through SIL-24 API contract)
// ─────────────────────────────────────────────────────────────────────────────

interface WeatherResult {
  state: string;
  driver: string;
  confidence: number;
  stability: string;
  featureClimate: string;
  summary: string;
}

interface ForecastResult {
  trend: string;
  expectedState: string;
  confidence: number;
  momentum: string;
  forecastSummary: string;
}

interface AlertResult {
  level: string;   // "critical" | "warning" | "info"
  type: string;
  message: string;
  driver: string;
}

interface OperatorHint {
  priority: string;  // "high" | "medium" | "low"
  type: string;
  label: string;
}

interface ImpactKeyword {
  keywordTargetId: string;
  query: string;
  impactScore: number;
  primaryDriver: string;
  supportingSignals: string[];
}

interface AffectedKeyword {
  keywordTargetId: string;
  query: string;
  impactScore: number;
  reason: string;
}

interface SerpDisturbancesPacket {
  // disturbance fields (spread at top level)
  volatilityCluster?: boolean;
  rankingTurbulence?: boolean;
  featureShiftDetected?: boolean;
  affectedKeywordCount?: number;
  dominantNewFeatures?: string[];
  // named layers
  weather?: WeatherResult;
  forecast?: ForecastResult;
  alerts?: AlertResult[];
  operatorActionHints?: OperatorHint[];
  keywordImpactRanking?: ImpactKeyword[];
  alertAffectedKeywords?: AffectedKeyword[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

export class SerpObservatoryProvider implements vscode.WebviewViewProvider {
  public static readonly VIEW_ID = 'veda.serpObservatory';

  private _view?: vscode.WebviewView;
  private _packet: SerpDisturbancesPacket | null | undefined = undefined;
  // undefined = not yet loaded; null = load failed; object = loaded
  private _loading = false;
  private _stateDisposable: vscode.Disposable;

  constructor(
    private readonly client: VedaClient,
    private readonly state: StateService
  ) {
    this._stateDisposable = state.onStateChange(() => {
      this._packet = undefined;
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
    // Trigger load on first resolve if project is already set
    if (this.state.activeProject && this._packet === undefined) {
      this._load();
    }
  }

  refresh(): void {
    this._packet = undefined;
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
      const res = await this.client.getSerpDisturbances() as { data?: SerpDisturbancesPacket };
      this._packet = res?.data ?? null;
    } catch (err) {
      showApiError('SERP Observatory', err);
      this._packet = null;
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
      return _shell(_emptyState('Select a project to view the SERP Observatory.'));
    }
    if (this._loading || this._packet === undefined) {
      return _shell(_emptyState('Loading SERP climate…'));
    }
    if (this._packet === null) {
      return _shell(_errorState('Failed to load SERP Observatory data.'));
    }

    const p = this._packet;
    const sections: string[] = [];

    // 1. SERP Climate (weather + forecast)
    sections.push(_renderClimate(p.weather, p.forecast, p.affectedKeywordCount));

    // 2. Active Alerts
    sections.push(_renderAlerts(p.alerts ?? []));

    // 3. Operator Hints
    sections.push(_renderHints(p.operatorActionHints ?? []));

    // 4. Keyword Impact Ranking
    sections.push(_renderImpactRanking(p.keywordImpactRanking ?? []));

    // 5. Keywords Driving Alert
    sections.push(_renderAffectedKeywords(p.alertAffectedKeywords ?? []));

    return _shell(sections.join('\n'));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Section renderers (pure functions)
// ─────────────────────────────────────────────────────────────────────────────

function _renderClimate(
  weather: WeatherResult | undefined,
  forecast: ForecastResult | undefined,
  affectedCount: number | undefined
): string {
  if (!weather) {
    return _section('SERP Climate', '<p class="muted">No climate data available.</p>');
  }

  const stateLabel = _titleCase(weather.state);
  const stateCls   = `state--${escapeHtml(weather.state)}`;
  const driverLabel = _slugToLabel(weather.driver);
  const affectedLine = affectedCount !== undefined
    ? `<div class="climate-row"><span class="lbl">Affected Keywords</span><span class="val">${affectedCount}</span></div>`
    : '';

  let forecastBlock = '';
  if (forecast) {
    const trendLabel = _titleCase(forecast.trend);
    const momLabel   = _titleCase(forecast.momentum);
    const confDisplay = `${forecast.confidence}%`;
    forecastBlock = `
<div class="sub-header">Forecast</div>
<div class="climate-row"><span class="lbl">Trend</span><span class="val">${escapeHtml(trendLabel)} <span class="muted">(${escapeHtml(momLabel)})</span></span></div>
<div class="climate-row"><span class="lbl">Confidence</span><span class="val">${escapeHtml(confDisplay)}</span></div>`;
  }

  const body = `
<div class="climate-row"><span class="lbl">State</span><span class="val ${stateCls}">${escapeHtml(stateLabel)}</span></div>
<div class="climate-row"><span class="lbl">Driver</span><span class="val">${escapeHtml(driverLabel)}</span></div>
${affectedLine}
${forecastBlock}
<div class="climate-summary">${escapeHtml(weather.summary)}</div>`;

  return _section('SERP Climate', body);
}

function _renderAlerts(alerts: AlertResult[]): string {
  if (alerts.length === 0) {
    return _section('Active Alerts', '<p class="muted">No active alerts.</p>');
  }

  const items = alerts.map(a => {
    const cls   = `alert-level--${escapeHtml(a.level)}`;
    const label = a.level.toUpperCase();
    const typeLabel = _slugToLabel(a.type);
    return `<div class="alert-item">
  <span class="alert-badge ${cls}">${escapeHtml(label)}</span>
  <div class="alert-body">
    <div class="alert-type">${escapeHtml(typeLabel)}</div>
    <div class="alert-msg">${escapeHtml(a.message)}</div>
  </div>
</div>`;
  }).join('');

  return _section('Active Alerts', items);
}

function _renderHints(hints: OperatorHint[]): string {
  if (hints.length === 0) {
    return _section('Operator Investigation Hints', '<p class="muted">No hints at current climate state.</p>');
  }

  const items = hints.map(h => {
    const cls   = `hint-priority--${escapeHtml(h.priority)}`;
    const label = h.priority.toUpperCase();
    return `<div class="hint-item">
  <span class="hint-badge ${cls}">${escapeHtml(label)}</span>
  <span class="hint-label">${escapeHtml(h.label)}</span>
</div>`;
  }).join('');

  return _section('Operator Investigation Hints', items);
}

function _renderImpactRanking(keywords: ImpactKeyword[]): string {
  if (keywords.length === 0) {
    return _section('Keyword Impact Ranking', '<p class="muted">No keyword impact data. Snapshots needed.</p>');
  }

  const items = keywords.map((kw, i) => {
    const scoreCls = kw.impactScore >= 70 ? 'score--high' : kw.impactScore >= 40 ? 'score--mid' : 'score--low';
    const driverLabel = _slugToLabel(kw.primaryDriver);
    const sigList = kw.supportingSignals.length > 0
      ? `<div class="kw-signals">${kw.supportingSignals.map(s => escapeHtml(s)).join(', ')}</div>`
      : '';
    return `<div class="kw-item">
  <span class="kw-rank">${i + 1}.</span>
  <div class="kw-body">
    <div class="kw-query">${escapeHtml(kw.query)}</div>
    <div class="kw-meta">
      <span class="kw-score ${scoreCls}">${kw.impactScore}</span>
      <span class="kw-driver">${escapeHtml(driverLabel)}</span>
    </div>
    ${sigList}
  </div>
</div>`;
  }).join('');

  return _section('Keyword Impact Ranking', items);
}

function _renderAffectedKeywords(keywords: AffectedKeyword[]): string {
  if (keywords.length === 0) {
    return _section('Keywords Driving Alert', '<p class="muted">No affected keywords identified.</p>');
  }

  const items = keywords.map(kw => {
    const scoreCls = kw.impactScore >= 70 ? 'score--high' : kw.impactScore >= 40 ? 'score--mid' : 'score--low';
    return `<div class="affected-item">
  <div class="affected-query">${escapeHtml(kw.query)}</div>
  <div class="affected-meta">
    <span class="kw-score ${scoreCls}">${kw.impactScore}</span>
    <span class="affected-reason">${escapeHtml(kw.reason)}</span>
  </div>
</div>`;
  }).join('');

  return _section('Keywords Driving Alert', items);
}

// ─────────────────────────────────────────────────────────────────────────────
// Shell + section helpers
// ─────────────────────────────────────────────────────────────────────────────

function _section(heading: string, body: string): string {
  return `<div class="obs-section">
  <div class="obs-section-heading">${escapeHtml(heading)}</div>
  <div class="obs-section-body">${body}</div>
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

  /* ── Sections ─────────────────────────────────────────────────── */
  .obs-section {
    margin-bottom: 10px;
    background: var(--section);
    border: 1px solid var(--border);
    border-radius: 3px;
    overflow: hidden;
  }
  .obs-section-heading {
    font-size: 0.75em;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--muted);
    padding: 6px 10px;
    border-bottom: 1px solid var(--border);
    background: var(--bg);
  }
  .obs-section-body { padding: 8px 10px; }

  /* ── Sub-heading inside sections ──────────────────────────────── */
  .sub-header {
    font-size: 0.72em;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--accent);
    margin: 8px 0 4px 0;
  }

  /* ── Climate rows ─────────────────────────────────────────────── */
  .climate-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 2px 0;
    font-size: 0.88em;
  }
  .climate-row .lbl { color: var(--muted); }
  .climate-row .val { font-weight: 500; }
  .climate-summary {
    font-size: 0.82em;
    color: var(--muted);
    font-style: italic;
    margin-top: 7px;
    padding-top: 6px;
    border-top: 1px solid var(--border);
  }

  /* ── State colours ────────────────────────────────────────────── */
  .state--calm     { color: var(--green); font-weight: 600; }
  .state--shifting { color: var(--fg); font-weight: 600; }
  .state--turbulent { color: var(--warn); font-weight: 600; }
  .state--unstable  { color: var(--error); font-weight: 700; }

  /* ── Alert items ──────────────────────────────────────────────── */
  .alert-item {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 5px 0;
    border-bottom: 1px solid var(--border);
  }
  .alert-item:last-child { border-bottom: none; }
  .alert-badge {
    font-size: 0.7em;
    font-weight: 700;
    letter-spacing: 0.05em;
    padding: 2px 5px;
    border-radius: 2px;
    white-space: nowrap;
    flex-shrink: 0;
    margin-top: 1px;
  }
  .alert-level--critical { background: var(--error); color: var(--bg); }
  .alert-level--warning  { background: var(--warn); color: var(--bg); }
  .alert-level--info     { background: var(--muted); color: var(--bg); }
  .alert-type { font-size: 0.88em; font-weight: 600; }
  .alert-msg  { font-size: 0.82em; color: var(--muted); margin-top: 1px; }

  /* ── Hint items ───────────────────────────────────────────────── */
  .hint-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
    border-bottom: 1px solid var(--border);
  }
  .hint-item:last-child { border-bottom: none; }
  .hint-badge {
    font-size: 0.7em;
    font-weight: 700;
    letter-spacing: 0.05em;
    padding: 2px 5px;
    border-radius: 2px;
    white-space: nowrap;
    flex-shrink: 0;
    min-width: 52px;
    text-align: center;
  }
  .hint-priority--high   { background: var(--error); color: var(--bg); }
  .hint-priority--medium { background: var(--warn); color: var(--bg); }
  .hint-priority--low    { color: var(--muted); border: 1px solid var(--border); }
  .hint-label { font-size: 0.88em; }

  /* ── Keyword items ────────────────────────────────────────────── */
  .kw-item {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    padding: 5px 0;
    border-bottom: 1px solid var(--border);
  }
  .kw-item:last-child { border-bottom: none; }
  .kw-rank {
    font-size: 0.78em;
    color: var(--muted);
    min-width: 16px;
    text-align: right;
    padding-top: 1px;
    flex-shrink: 0;
  }
  .kw-body { flex: 1; min-width: 0; }
  .kw-query { font-size: 0.88em; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .kw-meta  { display: flex; align-items: center; gap: 6px; margin-top: 2px; }
  .kw-score {
    font-size: 0.78em;
    font-weight: 700;
    min-width: 24px;
    text-align: center;
    padding: 1px 3px;
    border-radius: 2px;
  }
  .score--high { color: var(--error); }
  .score--mid  { color: var(--warn); }
  .score--low  { color: var(--green); }
  .kw-driver   { font-size: 0.78em; color: var(--muted); }
  .kw-signals  { font-size: 0.75em; color: var(--muted); margin-top: 1px; }

  /* ── Affected keyword items ───────────────────────────────────── */
  .affected-item {
    padding: 5px 0;
    border-bottom: 1px solid var(--border);
  }
  .affected-item:last-child { border-bottom: none; }
  .affected-query  { font-size: 0.88em; font-weight: 600; }
  .affected-meta   { display: flex; align-items: flex-start; gap: 6px; margin-top: 3px; }
  .affected-reason { font-size: 0.82em; color: var(--muted); }

  /* ── Utility ──────────────────────────────────────────────────── */
  .muted { color: var(--muted); font-size: 0.88em; }
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

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────────────────────

function _slugToLabel(slug: string): string {
  if (!slug) return '—';
  return slug
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function _titleCase(s: string): string {
  if (!s) return '—';
  return s.charAt(0).toUpperCase() + s.slice(1);
}
