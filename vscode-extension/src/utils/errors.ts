// ─── utils/errors.ts ─────────────────────────────────────────────────────────

import * as vscode from 'vscode';
import { ApiError } from '../types/api';

export function isApiError(err: unknown): err is ApiError {
  return typeof err === 'object' && err !== null && 'message' in err;
}

export function toUserMessage(err: unknown): string {
  if (isApiError(err)) {
    return err.message;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return 'An unexpected error occurred.';
}

export function showApiError(context: string, err: unknown): void {
  const msg = toUserMessage(err);
  vscode.window.showErrorMessage(`VEDA [${context}]: ${msg}`);
}

export class VedaError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = 'VedaError';
  }
}
