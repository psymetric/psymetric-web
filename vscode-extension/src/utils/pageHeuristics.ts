// ─── utils/pageHeuristics.ts ─────────────────────────────────────────────────
//
// Pure local heuristics for editor context classification.
// No backend calls. No guaranteed correctness. Best-effort display only.

import * as path from 'path';

// ── Types ─────────────────────────────────────────────────────────────────────

export type PageRelevance = 'route-page' | 'layout' | 'api-route' | 'non-page';

export interface FileContext {
  fileName:        string;
  workspacePath:   string | null; // workspace-relative path, or null if outside
  relevance:       PageRelevance;
  relevanceLabel:  string;
  routeHint:       string | null; // best-effort Next.js route, or null
}

// ── Page-relevant file names ──────────────────────────────────────────────────

const PAGE_NAMES    = new Set(['page.tsx', 'page.ts', 'page.jsx', 'page.js']);
const LAYOUT_NAMES  = new Set(['layout.tsx', 'layout.ts', 'layout.jsx', 'layout.js']);
const ROUTE_NAMES   = new Set(['route.ts', 'route.tsx', 'route.js']);

// ── Classification ────────────────────────────────────────────────────────────

function classifyFile(fileName: string, wsRelPath: string | null): PageRelevance {
  const name = path.basename(fileName).toLowerCase();
  if (PAGE_NAMES.has(name))   return 'route-page';
  if (LAYOUT_NAMES.has(name)) return 'layout';
  if (ROUTE_NAMES.has(name))  return 'api-route';
  // File under src/app/ but not one of the canonical names
  if (wsRelPath) {
    const normalised = wsRelPath.replace(/\\/g, '/');
    if (normalised.startsWith('src/app/') || normalised.startsWith('app/')) {
      return 'non-page';
    }
  }
  return 'non-page';
}

function relevanceLabel(r: PageRelevance): string {
  switch (r) {
    case 'route-page': return 'Route / Page file';
    case 'layout':     return 'Layout file';
    case 'api-route':  return 'API Route file';
    case 'non-page':   return 'Non-page file';
  }
}

// ── Route hint derivation ─────────────────────────────────────────────────────

/**
 * Given a workspace-relative path such as
 *   src/app/news/[slug]/page.tsx
 * returns a best-effort Next.js route hint:
 *   /news/[slug]
 *
 * Rules (simple, honest):
 *  - Strip leading src/app/ or app/
 *  - Strip trailing /page.tsx, /layout.tsx, /route.ts (and variants)
 *  - If nothing remains, the route is /
 *  - Dynamic segments [param] are preserved as-is
 *  - Route groups (folder) are stripped (Next.js convention)
 *  - Only applied when file is under src/app/ or app/
 */
export function deriveRouteHint(wsRelPath: string): string | null {
  const normalised = wsRelPath.replace(/\\/g, '/');

  // Only attempt derivation for app-directory files
  let appRelative: string | null = null;
  if (normalised.startsWith('src/app/')) {
    appRelative = normalised.slice('src/app/'.length);
  } else if (normalised.startsWith('app/')) {
    appRelative = normalised.slice('app/'.length);
  }
  if (appRelative === null) return null;

  // Strip trailing file name (page, layout, route, and variants)
  const pageFileRe = /\/(page|layout|route)\.(tsx?|jsx?)$/i;
  const withoutFile = appRelative.replace(pageFileRe, '');

  // Strip route groups: segments wrapped in parentheses e.g. (marketing)
  const withoutGroups = withoutFile
    .split('/')
    .filter(seg => !(seg.startsWith('(') && seg.endsWith(')')))
    .join('/');

  // Normalise to /route or / for root
  const route = withoutGroups ? `/${withoutGroups}` : '/';
  return route;
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Derive a FileContext from an absolute file path and the workspace root(s).
 * Returns null if the path is empty or undefined.
 */
export function deriveFileContext(
  absolutePath: string,
  workspaceFolders: readonly { uri: { fsPath: string } }[] | undefined
): FileContext {
  const fileName = path.basename(absolutePath);

  // Compute workspace-relative path
  let wsRelPath: string | null = null;
  if (workspaceFolders) {
    for (const folder of workspaceFolders) {
      const root = folder.uri.fsPath;
      if (absolutePath.startsWith(root)) {
        // +1 to strip the leading separator
        wsRelPath = absolutePath.slice(root.length + 1);
        break;
      }
    }
  }

  const relevance = classifyFile(fileName, wsRelPath);
  const routeHint = wsRelPath ? deriveRouteHint(wsRelPath) : null;

  return {
    fileName,
    workspacePath: wsRelPath,
    relevance,
    relevanceLabel: relevanceLabel(relevance),
    routeHint,
  };
}
