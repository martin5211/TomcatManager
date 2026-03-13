import * as vscode from 'vscode';
import { TomcatServersConfig, TomcatServer, ResolvedConfig } from '../types/config';

export class ConfigLoader {
  private config: TomcatServersConfig | undefined;

  async loadConfig(): Promise<TomcatServersConfig> {
    const cfg = vscode.workspace.getConfiguration('tomcatManager');
    const parsed: TomcatServersConfig = {
      servers: cfg.get<TomcatServer[]>('servers', []),
      projects: cfg.get<Record<string, any>>('projects', {}),
    };

    this.validate(parsed);
    this.config = parsed;
    return parsed;
  }

  private validate(config: TomcatServersConfig): void {
    if (!Array.isArray(config.servers)) {
      throw new Error('tomcatManager.servers must be an array');
    }
    if (!config.projects || typeof config.projects !== 'object') {
      throw new Error('tomcatManager.projects must be an object');
    }
    for (const server of config.servers) {
      if (!server.id || !server.name || !server.tomcatHome || !server.jdkHome) {
        throw new Error(`tomcatManager.servers: server "${server.id || '(unnamed)'}" is missing required fields: id, name, tomcatHome, jdkHome`);
      }
    }
  }

  getAvailableServers(): TomcatServer[] {
    return this.config?.servers ?? [];
  }

  resolveForProject(folderName: string): ResolvedConfig | undefined {
    if (!this.config) {
      return undefined;
    }

    const projectConfig = this.config.projects[folderName];
    if (!projectConfig) {
      return undefined;
    }

    const server = this.config.servers.find(s => s.id === projectConfig.serverId);
    if (!server) {
      vscode.window.showErrorMessage(`Server "${projectConfig.serverId}" referenced by project "${folderName}" not found.`);
      return undefined;
    }

    return {
      server,
      catalinaOpts: projectConfig.catalinaOpts ?? server.defaultCatalinaOpts ?? '',
      javaOpts: projectConfig.javaOpts ?? server.defaultJavaOpts ?? '',
    };
  }

  resolveForServer(serverId: string): ResolvedConfig | undefined {
    if (!this.config) {
      return undefined;
    }

    const server = this.config.servers.find(s => s.id === serverId);
    if (!server) {
      return undefined;
    }

    return {
      server,
      catalinaOpts: server.defaultCatalinaOpts ?? '',
      javaOpts: server.defaultJavaOpts ?? '',
    };
  }

  watchConfig(cb: () => void): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('tomcatManager')) {
        cb();
      }
    });
  }
}
