// ─── commands/pageKeywordDiagnostic.ts ───────────────────────────────────────
//
// VEDA: Page → Choose Project Keyword Diagnostic
//
// Fetches the active project's keyword targets, presents a Quick Pick,
// and invokes the existing keyword diagnostic flow for the chosen keyword.
//
// No automatic keyword matching. No SEO analysis. Manual selection only.
// Read-only. Thin shell. Phase 2.0b / 2.0d (hint-sorted Quick Pick).

import * as vscode from 'vscode';
import { VedaClient } from '../services/vedaClient';
import { StateService } from '../services/stateService';
import { ResultsPanel } from '../views/resultsPanel';
import { KeywordTarget, KeywordTargetListResponse } from '../types/keyword';
import { deriveFileContext, FileContext } from '../utils/pageHeuristics';
import { showApiError } from '../utils/errors';
import { PageWorkflowMemory } from '../services/pageWorkflowMemory';
import { RecentPageWorkflowProvider } from '../providers/recentPageWorkflowProvider';

export async function pageKeywordDiagnostic(
  client: VedaClient,
  state: StateService,
  resultsPanel: ResultsPanel,
  memory: PageWorkflowMemory,
  workflowProvider: RecentPageWorkflowProvider
): Promise<void> {
  // ── Capture current file context before any async work ───────────────────
  // Derived from existing heuristics only — no backend call.
  const editor = vscode.window.activeTextEditor;
  const pageOrigin: FileContext | undefined =
    editor && editor.document.uri.scheme === 'file'
      ? deriveFileContext(editor.document.uri.fsPath, vscode.workspace.workspaceFolders)
      : undefined;
  // ── Guard: active project required ────────────────────────────────────────
  if (!state.activeProject) {
    vscode.window.showWarningMessage(
      'VEDA: No active project — run "VEDA: Select Project" first.'
    );
    return;
  }

  // ── Fetch keyword targets ─────────────────────────────────────────────────
  let keywords: KeywordTarget[] = [];

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'VEDA: Loading keyword targets…',
      cancellable: false,
    },
    async () => {
      try {
        const res = await client.listKeywordTargets(100) as KeywordTargetListResponse;
        keywords = res?.data?.items ?? [];
      } catch (err) {
        showApiError('Page Keyword Diagnostic', err);
        keywords = [];
      }
    }
  );

  // ── Guard: keywords must exist ────────────────────────────────────────────
  if (keywords.length === 0) {
    vscode.window.showInformationMessage(
      'VEDA: No keyword targets found for this project. Add keyword targets first.'
    );
    return;
  }

  // ── Quick Pick with lightweight local hint sorting ───────────────────────
  //
  // Derive simple text tokens from the current file context.
  // Matching is presentation-only — no claim of semantic correctness.
  const hintTokens = pageOrigin ? _deriveHintTokens(pageOrigin) : new Set<string>();

  const rawItems: (vscode.QuickPickItem & { keyword: KeywordTarget; isHintMatch: boolean })[] =
    keywords.map(kw => {
      const isHintMatch = hintTokens.size > 0 && _isHintMatch(kw.query, hintTokens);
      return {
        label:       kw.query,
        description: isHintMatch
          ? `$(lightbulb) hint match  ·  ${kw.locale} · ${kw.device}${kw.isPrimary ? ' · primary' : ''}`
          : `${kw.locale} · ${kw.device}${kw.isPrimary ? ' · primary' : ''}`,
        keyword:     kw,
        isHintMatch,
      };
    });

  // Stable sort: hint matches first, preserving server-returned order within each group.
  const items = [
    ...rawItems.filter(i => i.isHintMatch),
    ...rawItems.filter(i => !i.isHintMatch),
  ];

  const picked = await vscode.window.showQuickPick(items, {
    title:       'VEDA: Choose a Keyword to Diagnose',
    placeHolder: 'Select a keyword target from this project…',
    matchOnDescription: true,
  });

  if (!picked) return; // operator cancelled

  // ── Run existing keyword diagnostic ───────────────────────────────────────
  let data: unknown;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title:    `VEDA: Diagnosing "${picked.keyword.query}"…`,
      cancellable: false,
    },
    async () => {
      try {
        data = await client.getKeywordDiagnostic(picked.keyword.id);
      } catch (err) {
        showApiError('Page Keyword Diagnostic', err);
        data = null;
      }
    }
  );

  if (!data) return;

  // Record in session memory.
  if (pageOrigin) {
    memory.add({
      type:            'page-keyword',
      fileName:        pageOrigin.fileName,
      workspacePath:   pageOrigin.workspacePath ?? null,
      routeHint:       pageOrigin.routeHint ?? null,
      keywordQuery:    picked.keyword.query,
      keywordTargetId: picked.keyword.id,
    });
    workflowProvider.refresh();
  }

  resultsPanel.showKeywordDiagnostic(
    `Keyword: ${picked.keyword.query}`,
    data,
    'VEDA: Page → Keyword Diagnostic',
    pageOrigin
  );
}

// ── Local hint helpers ───────────────────────────────────────────────────────────────

/**
 * Words treated as structural boilerplate in Next.js file paths.
 * These carry no topical signal and are excluded from hint tokens.
 */
const BOILERPLATE = new Set([
  'page', 'layout', 'route', 'src', 'app', 'index', 'default',
  'tsx', 'ts', 'jsx', 'js',
]);

/**
 * Derive a small set of lowercase hint tokens from the current FileContext.
 *
 * Sources (in priority order):
 *  1. Route hint path segments  (e.g. /news/[slug] → ['news', 'slug'])
 *  2. File name without extension (only if not itself boilerplate)
 *
 * Dynamic segment brackets are stripped: [slug] → 'slug'.
 * Route group parens are already stripped by deriveRouteHint.
 * Tokens shorter than 3 chars are excluded (too noisy).
 * Presentation-only — deterministic, no side effects.
 */
function _deriveHintTokens(ctx: FileContext): Set<string> {
  const tokens = new Set<string>();

  const addToken = (raw: string) => {
    // Strip dynamic-segment brackets
    const clean = raw.replace(/[\[\]]/g, '').toLowerCase().trim();
    if (clean.length >= 3 && !BOILERPLATE.has(clean)) {
      tokens.add(clean);
    }
  };

  // 1. Route hint segments
  if (ctx.routeHint) {
    ctx.routeHint.split('/').filter(Boolean).forEach(addToken);
  }

  // 2. File name stem (fallback signal when no route hint)
  if (tokens.size === 0 && ctx.fileName) {
    const stem = ctx.fileName.replace(/\.[^.]+$/, '');
    addToken(stem);
  }

  return tokens;
}

/**
 * Return true if the keyword query contains at least one hint token as a
 * substring (case-insensitive word-boundary-like check via split on
 * non-alphanumeric chars).
 *
 * We split the query into its own tokens and check for overlap, which
 * avoids false positives from partial sub-word matches (e.g. token 'cat'
 * would not match 'education').
 */
function _isHintMatch(query: string, hintTokens: Set<string>): boolean {
  const queryTokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 3);

  return queryTokens.some(qt => hintTokens.has(qt));
}
