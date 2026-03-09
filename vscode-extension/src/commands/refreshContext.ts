// ─── commands/refreshContext.ts ──────────────────────────────────────────────

import { ProjectContextProvider } from '../providers/projectContextProvider';

export function refreshContext(provider: ProjectContextProvider): void {
  provider.refresh();
}
