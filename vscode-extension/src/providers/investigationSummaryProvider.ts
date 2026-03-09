// ─── providers/investigationSummaryProvider.ts ───────────────────────────────
//
// Read-only TreeDataProvider for the Investigation Summary sidebar view.
// Fetches GET /api/seo/volatility-summary?windowDays=7 and renders a compact
// project-level signal summary as a flat tree.
// No local analytics. No mutations. No polling.
// Phase 1.8: lifecycle-aware view message hint.

import * as vscode from 'vscode';
import { VedaClient } from '../services/vedaClient';
import { StateService } from '../services/stateService';
import { showApiError } from '../utils/errors';
import { formatVolatility } from '../utils/formatting';

// ── Response shape (subset we use) ───────────────────────────────────────────

interface VolatilitySummaryResponse {
  data: {
    keywordCount:                   number;
    activeKeywordCount:             number;
    alertKeywordCount:              number;
    weightedProjectVolatilityScore: number;
    volatilityConcentrationRatio:   number | null;
    highVolatilityCount:            number;
    mediumVolatilityCount:          number;
    windowDays:                     number | null;
    top3RiskKeywords: Array<{
      keywordTargetId:    string;
      query:              string;
      volatilityScore:    number;
      volatilityRegime:   string;
      volatilityMaturity: string;
      exceedsThreshold:   boolean;
    }>;
  };
}

// ── Tree item variants ────────────────────────────────────────────────────────

/** A plain summary row (not clickable). */
class SummaryRowItem extends vscode.TreeItem {
  constructor(label: string, detail: string, icon: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = detail;
    this.iconPath = new vscode.ThemeIcon(icon);
    this.contextValue = 'summaryRow';
  }
}

/** A top-risk keyword row — clicking opens the full investigation. */
export class SummaryKeywordItem extends vscode.TreeItem {
  constructor(
    public readonly query: string,
    score: number,
    regime: string,
    maturity: string,
    exceedsThreshold: boolean,
    public readonly keywordTargetId: string
  ) {
    super(query, vscode.TreeItemCollapsibleState.None);
    this.description = `${score.toFixed(0)} · ${regime} · ${maturity}`;
    this.tooltip = `${query}\nVolatility: ${score.toFixed(0)} (${regime})\nMaturity: ${maturity}`;
    this.iconPath = new vscode.ThemeIcon(
      exceedsThreshold ? 'warning' : score >= 40 ? 'circle-filled' : 'circle-outline'
    );
    this.contextValue = 'summaryKeywordItem';
    // Clicking opens the full project investigation.
    this.command = {
      command:   'veda.summaryKeywordDiagnostic',
      title:     'Keyword Diagnostic',
      arguments: [this.query, this.keywordTargetId],
    };
  }
}

type SummaryItem = SummaryRowItem | SummaryKeywordItem;

// ── Lifecycle hint helper ─────────────────────────────────────────────────────

/**
 * Return a short lifecycle-aware subtitle for the view message when summary
 * data is present. Returns undefined (clears message) for seasoned/unknown.
 * Only uses lifecycleState already returned by the backend — no local inference.
 */
function summaryLifecycleHint(lifecycleState: string | undefined): string | undefined {
  const s = (lifecycleState ?? '').toLowerCase();
  if (s === 'observing' || s === 'new') {
    return 'More snapshots will sharpen these signals.';
  }
  if (s === 'developing' || s === 'active') {
    return 'Alerts and keyword diagnostics are most useful now.';
  }
  // seasoned / mature / unknown: no hint
  return undefined;
}

// ── Provider ──────────────────────────────────────────────────────────────────

