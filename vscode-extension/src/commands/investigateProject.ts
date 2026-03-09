// ─── commands/investigateProject.ts ──────────────────────────────────────────

import * as vscode from 'vscode';
import { VedaClient } from '../services/vedaClient';
import { StateService } from '../services/stateService';
import { ResultsPanel } from '../views/resultsPanel';
import { showApiError } from '../utils/errors';

export async function investigateProject(
  client: VedaClient,
  state: StateService,
  panel: ResultsPanel
): Promise<void> {
  const project = state.activeProject;

  if (!project) {
    vscode.window.showWarningMessage(
      'VEDA: No active project. Run "VEDA: Select Project" first.'
    );
    return;
  }

  let data: unknown;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `VEDA: Investigating "${project.name}"…`,
      cancellable: false,
    },
    async () => {
      try {
        // Orchestrate the four observatory surfaces that compose a project
        // investigation. Transport stays generic; flow decisions live here.
        const [summary, alerts, risk, reasoning] = await Promise.all([
          client.get('/api/seo/volatility-summary'),
          client.get('/api/seo/volatility-alerts?limit=10'),
          client.get('/api/seo/risk-attribution-summary'),
          client.get('/api/seo/operator-reasoning'),
        ]);
        data = { summary, alerts, risk, reasoning };
      } catch (err) {
        showApiError('Investigate Project', err);
        data = null;
      }
    }
  );

  if (!data) return;

  panel.showInvestigation(`Investigation — ${project.name}`, data);
}
