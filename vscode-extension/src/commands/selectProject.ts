// ─── commands/selectProject.ts ───────────────────────────────────────────────

import * as vscode from 'vscode';
import { VedaClient } from '../services/vedaClient';
import { StateService } from '../services/stateService';
import { ProjectContextProvider } from '../providers/projectContextProvider';
import { ProjectListResponse, Project } from '../types/project';
// Relative path (from workspace root) of the local setup doc opened on first-run recovery.
const VEDA_SETUP_DOC_REL = 'docs/specs/VEDA-CREATE-PROJECT-WORKFLOW.md';

export async function selectProject(
  client: VedaClient,
  state: StateService,
  provider: ProjectContextProvider
): Promise<void> {
  let projects: Project[];
  let fetchFailed = false;

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'VEDA: Loading projects…', cancellable: false },
    async () => {
      try {
        const res = await client.listProjects() as ProjectListResponse;
        // Preserve envelope fix: support both res.data (array) and res.data.items (paginated)
        projects = Array.isArray(res?.data)
          ? res.data
          : Array.isArray(res?.data?.items)
            ? res.data.items
            : [];
      } catch (err) {
        // Do not call showApiError here — the fetch-failure branch below emits the single
        // operator-facing message.  Stacking two notifications for the same failure is noisy.
        void err;
        fetchFailed = true;
        projects = [];
      }
    }
  );

  if (projects!.length === 0) {
    if (fetchFailed) {
      // Environment unreachable — connectivity problem, not a missing project.
      const envName = vscode.workspace.getConfiguration('veda').get<string>('activeEnvironment') ?? 'local';
      vscode.window.showErrorMessage(
        `VEDA: Could not reach the ${envName.toUpperCase()} environment. Check that the server is running and the base URL is correct.`,
        'Switch Environment'
      ).then(action => {
        if (action === 'Switch Environment') {
          vscode.commands.executeCommand('veda.switchEnvironment');
        }
      });
    } else {
      // Environment reachable but no projects exist — first-run / setup state.
      // Attempt to open the local workspace copy of the setup doc inside VS Code.
      const folders = vscode.workspace.workspaceFolders;
      const docOpened = await (async () => {
        if (!folders || folders.length === 0) return false;
        try {
          const docUri = vscode.Uri.joinPath(folders[0].uri, VEDA_SETUP_DOC_REL);
          const doc = await vscode.workspace.openTextDocument(docUri);
          await vscode.window.showTextDocument(doc, { preview: true });
          return true;
        } catch {
          return false;
        }
      })();

      if (docOpened) {
        vscode.window.showWarningMessage(
          'VEDA: No projects found. See the setup doc now open in the editor to create your first project.'
        );
      } else {
        // Fallback: workspace not open or doc not found — give the operator a clear pointer.
        vscode.window.showWarningMessage(
          `VEDA: No projects found. Open ${VEDA_SETUP_DOC_REL} in this repo for project setup instructions.`
        );
      }
    }
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
