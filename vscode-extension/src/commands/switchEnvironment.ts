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

  updateStatusBar(statusBarItem, selectedName);
  provider.refresh();

  vscode.window.showInformationMessage(`VEDA environment switched to: ${selectedName.toUpperCase()}`);
}

export function updateStatusBar(item: vscode.StatusBarItem, envName: string): void {
  item.text = `$(telescope) VEDA: ${envName.toUpperCase()}`;
  item.tooltip = `VEDA Observatory — ${envName} environment. Click to switch.`;
}
