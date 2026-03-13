import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigLoader } from './configLoader';
import { ProcessRunner } from './processRunner';
import { ResolvedConfig, TomcatServer } from '../types/config';

export class TomcatManager {
  constructor(
    private configLoader: ConfigLoader,
    private processRunner: ProcessRunner,
    private outputChannel: vscode.OutputChannel,
  ) {}

  private async resolveConfig(serverId?: string): Promise<ResolvedConfig | undefined> {
    if (serverId) {
      const config = this.configLoader.resolveForServer(serverId);
      if (!config) {
        vscode.window.showErrorMessage(`Server "${serverId}" not found in configuration.`);
      }
      return config;
    }

    // Try to resolve from current workspace folder
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      vscode.window.showErrorMessage('No workspace folder open.');
      return undefined;
    }

    const folderName = folder.name;
    const config = this.configLoader.resolveForProject(folderName);
    if (config) {
      return config;
    }

    // No project mapping — let user pick a server
    return this.pickServer();
  }

  private async pickServer(): Promise<ResolvedConfig | undefined> {
    const servers = this.configLoader.getAvailableServers();
    if (servers.length === 0) {
      vscode.window.showErrorMessage('No servers configured. Run "Tomcat: Configure Servers" first.');
      return undefined;
    }

    const items = servers.map(s => ({ label: s.name, description: s.id, server: s }));
    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a Tomcat server',
    });

    if (!picked) {
      return undefined;
    }

    return this.configLoader.resolveForServer(picked.server.id);
  }

  async run(serverId?: string): Promise<void> {
    const config = await this.resolveConfig(serverId);
    if (!config) {
      return;
    }

    try {
      await this.processRunner.run(config);
      vscode.window.showInformationMessage(`${config.server.name} started.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Failed to start: ${msg}`);
    }
  }

  async stop(serverId?: string): Promise<void> {
    const config = await this.resolveConfig(serverId);
    if (!config) {
      return;
    }

    try {
      await this.processRunner.stop(config);
      vscode.window.showInformationMessage(`${config.server.name} stopped.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Failed to stop: ${msg}`);
    }
  }

  async restart(serverId?: string): Promise<void> {
    const config = await this.resolveConfig(serverId);
    if (!config) {
      return;
    }

    try {
      if (this.processRunner.isRunning(config.server.id)) {
        await this.processRunner.stop(config);
      }
      await this.processRunner.run(config);
      vscode.window.showInformationMessage(`${config.server.name} restarted.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Failed to restart: ${msg}`);
    }
  }

  async deploy(serverId?: string): Promise<void> {
    const config = await this.resolveConfig(serverId);
    if (!config) {
      return;
    }

    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      vscode.window.showErrorMessage('No workspace folder open.');
      return;
    }

    // Look for WAR files in common build output locations
    const searchDirs = [
      path.join(folder.uri.fsPath, 'target'),
      path.join(folder.uri.fsPath, 'build', 'libs'),
      path.join(folder.uri.fsPath, 'dist'),
      folder.uri.fsPath,
    ];

    let warFile: string | undefined;
    for (const dir of searchDirs) {
      if (!fs.existsSync(dir)) {
        continue;
      }
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.war'));
      if (files.length > 0) {
        if (files.length === 1) {
          warFile = path.join(dir, files[0]);
        } else {
          const items = files.map(f => ({ label: f, filePath: path.join(dir, f) }));
          const picked = await vscode.window.showQuickPick(items, {
            placeHolder: 'Multiple WAR files found. Select one to deploy.',
          });
          warFile = picked?.filePath;
        }
        break;
      }
    }

    if (!warFile) {
      vscode.window.showErrorMessage('No WAR file found in target/, build/libs/, dist/, or workspace root.');
      return;
    }

    const webappsDir = path.join(config.server.tomcatHome, 'webapps');
    if (!fs.existsSync(webappsDir)) {
      fs.mkdirSync(webappsDir, { recursive: true });
    }

    const destPath = path.join(webappsDir, path.basename(warFile));
    fs.copyFileSync(warFile, destPath);
    this.outputChannel.appendLine(`Deployed ${path.basename(warFile)} to ${webappsDir}`);
    vscode.window.showInformationMessage(`Deployed ${path.basename(warFile)} to ${config.server.name}.`);
  }

  async clean(serverId?: string): Promise<void> {
    const config = await this.resolveConfig(serverId);
    if (!config) {
      return;
    }

    // Stop if running
    if (this.processRunner.isRunning(config.server.id)) {
      this.outputChannel.appendLine(`Stopping ${config.server.name} before cleaning...`);
      await this.processRunner.stop(config);
    }

    const dirsToClean = [
      path.join(config.server.tomcatHome, 'work'),
      path.join(config.server.tomcatHome, 'temp'),
    ];

    for (const dir of dirsToClean) {
      if (fs.existsSync(dir)) {
        const entries = fs.readdirSync(dir);
        for (const entry of entries) {
          const fullPath = path.join(dir, entry);
          fs.rmSync(fullPath, { recursive: true, force: true });
        }
        this.outputChannel.appendLine(`Cleaned ${dir}`);
      }
    }

    // Clean webapps/ but preserve default Tomcat apps
    const webappsDir = path.join(config.server.tomcatHome, 'webapps');
    const preservedApps = new Set(['ROOT', 'manager', 'host-manager']);
    if (fs.existsSync(webappsDir)) {
      const entries = fs.readdirSync(webappsDir);
      for (const entry of entries) {
        if (preservedApps.has(entry)) {
          continue;
        }
        const fullPath = path.join(webappsDir, entry);
        fs.rmSync(fullPath, { recursive: true, force: true });
      }
      this.outputChannel.appendLine(`Cleaned ${webappsDir} (preserved ${[...preservedApps].join(', ')})`);
    }

    vscode.window.showInformationMessage(`${config.server.name} work/, temp/, and webapps/ directories cleaned.`);
  }

  dispose(): void {
    this.processRunner.killAll();
  }
}
