import * as vscode from 'vscode';
import * as fs from 'fs';
import { TomcatServersConfig, TomcatServer, ResolvedConfig } from '../types/config';

export type ConfigWarner = (message: string) => void;

export class ConfigLoader {
  private config: TomcatServersConfig | undefined;
  private warner: ConfigWarner = () => {};

  setWarner(warner: ConfigWarner): void {
    this.warner = warner;
  }

  async loadConfig(): Promise<TomcatServersConfig> {
    const cfg = vscode.workspace.getConfiguration('tomcatManager');
    const parsed: TomcatServersConfig = {
      servers: cfg.get<TomcatServer[]>('servers', []),
    };

    this.validate(parsed);
    this.config = parsed;
    void this.warnOnMissingPaths(parsed);
    return parsed;
  }

  private validate(config: TomcatServersConfig): void {
    if (!Array.isArray(config.servers)) {
      throw new Error('tomcatManager.servers must be an array');
    }
    const ids = new Set<string>();
    for (const server of config.servers) {
      if (!server.id || !server.name || !server.tomcatHome || !server.jdkHome) {
        throw new Error(`tomcatManager.servers: server "${server.id || '(unnamed)'}" is missing required fields: id, name, tomcatHome, jdkHome`);
      }
      if (ids.has(server.id)) {
        throw new Error(`tomcatManager.servers: duplicate server id "${server.id}"`);
      }
      ids.add(server.id);
    }
  }

  private async warnOnMissingPaths(config: TomcatServersConfig): Promise<void> {
    await Promise.all(config.servers.flatMap(s => [
      this.checkPath(s, 'tomcatHome', s.tomcatHome),
      this.checkPath(s, 'jdkHome', s.jdkHome),
    ]));
  }

  private async checkPath(server: TomcatServer, field: string, p: string): Promise<void> {
    try {
      await fs.promises.access(p);
    } catch {
      this.warner(`Server "${server.id}": ${field} path does not exist or is not accessible: ${p}`);
    }
  }

  getAvailableServers(): TomcatServer[] {
    return this.config?.servers ?? [];
  }

  resolveFromWorkspace(folder?: vscode.WorkspaceFolder): ResolvedConfig | undefined {
    if (!this.config) {
      return undefined;
    }

    const configurations = vscode.workspace
      .getConfiguration('launch', folder?.uri)
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

    return this.merge(server, tomcatConfig);
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

  resolveForServerInWorkspace(serverId: string, folder?: vscode.WorkspaceFolder): ResolvedConfig | undefined {
    if (!this.config) {
      return undefined;
    }
    const server = this.config.servers.find(s => s.id === serverId);
    if (!server) {
      return undefined;
    }

    const configurations = vscode.workspace
      .getConfiguration('launch', folder?.uri)
      .get<any[]>('configurations', []);
    // Prefer a tomcat config that targets this serverId; fall back to one with no serverId set
    const tomcatConfig =
      configurations.find((c: any) => c.type === 'tomcat' && c.serverId === serverId)
      ?? configurations.find((c: any) => c.type === 'tomcat' && !c.serverId);

    return this.merge(server, tomcatConfig);
  }

  private merge(server: TomcatServer, tomcatConfig: any): ResolvedConfig {
    const launchCatalinaOpts = tomcatConfig?.catalinaOpts ?? '';
    const launchJavaOpts = tomcatConfig?.javaOpts ?? '';
    return {
      server,
      catalinaOpts: `${server.defaultCatalinaOpts ?? ''} ${launchCatalinaOpts}`.trim(),
      javaOpts: `${server.defaultJavaOpts ?? ''} ${launchJavaOpts}`.trim(),
    };
  }

  hasTomcatLaunchConfig(): boolean {
    const folders = vscode.workspace.workspaceFolders ?? [];
    for (const folder of folders) {
      const configs = vscode.workspace
        .getConfiguration('launch', folder.uri)
        .get<any[]>('configurations', []);
      if (configs.some((c: any) => c?.type === 'tomcat')) {
        return true;
      }
    }
    // Multi-root .code-workspace level
    const wsConfigs = vscode.workspace.getConfiguration('launch').get<any[]>('configurations', []);
    return wsConfigs.some((c: any) => c?.type === 'tomcat');
  }

  watchConfig(cb: () => void): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('tomcatManager')) {
        cb();
      }
    });
  }
}
