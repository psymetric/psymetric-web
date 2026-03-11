// ─── providers/alertsProvider.ts ─────────────────────────────────────────────
//
// Read-only TreeDataProvider for Top Alerts sidebar view.
// Fetches GET /api/seo/alerts?windowDays=7&limit=20 and renders a flat list.
// No local computation. No mutations. No polling.
// Phase 1.8: lifecycle-aware empty-state copy.

import * as vscode from 'vscode';
import { VedaClient } from '../services/vedaClient';
import { StateService } from '../services/stateService';
import { AlertItem, AlertListResponse } from '../types/alert';

// ── Lifecycle helper ──────────────────────────────────────────────────────────

/**
 * Return an empty-state message for the alerts view, tuned to the project's
 * lifecycle state when available. All values come from the backend — no local
 * lifecycle inference.
 */
function alertsEmptyMessage(lifecycleState: string | undefined): string {
  const s = (lifecycleState ?? '').toLowerCase();
  if (s === 'observing' || s === 'new') {
    return 'No alerts yet — continue collecting snapshots.';
  }
  if (s === 'developing' || s === 'active') {
    return 'No alerts in the last 7 days.';
  }
  if (s === 'seasoned' || s === 'mature') {
    return 'No alerts in the last 7 days.';
  }
  return 'No alerts in the last 7 days.';
}

// ── Tree item ─────────────────────────────────────────────────────────────────

export class AlertTreeItem extends vscode.TreeItem {
  constructor(public readonly alert: AlertItem) {
    const label = alert.query ?? `[${alert.triggerType}] rank ${alert.severityRank}`;
    super(label, vscode.TreeItemCollapsibleState.None);

    const score = alert.volatilityScore ?? 0;
    this.iconPath = new vscode.ThemeIcon(
      score >= 70 ? 'warning' : score >= 40 ? 'circle-filled' : 'circle-outline'
    );

    const parts: string[] = [alert.triggerType];
    if (alert.volatilityScore !== undefined) parts.push(`${alert.volatilityScore.toFixed(0)}`);
    if (alert.volatilityRegime) parts.push(alert.volatilityRegime);
    if (alert.maturity) parts.push(alert.maturity);
    this.description = parts.join(' · ');
    this.tooltip = [
      `Query: ${alert.query ?? '—'}`,
      `Type: ${alert.triggerType}`,
      alert.volatilityScore !== undefined ? `Volatility: ${alert.volatilityScore.toFixed(0)}` : '',
      alert.volatilityRegime ? `Regime: ${alert.volatilityRegime}` : '',
      alert.maturity ? `Maturity: ${alert.maturity}` : '',
    ].filter(Boolean).join('\n');

    this.contextValue = 'alertItem';

    if (alert.keywordTargetId) {
      this.command = {
        command: 'veda.alertItemSelected',
        title: 'Open Alert Detail',
        arguments: [this],
      };
    }
  }
}

// ── Provider ──────────────────────────────────────────────────────────────────

export class AlertsProvider implements vscode.TreeDataProvider<AlertTreeItem> {
  public static readonly VIEW_ID = 'veda.topAlerts';

  private _items: AlertTreeItem[] = [];
  private _loading = false;
  private _loaded = false;
  private _view?: vscode.TreeView<AlertTreeItem>;

  private readonly _onDidChangeTreeData =
    new vscode.EventEmitter<AlertTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _stateDisposable: vscode.Disposable;

  constructor(
    private readonly client: VedaClient,
    private readonly state: StateService
  ) {
    this._stateDisposable = state.onStateChange(() => {
      this._items = [];
      this._loaded = false;
      this._onDidChangeTreeData.fire();
      this._load();
    });
  }

  /** Call once after createTreeView to enable message + badge updates. */
  setView(view: vscode.TreeView<AlertTreeItem>): void {
    this._view = view;
  }

  dispose(): void {
    this._stateDisposable.dispose();
    this._onDidChangeTreeData.dispose();
  }

  refresh(): void {
    this._items = [];
    this._loaded = false;
    this._onDidChangeTreeData.fire();
    this._load();
  }

  getTreeItem(element: AlertTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): vscode.ProviderResult<AlertTreeItem[]> {
    const lifecycle = this.state.activeProject?.lifecycleState;

    if (!this.state.activeProject) {
      this._setMessage('Select a project to view alerts.');
      this._setBadge(undefined);
      return [];
    }
    if (this._loading) {
      this._setMessage('Loading alerts…');
      this._setBadge(undefined);
      return [];
    }
    if (this._loaded && this._items.length === 0) {
      this._setMessage(alertsEmptyMessage(lifecycle));
      this._setBadge(undefined);
      return [];
    }
    this._setMessage(undefined);
    return this._items;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _setMessage(msg: string | undefined): void {
    if (this._view) this._view.message = msg;
  }

  private _setBadge(count: number | undefined): void {
    if (!this._view) return;
    this._view.badge = count !== undefined
      ? { tooltip: `${count} alert${count === 1 ? '' : 's'}`, value: count }
      : undefined;
  }

  private async _load(): Promise<void> {
    if (!this.state.activeProject) return;
    this._loading = true;
    this._onDidChangeTreeData.fire(); // trigger getChildren → shows "Loading…"

    try {
      const res = await this.client.listAlerts(7, 20) as AlertListResponse;
      const raw: AlertItem[] = res?.data?.items ?? [];
      this._items = raw.map(a => new AlertTreeItem(a));
      this._loaded = true;
      this._setBadge(this._items.length > 0 ? this._items.length : undefined);
    } catch {
      // Load failure reported in-view via message — no toast needed.
      this._items = [];
      this._loaded = true;
      this._setMessage('Top Alerts — could not load. Check that the VEDA environment is reachable and a project is active.');
      this._setBadge(undefined);
    } finally {
      this._loading = false;
      this._onDidChangeTreeData.fire();
    }
  }
}
