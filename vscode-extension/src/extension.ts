// ─── extension.ts ────────────────────────────────────────────────────────────
//
// Entry point. Wires services, registers the sidebar view provider,
// creates the status bar item, and delegates command registration.

import * as vscode from 'vscode';
import { ConfigService } from './services/configService';
import { StateService } from './services/stateService';
import { VedaClient } from './services/vedaClient';
import { ProjectContextProvider } from './providers/projectContextProvider';
import { EditorContextProvider } from './providers/editorContextProvider';
import { InvestigationSummaryProvider } from './providers/investigationSummaryProvider';
import { AlertsProvider, AlertTreeItem } from './providers/alertsProvider';
import { KeywordsProvider, KeywordTreeItem } from './providers/keywordsProvider';
import { RecentPageWorkflowProvider, RecentWorkflowTreeItem } from './providers/recentPageWorkflowProvider';
import { SerpObservatoryProvider } from './providers/serpObservatoryProvider';
import { VedaBrainProvider } from './providers/vedaBrainProvider';
import { PageWorkflowMemory } from './services/pageWorkflowMemory';
import { ResultsPanel } from './views/resultsPanel';
import { registerCommands } from './registerCommands';
import { updateStatusBar } from './commands/switchEnvironment';

export function activate(context: vscode.ExtensionContext): void {
  // ── Services ──────────────────────────────────────────────────────────────
  const config  = new ConfigService();
  const state   = new StateService();
  const client  = new VedaClient(config, state);

  // ── Project Context sidebar view ──────────────────────────────────────────
  const provider = new ProjectContextProvider(state);
  context.subscriptions.push(
    provider,
    vscode.window.registerWebviewViewProvider(
      ProjectContextProvider.VIEW_ID,
      provider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  // ── Editor Context sidebar view ───────────────────────────────────────────
  // EditorContextProvider registers its own onDidChangeActiveTextEditor listener
  // via context.subscriptions inside its constructor.
  const editorContextProvider = new EditorContextProvider(context);
  context.subscriptions.push(
    editorContextProvider,
    vscode.window.registerWebviewViewProvider(
      EditorContextProvider.VIEW_ID,
      editorContextProvider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  // ── Investigation Summary tree view ───────────────────────────────────────
  const summaryProvider = new InvestigationSummaryProvider(client, state);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const summaryView = vscode.window.createTreeView<any>(InvestigationSummaryProvider.VIEW_ID, {
    treeDataProvider: summaryProvider,
    showCollapseAll: false,
  });
  summaryProvider.setView(summaryView);
  context.subscriptions.push(summaryProvider, summaryView);

  // ── Top Alerts tree view ──────────────────────────────────────────────────
  const alertsProvider = new AlertsProvider(client, state);
  const alertsView: vscode.TreeView<AlertTreeItem> = vscode.window.createTreeView(
    AlertsProvider.VIEW_ID,
    { treeDataProvider: alertsProvider, showCollapseAll: false }
  );
  alertsProvider.setView(alertsView);
  context.subscriptions.push(alertsProvider, alertsView);

  // ── Keywords tree view ────────────────────────────────────────────────────
  const keywordsProvider = new KeywordsProvider(client, state);
  const keywordsView: vscode.TreeView<KeywordTreeItem> = vscode.window.createTreeView(
    KeywordsProvider.VIEW_ID,
    { treeDataProvider: keywordsProvider, showCollapseAll: false }
  );
  keywordsProvider.setView(keywordsView);
  context.subscriptions.push(keywordsProvider, keywordsView);

  // ── Page workflow memory + recent view ────────────────────────────────────
  const workflowMemory   = new PageWorkflowMemory();
  const workflowProvider = new RecentPageWorkflowProvider(workflowMemory, state);
  const workflowView: vscode.TreeView<RecentWorkflowTreeItem> = vscode.window.createTreeView(
    RecentPageWorkflowProvider.VIEW_ID,
    { treeDataProvider: workflowProvider, showCollapseAll: false }
  );
  workflowProvider.setView(workflowView);
  context.subscriptions.push(workflowProvider, workflowView);

  // ── Results panel factory ─────────────────────────────────────────────────
  const resultsPanel = new ResultsPanel(context, state);

  // ── Status bar item ───────────────────────────────────────────────────────
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBarItem.command = 'veda.switchEnvironment';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // ── Initial status bar render ─────────────────────────────────────────────
  updateStatusBar(statusBarItem, config.getActiveEnvironmentName(), null, config.getBaseUrl());

  // ── Editor change → stale page-context panel detection ───────────────────
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      // Normalise to workspace-relative path when possible, else absolute.
      if (!editor || editor.document.uri.scheme !== 'file') {
        resultsPanel.notifyEditorChanged(null);
        return;
      }
      const fsPath = editor.document.uri.fsPath;
      const folders = vscode.workspace.workspaceFolders;
      let relPath: string | null = null;
      if (folders) {
        for (const folder of folders) {
          if (fsPath.startsWith(folder.uri.fsPath)) {
            relPath = fsPath.slice(folder.uri.fsPath.length + 1);
            break;
          }
        }
      }
      resultsPanel.notifyEditorChanged(relPath ?? fsPath);
    })
  );

  // ── State change → status bar + results panel stale check ────────────────
  context.subscriptions.push(
    state.onStateChange(() => {
      const envName = config.getActiveEnvironmentName();
      const projectName = state.activeProject?.name ?? null;
      updateStatusBar(statusBarItem, envName, projectName, config.getBaseUrl());
      resultsPanel.notifyProjectChanged();
    })
  );

  // ── SERP Observatory sidebar view ──────────────────────────────────────────
  const serpObservatoryProvider = new SerpObservatoryProvider(client, state);
  context.subscriptions.push(
    serpObservatoryProvider,
    vscode.window.registerWebviewViewProvider(
      SerpObservatoryProvider.VIEW_ID,
      serpObservatoryProvider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  // ── VEDA Brain sidebar view ────────────────────────────────────────────────
  const vedaBrainProvider = new VedaBrainProvider(client, state);
  context.subscriptions.push(
    vedaBrainProvider,
    vscode.window.registerWebviewViewProvider(
      VedaBrainProvider.VIEW_ID,
      vedaBrainProvider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  // ── Commands ──────────────────────────────────────────────────────────────
  registerCommands(
    context,
    config,
    state,
    client,
    provider,
    editorContextProvider,
    summaryProvider,
    alertsProvider,
    keywordsProvider,
    resultsPanel,
    statusBarItem,
    workflowMemory,
    workflowProvider,
    serpObservatoryProvider,
    vedaBrainProvider
  );

  // ── Config change watcher ─────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('veda.activeEnvironment')) {
        const envName = config.getActiveEnvironmentName();
        updateStatusBar(statusBarItem, envName, state.activeProject?.name ?? null);
        provider.refresh();
      }
    })
  );
}

export function deactivate(): void {
  // Nothing to clean up — all disposables are registered via context.subscriptions.
}
