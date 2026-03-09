// ─── services/pageWorkflowMemory.ts ──────────────────────────────────────────
//
// Session-only in-memory store for recent page workflow actions.
// Never written to disk, workspaceState, or the backend.
// Resets when the extension host reloads.
//
// Max 10 entries, newest first.
// Immediate duplicate suppression: if the same action (same type + file + keyword)
// is added consecutively, only the timestamp is updated.

export type WorkflowEntryType = 'page-context' | 'page-keyword';

export interface RecentWorkflowEntry {
  id:              string;          // opaque, unique per entry
  type:            WorkflowEntryType;
  fileName:        string;
  workspacePath:   string | null;
  routeHint:       string | null;
  keywordQuery:    string | null;   // set for page-keyword entries
  keywordTargetId: string | null;   // set for page-keyword entries
  timestamp:       number;          // Date.now()
}

const MAX_ENTRIES = 10;

export class PageWorkflowMemory {
  private _entries: RecentWorkflowEntry[] = [];
  private _seq = 0;

  /**
   * Add a new entry or update the timestamp of an immediately matching entry.
   *
   * "Immediately matching" = the most recent entry (index 0) has the same
   * type, fileName (or workspacePath), and keywordTargetId.
   * This prevents duplicate entries when the operator re-runs the same action.
   */
  add(entry: Omit<RecentWorkflowEntry, 'id' | 'timestamp'>): void {
    const key = this._entryKey(entry);

    // Duplicate-suppression: update existing entry timestamp if top entry matches.
    if (this._entries.length > 0) {
      const top = this._entries[0];
      if (this._entryKey(top) === key) {
        top.timestamp = Date.now();
        return;
      }
    }

    const newEntry: RecentWorkflowEntry = {
      ...entry,
      id:        `wf-${++this._seq}`,
      timestamp: Date.now(),
    };

    // Prepend; drop entries beyond the limit.
    this._entries = [newEntry, ...this._entries].slice(0, MAX_ENTRIES);
  }

  /** All entries, newest first. */
  getAll(): RecentWorkflowEntry[] {
    return this._entries;
  }

  /** Most recent N entries. */
  getRecent(n: number): RecentWorkflowEntry[] {
    return this._entries.slice(0, n);
  }

  clear(): void {
    this._entries = [];
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _entryKey(e: Pick<RecentWorkflowEntry, 'type' | 'workspacePath' | 'fileName' | 'keywordTargetId'>): string {
    return `${e.type}|${e.workspacePath ?? e.fileName}|${e.keywordTargetId ?? ''}`;
  }
}
