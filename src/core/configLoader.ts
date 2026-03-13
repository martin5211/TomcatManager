import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { TomcatServersConfig, TomcatServer, ResolvedConfig } from '../types/config';

export class ConfigLoader {
  private config: TomcatServersConfig | undefined;
  private configPath: string | undefined;

  async loadConfig(): Promise<TomcatServersConfig> {
    const configPath = this.findConfigPath();
    if (!configPath) {
      throw new Error('No tomcat.servers.json found in workspace or ~/.tomcat-manager/');
    }
    this.configPath = configPath;

    const raw = fs.readFileSync(configPath, 'utf-8');
    let parsed: TomcatServersConfig;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`Invalid JSON in ${configPath}`);
    }

    this.validate(parsed);
    this.config = parsed;
    return parsed;
  }

  private findConfigPath(): string | undefined {
    // Check workspace root first
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders) {
      for (const folder of workspaceFolders) {
        const candidate = path.join(folder.uri.fsPath, 'tomcat.servers.json');
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      }
    }

    // Fall back to ~/.tomcat-manager/
    const homeConfig = path.join(os.homedir(), '.tomcat-manager', 'tomcat.servers.json');
    if (fs.existsSync(homeConfig)) {
      return homeConfig;
    }

    return undefined;
  }

  private validate(config: TomcatServersConfig): void {
    if (!Array.isArray(config.servers)) {
      throw new Error('tomcat.servers.json: "servers" must be an array');
    }
    if (!config.projects || typeof config.projects !== 'object') {
      throw new Error('tomcat.servers.json: "projects" must be an object');
    }
    for (const server of config.servers) {
      if (!server.id || !server.name || !server.tomcatHome || !server.jreHome) {
        throw new Error(`tomcat.servers.json: server "${server.id || '(unnamed)'}" is missing required fields (id, name, tomcatHome, jreHome)`);
      }
    }
  }

  getConfigPath(): string | undefined {
    return this.configPath;
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
    const watcher = vscode.workspace.createFileSystemWatcher('**/tomcat.servers.json');
    const handler = () => cb();
    watcher.onDidChange(handler);
    watcher.onDidCreate(handler);
    watcher.onDidDelete(handler);
    return watcher;
  }
}
