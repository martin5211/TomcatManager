import * as vscode from 'vscode';
import { TomcatServersConfig, TomcatServer, ResolvedConfig } from '../types/config';

export class ConfigLoader {
  private config: TomcatServersConfig | undefined;

  async loadConfig(): Promise<TomcatServersConfig> {
    const cfg = vscode.workspace.getConfiguration('tomcatManager');
    const parsed: TomcatServersConfig = {
      servers: cfg.get<TomcatServer[]>('servers', []),
    };

    this.validate(parsed);
    this.config = parsed;
    return parsed;
  }

  private validate(config: TomcatServersConfig): void {
    if (!Array.isArray(config.servers)) {
      throw new Error('tomcatManager.servers must be an array');
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

  resolveFromWorkspace(): ResolvedConfig | undefined {
    if (!this.config) {
      return undefined;
    }

    const configurations = vscode.workspace
      .getConfiguration('launch')
      .get<any[]>('configurations', []);
    const tomcatConfig = configurations.find((c: any) => c.type === 'tomcat');

    const serverId = tomcatConfig?.serverId ?? '';

    let server: TomcatServer | undefined;
    if (serverId) {
      server = this.config.servers.find(s => s.id === serverId);
      if (!server) {
        vscode.window.showErrorMessage(`Server "${serverId}" referenced in launch.json not found.`);
        return undefined;
      }
    } else if (this.config.servers.length === 1) {
      server = this.config.servers[0];
    } else {
      return undefined;
    }

    const launchCatalinaOpts = tomcatConfig?.catalinaOpts ?? '';
    const launchJavaOpts = tomcatConfig?.javaOpts ?? '';

    return {
      server,
      catalinaOpts: `${server.defaultCatalinaOpts ?? ''} ${launchCatalinaOpts}`.trim(),
      javaOpts: `${server.defaultJavaOpts ?? ''} ${launchJavaOpts}`.trim(),
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
