// ─── registerCommands.ts ─────────────────────────────────────────────────────

import * as vscode from 'vscode';
import { ConfigService } from './services/configService';
import { StateService } from './services/stateService';
import { VedaClient } from './services/vedaClient';
import { ProjectContextProvider } from './providers/projectContextProvider';
import { EditorContextProvider } from './providers/editorContextProvider';
import { InvestigationSummaryProvider } from './providers/investigationSummaryProvider';
import { AlertsProvider, AlertTreeItem } from './providers/alertsProvider';
import { KeywordsProvider, KeywordTreeItem } from './providers/keywordsProvider';
import { RecentPageWorkflowProvider } from './providers/recentPageWorkflowProvider';
import { SerpObservatoryProvider } from './providers/serpObservatoryProvider';
import { PageWorkflowMemory, RecentWorkflowEntry } from './services/pageWorkflowMemory';
import { ResultsPanel } from './views/resultsPanel';

import { switchEnvironment, updateStatusBar } from './commands/switchEnvironment';
import { selectProject } from './commands/selectProject';
import { refreshContext } from './commands/refreshContext';
import { investigateProject } from './commands/investigateProject';
import { investigateCurrentPage } from './commands/investigateCurrentPage';
import { pageKeywordDiagnostic } from './commands/pageKeywordDiagnostic';
import { keywordDiagnostic } from './commands/keywordDiagnostic';
import { deriveFileContext } from './utils/pageHeuristics';
import { showApiError } from './utils/errors';

