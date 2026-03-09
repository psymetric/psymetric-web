// ─── providers/keywordsProvider.ts ───────────────────────────────────────────
//
// Read-only TreeDataProvider for Keywords sidebar view.
// Fetches GET /api/seo/keyword-targets?limit=100 and renders a flat list.
// Clicking a keyword item fires the keyword diagnostic flow.
// Phase 1.8: lifecycle-aware empty-state copy.

import * as vscode from 'vscode';
import { VedaClient } from '../services/vedaClient';
import { StateService } from '../services/stateService';
import { KeywordTarget, KeywordTargetListResponse } from '../types/keyword';
import { showApiError } from '../utils/errors';

// ── Lifecycle helper ──────────────────────────────────────────────────────────

/**
 * Return an empty-state message for the keywords view, tuned to lifecycle when
 * available. Only uses fields already returned by the backend.
 */
function keywordsEmptyMessage(lifecycleState: string | undefined): string {
  const s = (lifecycleState ?? '').toLowerCase();
  if (s === 'observing' || s === 'new' || s === 'researching' || s === 'targeting') {
    return 'Add keyword targets to begin observation.';
  }
  return 'No keyword targets yet.';
}

// ── Tree item ─────────────────────────────────────────────────────────────────

export class KeywordTreeItem extends vscode.TreeItem {
  constructor(public readonly keyword: KeywordTarget) {
    super(keyword.query, vscode.TreeItemCollapsibleState.None);

    this.description = `${keyword.locale} · ${keyword.device}`;
    this.tooltip = [
      `Query: ${keyword.query}`,
      `Locale: ${keyword.locale}`,
      `Device: ${keyword.device}`,
      keyword.isPrimary ? 'Primary keyword' : '',
    ].filter(Boolean).join('\n');

    this.iconPath = new vscode.ThemeIcon(keyword.isPrimary ? 'star-full' : 'symbol-keyword');
    this.contextValue = 'keywordItem';

    this.command = {
      command: 'veda.keywordItemSelected',
      title: 'Keyword Diagnostic',
      arguments: [this],
    };
  }
}

// ── Provider ──────────────────────────────────────────────────────────────────

export class KeywordsProvider implements vscode.TreeDataProvider<KeywordTreeItem> {
  public static readonly VIEW_ID = 'veda.keywords';

  private _items: KeywordTreeItem[] = [];
  private _loading = false;
  private _loaded = false;
  private _view?: vscode.TreeView<KeywordTreeItem>;

  private readonly _onDidChangeTreeData =
    new vscode.EventEmitter<KeywordTreeItem | undefined | null | void>();
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
  setView(view: vscode.TreeView<KeywordTreeItem>): void {
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

  getTreeItem(element: KeywordTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): vscode.ProviderResult<KeywordTreeItem[]> {
    const lifecycle = this.state.activeProject?.lifecycleState;

    if (!this.state.activeProject) {
      this._setMessage('Select a project to view keywords.');
      this._setBadge(undefined);
      return [];
    }
    if (this._loading) {
      this._setMessage('Loading keywords…');
      this._setBadge(undefined);
      return [];
    }
    if (this._loaded && this._items.length === 0) {
      this._setMessage(keywordsEmptyMessage(lifecycle));
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
      ? { tooltip: `${count} keyword${count === 1 ? '' : 's'}`, value: count }
      : undefined;
  }

  private async _load(): Promise<void> {
    if (!this.state.activeProject) return;
    this._loading = true;
    this._onDidChangeTreeData.fire(); // trigger getChildren → shows "Loading…"

    try {
      const res = await this.client.listKeywordTargets(100) as KeywordTargetListResponse;
      const raw: KeywordTarget[] = res?.data?.items ?? [];
      this._items = raw.map(k => new KeywordTreeItem(k));
      this._loaded = true;
      this._setBadge(this._items.length > 0 ? this._items.length : undefined);
    } catch (err) {
      showApiError('Keywords', err);
      this._items = [];
      this._loaded = true;
      this._setMessage('Failed to load keywords.');
      this._setBadge(undefined);
    } finally {
      this._loading = false;
      this._onDidChangeTreeData.fire();
    }
  }
}