export class InvestigationSummaryProvider
  implements vscode.TreeDataProvider<SummaryItem>
{
  public static readonly VIEW_ID = 'veda.investigationSummary';

  private _items: SummaryItem[] = [];
  private _loading  = false;
  private _loaded   = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _view?: vscode.TreeView<any>;

  private readonly _onDidChangeTreeData =
    new vscode.EventEmitter<SummaryItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _stateDisposable: vscode.Disposable;

  constructor(
    private readonly client: VedaClient,
    private readonly state:  StateService
  ) {
    this._stateDisposable = state.onStateChange(() => {
      this._items  = [];
      this._loaded = false;
      this._onDidChangeTreeData.fire();
      this._load();
    });
  }

  /** Call once after createTreeView to enable message updates. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setView(view: vscode.TreeView<any>): void {
    this._view = view;
  }

  dispose(): void {
    this._stateDisposable.dispose();
    this._onDidChangeTreeData.dispose();
  }

  refresh(): void {
    this._items  = [];
    this._loaded = false;
    this._onDidChangeTreeData.fire();
    this._load();
  }

  getTreeItem(element: SummaryItem): vscode.TreeItem {
    return element;
  }

  getChildren(): vscode.ProviderResult<SummaryItem[]> {
    const lifecycle = this.state.activeProject?.lifecycleState;

    if (!this.state.activeProject) {
      this._setMessage('Select a project to view the investigation summary.');
      return [];
    }
    if (this._loading) {
      this._setMessage('Loading summary…');
      return [];
    }
    if (this._loaded && this._items.length === 0) {
      this._setMessage('No summary data available.');
      return [];
    }
    // Lifecycle-aware subtitle shown below the view title when data is loaded.
    this._setMessage(summaryLifecycleHint(lifecycle));
    return this._items;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _setMessage(msg: string | undefined): void {
    if (this._view) this._view.message = msg;
  }

  private async _load(): Promise<void> {
    if (!this.state.activeProject) return;
    this._loading = true;
    this._onDidChangeTreeData.fire();

    try {
      const res = await this.client.getVolatilitySummary(7) as VolatilitySummaryResponse;
      const d = res?.data;
      if (!d) {
        this._items  = [];
        this._loaded = true;
        return;
      }

      const items: SummaryItem[] = [];

      // ── Row 1: Weighted project volatility ────────────────────────────────
      const wScore = d.weightedProjectVolatilityScore ?? 0;
      const wRegime = wScore >= 70 ? 'high' : wScore >= 40 ? 'medium' : 'stable';
      items.push(new SummaryRowItem(
        'Project Volatility',
        formatVolatility(wScore, wRegime),
        wScore >= 70 ? 'pulse' : wScore >= 40 ? 'circle-filled' : 'circle-outline'
      ));

      // ── Row 2: Keyword coverage ───────────────────────────────────────────
      items.push(new SummaryRowItem(
        'Keywords',
        `${d.activeKeywordCount} active / ${d.keywordCount} total`,
        'symbol-keyword'
      ));

      // ── Row 3: Alert count ────────────────────────────────────────────────
      items.push(new SummaryRowItem(
        'Alerts',
        d.alertKeywordCount > 0
          ? `${d.alertKeywordCount} at threshold`
          : 'None at threshold',
        d.alertKeywordCount > 0 ? 'warning' : 'check'
      ));

      // ── Row 4: High/medium volatility counts ──────────────────────────────
      if (d.highVolatilityCount > 0 || d.mediumVolatilityCount > 0) {
        items.push(new SummaryRowItem(
          'Volatile',
          `${d.highVolatilityCount} high · ${d.mediumVolatilityCount} medium`,
          'graph-line'
        ));
      }

      // ── Row 5: Concentration ratio (if meaningful) ────────────────────────
      if (d.volatilityConcentrationRatio !== null && d.volatilityConcentrationRatio !== undefined) {
        const pct = (d.volatilityConcentrationRatio * 100).toFixed(0);
        items.push(new SummaryRowItem(
          'Risk Concentration',
          `Top 3 carry ${pct}% of volatility`,
          'layers'
        ));
      }

      // ── Top-3 risk keywords (clickable → investigate) ─────────────────────
      if (d.top3RiskKeywords && d.top3RiskKeywords.length > 0) {
        items.push(new SummaryRowItem('── Top Risk ──', '', 'dash'));
        for (const kw of d.top3RiskKeywords) {
          items.push(new SummaryKeywordItem(
            kw.query,
            kw.volatilityScore,
            kw.volatilityRegime,
            kw.volatilityMaturity,
            kw.exceedsThreshold,
            kw.keywordTargetId
          ));
        }
      }

      this._items  = items;
      this._loaded = true;

    } catch (err) {
      showApiError('Investigation Summary', err);
      this._items  = [];
      this._loaded = true;
      this._setMessage('Failed to load summary.');
    } finally {
      this._loading = false;
      this._onDidChangeTreeData.fire();
    }
  }
}
