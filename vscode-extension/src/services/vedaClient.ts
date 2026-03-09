// ─── services/vedaClient.ts ──────────────────────────────────────────────────
//
// Thin HTTP transport. Resolves environment base URL, injects project header,
// handles bounded retry on read calls, normalises errors.
// No domain logic lives here.

import { ConfigService } from './configService';
import { StateService } from './stateService';
import { VedaError } from '../utils/errors';

export class VedaClient {
  constructor(
    private readonly config: ConfigService,
    private readonly state: StateService
  ) {}

  // ── Core fetch ────────────────────────────────────────────────────────────

  private baseUrl(): string {
    const url = this.config.getBaseUrl();
    if (!url) {
      throw new VedaError(
        'No VEDA environment configured. Use "VEDA: Switch Environment" to set one.',
        'NO_ENVIRONMENT'
      );
    }
    return url.replace(/\/$/, '');
  }

  private projectHeader(): Record<string, string> {
    const project = this.state.activeProject;
    if (!project) return {};
    return { 'X-Project-Id': project.id };
  }

  private async fetchOnce(path: string): Promise<unknown> {
    const url = `${this.baseUrl()}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.projectHeader(),
    };

    const res = await fetch(url, { method: 'GET', headers });

    if (!res.ok) {
      let message = `API error ${res.status}`;
      try {
        const body = await res.json() as { message?: string };
        if (body.message) message = body.message;
      } catch {
        // ignore parse failure
      }
      throw new VedaError(message, 'API_ERROR', res.status);
    }

    return res.json();
  }

  /**
   * GET with a single retry on network failure (not on 4xx/5xx).
   */
  async get<T = unknown>(path: string): Promise<T> {
    try {
      return await this.fetchOnce(path) as T;
    } catch (err) {
      // Only retry on network errors (not VedaError with a status code)
      if (err instanceof VedaError && err.status !== undefined) {
        throw err;
      }
      // One retry
      await new Promise(r => setTimeout(r, 500));
      return await this.fetchOnce(path) as T;
    }
  }

  // ── Domain endpoints ──────────────────────────────────────────────────────

  async listProjects(): Promise<unknown> {
    return this.get('/api/projects?limit=100');
  }

  async listKeywordTargets(limit = 100): Promise<unknown> {
    return this.get(`/api/seo/keyword-targets?limit=${limit}`);
  }

  async getKeywordDiagnostic(keywordTargetId: string): Promise<unknown> {
    return this.get(`/api/seo/keyword-targets/${keywordTargetId}/overview`);
  }
}
