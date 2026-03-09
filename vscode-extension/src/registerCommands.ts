// ─── registerCommands.ts ─────────────────────────────────────────────────────

import * as vscode from 'vscode';
import { ConfigService } from './services/configService';
import { StateService } from './services/stateService';
import { VedaClient } from './services/vedaClient';
import { ProjectContextProvider } from './providers/projectContextProvider';
import { ResultsPanel } from './views/resultsPanel';

import { switchEnvironment, updateStatusBar } from './commands/switchEnvironment';
import { selectProject } from './commands/selectProject';
import { refreshContext } from './commands/refreshContext';
import { investigateProject } from './commands/investigateProject';
import { keywordDiagnostic } from './commands/keywordDiagnostic';

export function registerCommands(
  context: vscode.ExtensionContext,
  config: ConfigService,
  state: StateService,
  client: VedaClient,
  provider: ProjectContextProvider,
  resultsPanel: ResultsPanel,
  statusBarItem: vscode.StatusBarItem
): void {
  // Initialise status bar label
  updateStatusBar(statusBarItem, config.getActiveEnvironmentName());

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

    vscode.commands.registerCommand('veda.keywordDiagnostic', () =>
      keywordDiagnostic(client, state, resultsPanel)
    )
  );
}
