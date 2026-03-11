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
import { VedaBrainProvider } from './providers/vedaBrainProvider';
import { PageWorkflowMemory, RecentWorkflowEntry } from './services/pageWorkflowMemory';
import { ResultsPanel } from './views/resultsPanel';

import { switchEnvironment, updateStatusBar } from './commands/switchEnvironment';
import { selectProject } from './commands/selectProject';
import { refreshContext } from './commands/refreshContext';

// ── Local doc paths (relative to workspace root) ────────────────────────────
const VEDA_BLUEPRINT_DOC_REL = 'docs/specs/PROJECT-BLUEPRINT-SPEC.md';
const VEDA_SETUP_DOC_REL     = 'docs/specs/VEDA-CREATE-PROJECT-WORKFLOW.md';
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
  serpObservatoryProvider: SerpObservatoryProvider,
  vedaBrainProvider: VedaBrainProvider
): void {
  updateStatusBar(statusBarItem, config.getActiveEnvironmentName(), state.activeProject?.name ?? null, config.getBaseUrl());

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

    // ── Setup + Blueprint workflow discoverability ────────────────────────────
    //
    // Two paired commands open the two primary setup workflow docs from the
    // local workspace. Both mirror the same open-doc pattern:
    //   - veda.openProjectSetupWorkflow  → VEDA-CREATE-PROJECT-WORKFLOW.md
    //   - veda.openProjectBlueprintWorkflow → PROJECT-BLUEPRINT-SPEC.md
    // Falls back to a clear pointer message if the workspace root cannot be resolved.

    vscode.commands.registerCommand('veda.openProjectSetupWorkflow', async () => {
      const folders = vscode.workspace.workspaceFolders;
      if (folders && folders.length > 0) {
        try {
          const docUri = vscode.Uri.joinPath(folders[0].uri, VEDA_SETUP_DOC_REL);
          const doc = await vscode.workspace.openTextDocument(docUri);
          await vscode.window.showTextDocument(doc, { preview: false });
          vscode.window.showInformationMessage(
            'VEDA: Setup workflow is open — follow the steps to create a project container, then run VEDA: Open Project Blueprint Workflow to draft the blueprint.'
          );
          return;
        } catch {
          // Fall through to informational message below.
        }
      }
      vscode.window.showInformationMessage(
        `VEDA: Open ${VEDA_SETUP_DOC_REL} in this repo to begin the project setup workflow.`
      );
    }),

    vscode.commands.registerCommand('veda.openProjectBlueprintWorkflow', async () => {
      const folders = vscode.workspace.workspaceFolders;
      if (folders && folders.length > 0) {
        try {
          const docUri = vscode.Uri.joinPath(folders[0].uri, VEDA_BLUEPRINT_DOC_REL);
          const doc = await vscode.workspace.openTextDocument(docUri);
          await vscode.window.showTextDocument(doc, { preview: false });
          vscode.window.showInformationMessage(
            'VEDA: Blueprint spec is open — if no project exists yet, start at Step 1 (Create Project Container). If a project is already created, proceed to Step 2 (Draft Blueprint).'
          );
          return;
        } catch {
          // Fall through to informational message below.
        }
      }
      vscode.window.showInformationMessage(
        `VEDA: Open ${VEDA_BLUEPRINT_DOC_REL} in this repo to review the blueprint workflow spec.`
      );
    }),

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

    // ── VEDA Brain refresh ─────────────────────────────────────────────────

    vscode.commands.registerCommand('veda.refreshVedaBrain', () => {
      vedaBrainProvider.refresh();
    }),

    // ── Proposal discoverability ───────────────────────────────────────────────────────────
    //
    // Navigates the operator to the Proposals section in the VEDA Brain panel.
    // Proposals are fetched alongside Brain diagnostics and displayed in the
    // Brain panel's Proposals section. This command ensures palette discoverability.

    vscode.commands.registerCommand('veda.viewProposals', async () => {
      if (!state.activeProject) {
        vscode.window.showInformationMessage(
          'VEDA: Select a project first, then run VEDA: View Proposals.'
        );
        return;
      }
      // Reveal the Brain panel (which loads proposals alongside diagnostics)
      // and hint the operator where to look.
      await vscode.commands.executeCommand('veda.vedaBrain.focus');
      vscode.window.showInformationMessage(
        'VEDA: Proposals are in the Brain panel \u2014 scroll to the Proposals section or use the nav pill.'
      );
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
    }),

    // ── Brain → Page Command Center cross-panel linking ──────────────────────

    vscode.commands.registerCommand(
      'veda.brainOpenPageCommandCenter',
      async (pageUrl: string) => {
        if (!state.activeProject) {
          vscode.window.showInformationMessage('VEDA: Select a project first.');
          return;
        }

        // Extract route path from full URL for routeHint
        let routeHint: string;
        try {
          const parsed = new URL(pageUrl);
          routeHint = parsed.pathname || '/';
        } catch {
          routeHint = pageUrl;
        }

        let packet: unknown;
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `VEDA: Opening Page Command Center for ${routeHint}…`,
            cancellable: false,
          },
          async () => {
            try {
              packet = await client.getPageCommandCenter({ routeHint });
            } catch (err) {
              showApiError('Brain → Page Command Center', err);
              packet = null;
            }
          }
        );

        // Build a synthetic FileContext for the results panel
        const syntheticCtx = {
          fileName:       routeHint.split('/').pop() || 'index',
          workspacePath:  null,
          routeHint,
          relevance:      'route-page' as const,
          relevanceLabel: 'Route page (from Brain)',
        };

        const pkt = packet && typeof packet === 'object' && 'data' in (packet as Record<string, unknown>)
          ? (packet as Record<string, unknown>).data as import('./types/pageCommandCenter').PageCommandCenterPacket
          : packet === null ? null : undefined;

        resultsPanel.showPageContext(
          `Page: ${routeHint}`,
          syntheticCtx,
          pkt,
          [],
          false,
          true  // openedFromBrain
        );
      }
    )
  );
}
