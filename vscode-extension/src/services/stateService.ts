// ─── services/stateService.ts ────────────────────────────────────────────────
//
// Lightweight in-memory session state.
// No persistent DB. No background sync. No analytics cache.

import * as vscode from 'vscode';
import { Project } from '../types/project';

type StateChangeHandler = () => void;

export class StateService {
  private _activeProject: Project | null = null;
  private _projectList: Project[] = [];
  private _openPanel: vscode.WebviewPanel | null = null;
  /** ID of the project whose data is currently displayed in the open panel. */
  private _panelProjectId: string | null = null;

  private _listeners: StateChangeHandler[] = [];

  // ── Active project ────────────────────────────────────────────────────────

  get activeProject(): Project | null {
    return this._activeProject;
  }

  setActiveProject(project: Project | null): void {
    this._activeProject = project;
    this._notify();
  }

  // ── Project list ──────────────────────────────────────────────────────────

  get projectList(): Project[] {
    return this._projectList;
  }

  setProjectList(projects: Project[]): void {
    this._projectList = projects;
  }

  // ── Open panel ────────────────────────────────────────────────────────────

  get openPanel(): vscode.WebviewPanel | null {
    return this._openPanel;
  }

  setOpenPanel(panel: vscode.WebviewPanel | null): void {
    this._openPanel = panel;
  }

  // ── Panel project tracking ────────────────────────────────────────────────

  get panelProjectId(): string | null {
    return this._panelProjectId;
  }

  setPanelProjectId(id: string | null): void {
    this._panelProjectId = id;
  }

  // ── Change listeners ──────────────────────────────────────────────────────

  onStateChange(handler: StateChangeHandler): vscode.Disposable {
    this._listeners.push(handler);
    return {
      dispose: () => {
        this._listeners = this._listeners.filter(l => l !== handler);
      },
    };
  }

  private _notify(): void {
    for (const l of this._listeners) {
      l();
    }
  }
}
