// ─── commands/investigateCurrentPage.ts ──────────────────────────────────────
//
// VEDA: Investigate Current Page Context
//
// Derives editor context (file, route hint, file type) from the active editor,
// calls GET /api/seo/page-command-center, and hands the backend packet to the
// page results panel. Observatory synthesis is owned by the backend.
//
// The extension computes only: editor context, route hints, stale detection,
// session workflow memory, replay state.
//
// Read-only. Thin shell. Phase 1.95+.

import * as vscode from 'vscode';
import { VedaClient } from '../services/vedaClient';
import { StateService } from '../services/stateService';
import { ResultsPanel } from '../views/resultsPanel';
import { deriveFileContext, FileContext } from '../utils/pageHeuristics';
import { PageWorkflowMemory } from '../services/pageWorkflowMemory';
import { RecentPageWorkflowProvider } from '../providers/recentPageWorkflowProvider';

// ── Command ───────────────────────────────────────────────────────────────────

export async function investigateCurrentPage(
  client: VedaClient,
  state: StateService,
  resultsPanel: ResultsPanel,
  memory: PageWorkflowMemory,
  workflowProvider: RecentPageWorkflowProvider
): Promise<void> {
  const editor = vscode.window.activeTextEditor;

  // ── No active editor ──────────────────────────────────────────────────────
  if (!editor) {
    vscode.window.showInformationMessage('VEDA: No active editor — open a file first.');
    return;
  }

  const uri = editor.document.uri;

  // ── Non-file buffer ───────────────────────────────────────────────────────
  if (uri.scheme !== 'file') {
    vscode.window.showInformationMessage('VEDA: Active buffer is not a workspace file.');
    return;
  }

  // ── Derive editor context (extension-owned) ───────────────────────────────
  const ctx: FileContext = deriveFileContext(
    uri.fsPath,
    vscode.workspace.workspaceFolders
  );

  // ── Record in session memory ──────────────────────────────────────────────
  memory.add({
    type:            'page-context',
    fileName:        ctx.fileName,
    workspacePath:   ctx.workspacePath ?? null,
    routeHint:       ctx.routeHint ?? null,
    keywordQuery:    null,
    keywordTargetId: null,
  });
  workflowProvider.refresh();

  const title = ctx.relevance === 'non-page'
    ? `Page Context: ${ctx.fileName} (non-page)`
    : `Page Context: ${ctx.fileName}`;

  const recentEntries = memory.getRecent(3);

  // ── No project selected — render panel immediately with no backend data ───
  if (!state.activeProject) {
    resultsPanel.showPageContext(title, ctx, undefined, recentEntries);
    return;
  }

  // ── Fetch Page Command Center packet from backend ─────────────────────────
  try {
    const response = await client.getPageCommandCenter({
      routeHint: ctx.routeHint ?? undefined,
      fileName:  ctx.fileName  ?? undefined,
      fileType:  ctx.relevance !== 'non-page' ? ctx.relevance : undefined,
    });

    const packet = response?.data;

    resultsPanel.showPageContext(title, ctx, packet, recentEntries);
  } catch {
    resultsPanel.showPageContext(title, ctx, null, recentEntries);
  }
}
