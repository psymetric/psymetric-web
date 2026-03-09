// ─── providers/recentPageWorkflowProvider.ts ─────────────────────────────────
//
// TreeDataProvider for the "Recent Page Workflow" sidebar view.
// Reads session-only in-memory entries from PageWorkflowMemory.
// No backend calls. No persistence. No polling.
// Phase: Wave-Continuity.

import * as vscode from 'vscode';
import { PageWorkflowMemory, RecentWorkflowEntry } from '../services/pageWorkflowMemory';
import { StateService } from '../services/stateService';

export class RecentWorkflowTreeItem extends vscode.TreeItem {
  constructor(public readonly entry: RecentWorkflowEntry) {
    // Label: route hint or filename
    const routeLabel = entry.routeHint ?? entry.fileName;

    // Description: keyword query for keyword entries, "page context" for page-only
    const desc = entry.keywordQuery
      ? `→ ${entry.keywordQuery}`
      : '→ page context';

    super(routeLabel, vscode.TreeItemCollapsibleState.None);
    this.description = desc;
    this.tooltip     = _buildTooltip(entry);
    this.iconPath    = new vscode.ThemeIcon(
      entry.type === 'page-keyword' ? 'graph' : 'file-code'
    );
    this.contextValue = 'recentWorkflowItem';

    // Click: replay the entry
    this.command = {
      command:   'veda.replayWorkflowEntry',
      title:     'Replay',
      arguments: [entry],
    };
  }
}

function _buildTooltip(entry: RecentWorkflowEntry): string {
  const lines: string[] = [];
  if (entry.workspacePath) lines.push(entry.workspacePath);
  if (entry.routeHint)    lines.push(`Route: ${entry.routeHint}`);
  if (entry.keywordQuery) lines.push(`Keyword: ${entry.keywordQuery}`);
  const d = new Date(entry.timestamp);
  lines.push(`${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`);
  return lines.join('\n');
}

export class RecentPageWorkflowProvider
  implements vscode.TreeDataProvider<RecentWorkflowTreeItem>
{
  public static readonly VIEW_ID = 'veda.recentPageWorkflow';

  private readonly _onDidChangeTreeData =
    new vscode.EventEmitter<RecentWorkflowTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _view?: vscode.TreeView<any>;

  constructor(
    private readonly memory: PageWorkflowMemory,
    private readonly state:  StateService
  ) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setView(view: vscode.TreeView<any>): void {
    this._view = view;
  }

  /** Call after each memory.add() to refresh the tree. */
  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }

  getTreeItem(element: RecentWorkflowTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): vscode.ProviderResult<RecentWorkflowTreeItem[]> {
    if (!this.state.activeProject) {
      if (this._view) this._view.message = 'Select a project to view page workflows.';
      return [];
    }

    const entries = this.memory.getAll();
    if (entries.length === 0) {
      if (this._view) this._view.message = 'No recent page workflow yet.';
      return [];
    }

    if (this._view) this._view.message = undefined;
    return entries.map(e => new RecentWorkflowTreeItem(e));
  }
}
