// ─── commands/switchEnvironment.ts ───────────────────────────────────────────

import * as vscode from 'vscode';
import { ConfigService } from '../services/configService';
import { StateService } from '../services/stateService';
import { ProjectContextProvider } from '../providers/projectContextProvider';

export async function switchEnvironment(
  config: ConfigService,
  state: StateService,
  provider: ProjectContextProvider,
  statusBarItem: vscode.StatusBarItem
): Promise<void> {
  const names = config.getEnvironmentNames();

  if (names.length === 0) {
    vscode.window.showWarningMessage(
      'No VEDA environments configured. Add them in Settings under "veda.environments".'
    );
    return;
  }

  const current = config.getActiveEnvironmentName();

  const picked = await vscode.window.showQuickPick(
    names.map(name => ({
      label: name.toUpperCase(),
      description: name === current ? '(active)' : '',
      detail: config.getEnvironments()[name]?.baseUrl ?? '',
    })),
    { title: 'VEDA: Switch Environment', placeHolder: 'Select an environment' }
  );

  if (!picked) return;

  const selectedName = picked.label.toLowerCase();
  await config.setActiveEnvironment(selectedName);

  // Clear stale project state when environment changes
  state.setActiveProject(null);

  const newBaseUrl = config.getBaseUrl();
  updateStatusBar(statusBarItem, selectedName, null, newBaseUrl);
  provider.refresh();

  const urlDisplay = newBaseUrl ?? '(no base URL configured)';
  vscode.window.showInformationMessage(
    `VEDA environment switched to ${selectedName.toUpperCase()} — ${urlDisplay}`
  );
}

/**
 * Update the status bar item text.
 * Format: "⟨telescope⟩ VEDA: ENV | Project Name" (project truncated at 24 chars).
 * If no project is active, shows env only.
 * @param baseUrl Optional base URL shown in the tooltip for environment clarity.
 */
export function updateStatusBar(
  item: vscode.StatusBarItem,
  envName: string,
  projectName: string | null,
  baseUrl?: string | null
): void {
  const env = envName.toUpperCase();
  const urlSuffix = baseUrl ? ` (${baseUrl})` : '';
  if (projectName) {
    const truncated = projectName.length > 24
      ? projectName.slice(0, 22) + '…'
      : projectName;
    item.text = `$(telescope) VEDA: ${env} | ${truncated}`;
    item.tooltip = `VEDA Observatory — ${env}${urlSuffix} · ${projectName}. Click to switch environment.`;
  } else {
    item.text = `$(telescope) VEDA: ${env}`;
    item.tooltip = `VEDA Observatory — ${env}${urlSuffix}. Click to switch environment.`;
  }
}
