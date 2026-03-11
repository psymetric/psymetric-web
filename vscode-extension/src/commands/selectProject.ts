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
      const cfg     = vscode.workspace.getConfiguration('veda');
      const envName = cfg.get<string>('activeEnvironment') ?? 'local';
      const envs    = cfg.get<Record<string, { baseUrl?: string }>>('environments') ?? {};
      const baseUrl = envs[envName]?.baseUrl ?? null;
      const detail  = baseUrl
        ? `Check that the ${envName.toUpperCase()} server is running at ${baseUrl}.`
        : `No base URL is configured for ${envName.toUpperCase()}. Open Settings to set veda.environments.`;
      vscode.window.showErrorMessage(
        `VEDA: Could not reach the ${envName.toUpperCase()} environment. ${detail}`,
        'Switch Environment',
        'Open Settings'
      ).then(action => {
        if (action === 'Switch Environment') {
          vscode.commands.executeCommand('veda.switchEnvironment');
        } else if (action === 'Open Settings') {
          vscode.commands.executeCommand('workbench.action.openSettings', 'veda.environments');
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
          'VEDA: No projects found. The setup workflow is now open — create a project container, then run VEDA: Open Project Blueprint Workflow to draft the blueprint.'
        );
      } else {
        // Fallback: workspace not open or doc not found — offer command palette entry point.
        vscode.window.showWarningMessage(
          'VEDA: No projects found. Run VEDA: Open Project Setup Workflow to open the setup doc, then create a project and run VEDA: Open Project Blueprint Workflow.',
          'Open Setup Workflow'
        ).then(action => {
          if (action === 'Open Setup Workflow') {
            vscode.commands.executeCommand('veda.openProjectSetupWorkflow');
          }
        });
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

  // ── Post-selection lifecycle nudge ────────────────────────────────────────
  //
  // For early-lifecycle states, append a short next-step pointer to the
  // confirmation message so the operator is never left wondering what to do
  // after selecting a project for the first time.
  const lc = (selected.lifecycleState ?? '').toLowerCase();
  if (lc === 'created' || lc === 'draft') {
    vscode.window.showInformationMessage(
      `VEDA: Active project set to "${selected.name}" [${lc.toUpperCase()}]. ` +
      'Next: run VEDA: Open Project Blueprint Workflow to draft the project blueprint.',
      'Open Blueprint'
    ).then(action => {
      if (action === 'Open Blueprint') {
        vscode.commands.executeCommand('veda.openProjectBlueprintWorkflow');
      }
    });
  } else if (lc === 'researching') {
    vscode.window.showInformationMessage(
      `VEDA: Active project set to "${selected.name}" [RESEARCHING]. ` +
      'Next: run VEDA: Keyword Diagnostic to inspect candidate queries and define keyword targets.'
    );
  } else if (lc === 'targeting' || lc === 'observing') {
    vscode.window.showInformationMessage(
      `VEDA: Active project set to "${selected.name}" [${lc.toUpperCase()}]. ` +
      'Next: open SERP Observatory for climate state and alerts, then VEDA Brain for structural diagnostics.'
    );
  } else if (lc === 'developing') {
    vscode.window.showInformationMessage(
      `VEDA: Active project set to "${selected.name}" [DEVELOPING]. ` +
      'Next: open VEDA Brain to track structural gaps, use Page Command Center for per-page actions, and monitor SERP Observatory for climate shifts.'
    );
  } else {
    vscode.window.showInformationMessage(`VEDA: Active project set to "${selected.name}"`);
  }
}
