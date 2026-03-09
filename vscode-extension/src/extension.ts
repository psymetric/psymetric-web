// ─── extension.ts ────────────────────────────────────────────────────────────
//
// Entry point. Wires services, registers the sidebar view provider,
// creates the status bar item, and delegates command registration.

import * as vscode from 'vscode';
import { ConfigService } from './services/configService';
import { StateService } from './services/stateService';
import { VedaClient } from './services/vedaClient';
import { ProjectContextProvider } from './providers/projectContextProvider';
import { ResultsPanel } from './views/resultsPanel';
import { registerCommands } from './registerCommands';

export function activate(context: vscode.ExtensionContext): void {
  // ── Services ──────────────────────────────────────────────────────────────
  const config  = new ConfigService();
  const state   = new StateService();
  const client  = new VedaClient(config, state);

  // ── Sidebar provider ──────────────────────────────────────────────────────
  const provider = new ProjectContextProvider(state);
  context.subscriptions.push(
    provider, // disposes the state listener on deactivation
    vscode.window.registerWebviewViewProvider(
      ProjectContextProvider.VIEW_ID,
      provider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

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

  // ── Commands ──────────────────────────────────────────────────────────────
  registerCommands(
    context,
    config,
    state,
    client,
    provider,
    resultsPanel,
    statusBarItem
  );

  // ── Config change watcher ─────────────────────────────────────────────────
  // Keep status bar in sync if the user edits settings.json directly.
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('veda.activeEnvironment')) {
        const name = config.getActiveEnvironmentName();
        statusBarItem.text = `$(telescope) VEDA: ${name.toUpperCase()}`;
        provider.refresh();
      }
    })
  );
}

export function deactivate(): void {
  // Nothing to clean up — all disposables are registered via context.subscriptions.
}
