// ─── services/configService.ts ───────────────────────────────────────────────

import * as vscode from 'vscode';
import { EnvironmentsConfig, EnvironmentConfig } from '../types/api';

const CONFIG_SECTION = 'veda';

export class ConfigService {
  private get config(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(CONFIG_SECTION);
  }

  getEnvironments(): EnvironmentsConfig {
    return this.config.get<EnvironmentsConfig>('environments') ?? {};
  }

  getActiveEnvironmentName(): string {
    return this.config.get<string>('activeEnvironment') ?? 'local';
  }

  getActiveEnvironment(): EnvironmentConfig | null {
    const envs = this.getEnvironments();
    const name = this.getActiveEnvironmentName();
    return envs[name] ?? null;
  }

  async setActiveEnvironment(name: string): Promise<void> {
    await this.config.update(
      'activeEnvironment',
      name,
      vscode.ConfigurationTarget.Global
    );
  }

  getEnvironmentNames(): string[] {
    return Object.keys(this.getEnvironments());
  }

  getBaseUrl(): string | null {
    return this.getActiveEnvironment()?.baseUrl ?? null;
  }
}
