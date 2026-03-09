// ─── commands/keywordDiagnostic.ts ───────────────────────────────────────────

import * as vscode from 'vscode';
import { VedaClient } from '../services/vedaClient';
import { StateService } from '../services/stateService';
import { ResultsPanel } from '../views/resultsPanel';
import { KeywordTargetListResponse } from '../types/keyword';
import { showApiError } from '../utils/errors';

export async function keywordDiagnostic(
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

  // ── Step 1: fetch keyword targets ─────────────────────────────────────────
  let keywords: Array<{ id: string; query: string; locale: string; device: string }> = [];

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'VEDA: Loading keyword targets…', cancellable: false },
    async () => {
      try {
        const res = await client.listKeywordTargets(100) as KeywordTargetListResponse;
        keywords = res?.data?.items ?? [];
      } catch (err) {
        showApiError('Keyword Diagnostic', err);
      }
    }
  );

  if (keywords.length === 0) {
    vscode.window.showWarningMessage(
      `VEDA: No keyword targets found for project "${project.name}".`
    );
    return;
  }

  // ── Step 2: let operator choose ───────────────────────────────────────────
  const picked = await vscode.window.showQuickPick(
    keywords.map(k => ({
      label: k.query,
      description: `${k.locale} · ${k.device}`,
      id: k.id,
    })),
    {
      title: 'VEDA: Keyword Diagnostic',
      placeHolder: 'Select a keyword target to diagnose',
      matchOnDescription: true,
    }
  );

  if (!picked) return;

  // ── Step 3: fetch diagnostic packet ──────────────────────────────────────
  let data: unknown;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `VEDA: Diagnosing "${picked.label}"…`,
      cancellable: false,
    },
    async () => {
      try {
        data = await client.getKeywordDiagnostic(picked.id);
      } catch (err) {
        showApiError('Keyword Diagnostic', err);
        data = null;
      }
    }
  );

  if (!data) return;

  panel.showKeywordDiagnostic(`Keyword: ${picked.label}`, data);
}