export function registerCommands(
  context: vscode.ExtensionContext,
  config: ConfigService,
  state: StateService,
  client: VedaClient,
  provider: ProjectContextProvider,
  editorContextProvider: EditorContextProvider,
  summaryProvider: InvestigationSummaryProvider,
  alertsProvider: AlertsProvider,
  keywordsProvider: KeywordsProvider,
  resultsPanel: ResultsPanel,
  statusBarItem: vscode.StatusBarItem,
  memory: PageWorkflowMemory,
  workflowProvider: RecentPageWorkflowProvider,
  serpObservatoryProvider: SerpObservatoryProvider
): void {
  updateStatusBar(statusBarItem, config.getActiveEnvironmentName(), state.activeProject?.name ?? null);

  context.subscriptions.push(
    vscode.commands.registerCommand('veda.switchEnvironment', () =>
      switchEnvironment(config, state, provider, statusBarItem)
    ),

    vscode.commands.registerCommand('veda.selectProject', () =>
      selectProject(client, state, provider)
    ),

    vscode.commands.registerCommand('veda.refreshContext', () =>
      refreshContext(provider)
    ),

    vscode.commands.registerCommand('veda.investigateProject', () =>
      investigateProject(client, state, resultsPanel)
    ),

    vscode.commands.registerCommand('veda.investigateCurrentPage', () =>
      investigateCurrentPage(client, state, resultsPanel, memory, workflowProvider)
    ),

    // ── Risk keyword or route-match → keyword diagnostic with page-origin ───

    vscode.commands.registerCommand(
      'veda.riskKeywordFromPageContext',
      async (keywordTargetId: string, query: string) => {
        // Capture page origin from the current editor at click time.
        const editor = vscode.window.activeTextEditor;
        const pageOrigin = editor && editor.document.uri.scheme === 'file'
          ? deriveFileContext(editor.document.uri.fsPath, vscode.workspace.workspaceFolders)
          : undefined;

        let data: unknown;
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `VEDA: Diagnosing "${query}"…`,
            cancellable: false,
          },
          async () => {
            try {
              data = await client.getKeywordDiagnostic(keywordTargetId);
            } catch (err) {
              showApiError('Risk Keyword Diagnostic', err);
              data = null;
            }
          }
        );
        if (!data) return;

        // Record in session memory.
        if (pageOrigin) {
          memory.add({
            type:            'page-keyword',
            fileName:        pageOrigin.fileName,
            workspacePath:   pageOrigin.workspacePath ?? null,
            routeHint:       pageOrigin.routeHint ?? null,
            keywordQuery:    query,
            keywordTargetId: keywordTargetId,
          });
          workflowProvider.refresh();
        }

        resultsPanel.showKeywordDiagnostic(
          `Keyword: ${query}`,
          data,
          'VEDA: Page → Risk Keyword Diagnostic',
          pageOrigin
        );
      }
    ),

    vscode.commands.registerCommand('veda.pageKeywordDiagnostic', () =>
      pageKeywordDiagnostic(client, state, resultsPanel, memory, workflowProvider)
    ),

    vscode.commands.registerCommand('veda.keywordDiagnostic', () =>
      keywordDiagnostic(client, state, resultsPanel)
    ),

    // ── Replay a recent workflow entry ────────────────────────────────────────

    vscode.commands.registerCommand(
      'veda.replayWorkflowEntry',
      async (entry: RecentWorkflowEntry) => {
        if (entry.type === 'page-keyword' && entry.keywordTargetId && entry.keywordQuery) {
          // Replay keyword diagnostic with page-origin framing reconstructed from entry.
          let data: unknown;
          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: `VEDA: Diagnosing "${entry.keywordQuery}"…`,
              cancellable: false,
            },
            async () => {
              try {
                data = await client.getKeywordDiagnostic(entry.keywordTargetId!);
              } catch (err) {
                showApiError('Replay Keyword Diagnostic', err);
                data = null;
              }
            }
          );
          if (!data) return;

          // Reconstruct a lightweight page origin from stored entry fields.
          const pageOrigin = {
            fileName:       entry.fileName,
            workspacePath:  entry.workspacePath ?? null,
            routeHint:      entry.routeHint ?? null,
            relevance:      'route-page' as const,
            relevanceLabel: 'Route page',
          };

          // Bump timestamp in memory on replay.
          memory.add({
            type:            'page-keyword',
            fileName:        entry.fileName,
            workspacePath:   entry.workspacePath,
            routeHint:       entry.routeHint,
            keywordQuery:    entry.keywordQuery,
            keywordTargetId: entry.keywordTargetId,
          });
          workflowProvider.refresh();

          resultsPanel.showKeywordDiagnostic(
            `Keyword: ${entry.keywordQuery}`,
            data,
            'VEDA: Page → Keyword Diagnostic',
            pageOrigin
          );
        } else {
          // Replay page-context entry: reconstruct a FileContext from stored fields
          // and render the page panel with isReplayed=true so the operator knows
          // they are viewing historical context, not the live active editor.
          const replayCtx = {
            fileName:       entry.fileName,
            workspacePath:  entry.workspacePath ?? null,
            routeHint:      entry.routeHint ?? null,
            relevance:      'route-page' as const,
            relevanceLabel: 'Route page (replayed)',
          };

          // Bump timestamp in memory on replay.
          memory.add({
            type:            'page-context',
            fileName:        entry.fileName,
            workspacePath:   entry.workspacePath,
            routeHint:       entry.routeHint,
            keywordQuery:    null,
            keywordTargetId: null,
          });
          workflowProvider.refresh();

          const recentEntries = memory.getRecent(3);

          resultsPanel.showPageContext(
            `Page Context (replayed): ${entry.routeHint ?? entry.fileName}`,
            replayCtx,
            undefined, // packet not re-fetched on replay
            recentEntries,
            true        // isReplayed
          );
        }
      }
    ),

    // ── Investigation Summary keyword click → keyword diagnostic ─────────────

    vscode.commands.registerCommand(
      'veda.summaryKeywordDiagnostic',
      async (query: string, keywordTargetId: string) => {
        // Capture page origin from current editor if it's a page file.
        const editor = vscode.window.activeTextEditor;
        const pageOrigin = editor && editor.document.uri.scheme === 'file'
          ? deriveFileContext(editor.document.uri.fsPath, vscode.workspace.workspaceFolders)
          : undefined;

        // Only attach page origin if the active file is actually page-relevant.
        const effectiveOrigin = pageOrigin && pageOrigin.relevance !== 'non-page'
          ? pageOrigin
          : undefined;

        let data: unknown;
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `VEDA: Diagnosing "${query}"…`,
            cancellable: false,
          },
          async () => {
            try {
              data = await client.getKeywordDiagnostic(keywordTargetId);
            } catch (err) {
              showApiError('Summary Keyword Diagnostic', err);
              data = null;
            }
          }
        );
        if (!data) return;

        // Record in memory if page-aware.
        if (effectiveOrigin) {
          memory.add({
            type:            'page-keyword',
            fileName:        effectiveOrigin.fileName,
            workspacePath:   effectiveOrigin.workspacePath ?? null,
            routeHint:       effectiveOrigin.routeHint ?? null,
            keywordQuery:    query,
            keywordTargetId: keywordTargetId,
          });
          workflowProvider.refresh();
        }

        resultsPanel.showKeywordDiagnostic(
          `Keyword: ${query}`,
          data,
          effectiveOrigin ? 'VEDA: Page → Summary Keyword Diagnostic' : 'VEDA: Summary Keyword Diagnostic',
          effectiveOrigin
        );
      }
    ),

    // ── Editor Context ─────────────────────────────────────────────────────

    vscode.commands.registerCommand('veda.refreshEditorContext', () => {
      editorContextProvider.refresh();
    }),

    // ── Investigation Summary / Alerts / Keywords ──────────────────────────

    vscode.commands.registerCommand('veda.refreshSummary', () => {
      summaryProvider.refresh();
    }),

    vscode.commands.registerCommand('veda.refreshAlerts', () => {
      alertsProvider.refresh();
    }),

    vscode.commands.registerCommand('veda.refreshKeywords', () => {
      keywordsProvider.refresh();
    }),

    vscode.commands.registerCommand('veda.refreshSerpObservatory', () => {
      serpObservatoryProvider.refresh();
    }),

    // Fired when an alert item is clicked in the tree view.
    vscode.commands.registerCommand('veda.alertItemSelected', async (item: AlertTreeItem) => {
      if (!item.alert.keywordTargetId) return;
      let data: unknown;
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `VEDA: Loading diagnostic for "${item.alert.query ?? item.alert.keywordTargetId}"…`,
          cancellable: false,
        },
        async () => {
          try {
            data = await client.getKeywordDiagnostic(item.alert.keywordTargetId!);
          } catch (err) {
            showApiError('Alert Detail', err);
            data = null;
          }
        }
      );
      if (!data) return;
      resultsPanel.showKeywordDiagnostic(
        `Keyword: ${item.alert.query ?? item.alert.keywordTargetId}`,
        data,
        'VEDA: Alert Detail'
      );
    }),

    // Fired when a keyword item is clicked in the Keywords tree view.
    vscode.commands.registerCommand('veda.keywordItemSelected', async (item: KeywordTreeItem) => {
      let data: unknown;
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `VEDA: Diagnosing "${item.keyword.query}"…`,
          cancellable: false,
        },
        async () => {
          try {
            data = await client.getKeywordDiagnostic(item.keyword.id);
          } catch (err) {
            showApiError('Keyword Diagnostic', err);
            data = null;
          }
        }
      );
      if (!data) return;
      resultsPanel.showKeywordDiagnostic(`Keyword: ${item.keyword.query}`, data);
    })
  );
}
