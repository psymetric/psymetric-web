// ─── commands/selectProject.ts ───────────────────────────────────────────────

import * as vscode from 'vscode';
import { VedaClient } from '../services/vedaClient';
import { StateService } from '../services/stateService';
import { ProjectContextProvider } from '../providers/projectContextProvider';
import { ProjectListResponse, Project } from '../types/project';
import { showApiError } from '../utils/errors';

export async function selectProject(
  client: VedaClient,
  state: StateService,
  provider: ProjectContextProvider
): Promise<void> {
  let projects: Project[];

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'VEDA: Loading projects…', cancellable: false },
    async () => {
      try {
        const res = await client.listProjects() as ProjectListResponse;
        projects = res?.data?.items ?? [];
      } catch (err) {
        showApiError('Select Project', err);
        projects = [];
      }
    }
  );

  if (projects!.length === 0) {
    vscode.window.showWarningMessage(
      'VEDA: No projects found. Ensure the VEDA environment is reachable and a project exists.'
    );
    return;
  }

  state.setProjectList(projects!);

  const current = state.activeProject;

  const picked = await vscode.window.showQuickPick(
    projects!.map(p => ({
      label: p.name,
      description: p.slug,
      detail: p.domain ?? '',
      project: p,
    })),
    {
      title: 'VEDA: Select Project',
      placeHolder: 'Choose a project to activate',
      matchOnDescription: true,
      matchOnDetail: true,
    }
  );

  if (!picked) return;

  const selected = picked.project;

  // If the project changed, close the stale results panel
  if (current && current.id !== selected.id) {
    const panel = state.openPanel;
    if (panel) {
      panel.dispose();
      state.setOpenPanel(null);
    }
  }

  state.setActiveProject(selected);
  provider.refresh();

  vscode.window.showInformationMessage(`VEDA: Active project set to "${selected.name}"`);
}
