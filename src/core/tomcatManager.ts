import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigLoader } from './configLoader';
import { ProcessRunner } from './processRunner';
import { showTransientInfo } from './notifications';
import { detectJdwpPort } from './jdwp';
import { ResolvedConfig } from '../types/config';

const WEBAPPS_PRESERVED = new Set(['ROOT', 'manager', 'host-manager', 'examples', 'docs']);
const WAR_SEARCH_SUBDIRS = [['target'], ['build', 'libs'], ['dist'], []];

export class TomcatManager {
  constructor(
    private configLoader: ConfigLoader,
    private processRunner: ProcessRunner,
    private outputChannel: vscode.OutputChannel,
  ) {}

  private getActiveWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
    const activeUri = vscode.window.activeTextEditor?.document.uri;
    if (activeUri) {
      const folder = vscode.workspace.getWorkspaceFolder(activeUri);
      if (folder) {
        return folder;
      }
    }
    return vscode.workspace.workspaceFolders?.[0];
  }

  private async resolveConfig(serverId?: string): Promise<ResolvedConfig | undefined> {
    if (serverId) {
      const config = this.configLoader.resolveForServer(serverId);
      if (!config) {
        vscode.window.showErrorMessage(`Server "${serverId}" not found in configuration.`);
      }
      return config;
    }

    const folder = this.getActiveWorkspaceFolder();
    const config = this.configLoader.resolveFromWorkspace(folder);
    if (config) {
      return config;
    }

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

    return this.configLoader.resolveForServerInWorkspace(picked.server.id, this.getActiveWorkspaceFolder());
  }

  async run(serverId?: string): Promise<void> {
    const config = await this.resolveConfig(serverId);
    if (!config) {
      return;
    }

    if (await this.tryStartAsDebugSession(config)) {
      return;
    }

    try {
      await this.deployOnly(config);
      const { ready } = await this.processRunner.run(config);
      void this.reportReady(config, ready);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Failed to start: ${msg}`);
    }
  }

  private async tryStartAsDebugSession(config: ResolvedConfig): Promise<boolean> {
    const merged = `${config.catalinaOpts} ${config.javaOpts}`;
    if (detectJdwpPort(merged) === undefined) {
      return false;
    }
    const folder = this.getActiveWorkspaceFolder();
    const name = this.findTomcatLaunchConfigName(folder, config.server.id);
    if (!name) {
      return false;
    }
    try {
      await vscode.debug.startDebugging(folder, name);
      return true;
    } catch {
      return false;
    }
  }

  private findTomcatLaunchConfigName(folder: vscode.WorkspaceFolder | undefined, serverId: string): string | undefined {
    const configurations = vscode.workspace
      .getConfiguration('launch', folder?.uri)
      .get<any[]>('configurations', []);
    const match =
      configurations.find((c: any) => c?.type === 'tomcat' && c.serverId === serverId)
      ?? configurations.find((c: any) => c?.type === 'tomcat' && !c.serverId);
    return match?.name;
  }

  async stop(serverId?: string): Promise<void> {
    const config = await this.resolveConfig(serverId);
    if (!config) {
      return;
    }

    try {
      await this.processRunner.stop(config);
      showTransientInfo(`${config.server.name} stopped.`);
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
      if (await this.tryStartAsDebugSession(config)) {
        return;
      }
      await this.deployOnly(config);
      const { ready } = await this.processRunner.run(config);
      void this.reportReady(config, ready, 'restarted');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Failed to restart: ${msg}`);
    }
  }

  private async reportReady(
    config: ResolvedConfig,
    ready: Promise<{ detected: boolean }>,
    verb: 'started' | 'restarted' = 'started',
  ): Promise<void> {
    const { detected } = await ready;
    if (detected) {
      this.outputChannel.appendLine(`[${config.server.name}] ${verb} (server startup complete).`);
    } else {
      this.outputChannel.appendLine(`[${config.server.name}] ${verb} (readiness signal not detected within 60s; check logs above).`);
    }
  }

  async deploy(serverId?: string): Promise<void> {
    const config = await this.resolveConfig(serverId);
    if (!config) {
      return;
    }

    const warName = await this.deployOnly(config);
    const msg = warName
      ? `Deployed ${warName} to ${config.server.name}.`
      : `No WAR file found to deploy to ${config.server.name}.`;
    showTransientInfo(msg);
  }

  async deployOnly(config: ResolvedConfig, workspaceFolder?: vscode.WorkspaceFolder): Promise<string | undefined> {
    const folder = workspaceFolder ?? this.getActiveWorkspaceFolder();
    if (!folder) {
      this.outputChannel.appendLine('No workspace folder open — skipping deploy.');
      return undefined;
    }

    const warFile = await this.findWar(folder.uri.fsPath);
    if (!warFile) {
      this.outputChannel.appendLine('No WAR file found — skipping deploy.');
      return undefined;
    }

    const webappsDir = path.join(config.server.tomcatHome, 'webapps');
    if (!await pathExists(webappsDir)) {
      await fs.promises.mkdir(webappsDir, { recursive: true });
    }

    const warName = path.basename(warFile);
    const destPath = path.join(webappsDir, warName);
    if (await pathExists(destPath)) {
      this.outputChannel.appendLine(`[${config.server.name}] Overwriting existing ${warName} in webapps/`);
    }

    try {
      await fs.promises.copyFile(warFile, destPath);
    } catch (err: any) {
      if (err?.code === 'EBUSY' || err?.code === 'EPERM') {
        throw new Error(
          `Cannot deploy: ${warName} is locked (likely held by ${config.server.name}). ` +
          `Stop the server or disable Tomcat's autoDeploy lock and try again.`,
        );
      }
      throw err;
    }
    this.outputChannel.appendLine(`Deployed ${warName} to ${webappsDir}`);
    return warName;
  }

  private async findWar(workspaceRoot: string): Promise<string | undefined> {
    for (const segments of WAR_SEARCH_SUBDIRS) {
      const dir = path.join(workspaceRoot, ...segments);
      if (!await pathExists(dir)) {
        continue;
      }
      const entries = (await fs.promises.readdir(dir)).filter(f => f.endsWith('.war'));
      if (entries.length === 0) {
        continue;
      }
      if (entries.length === 1) {
        return path.join(dir, entries[0]);
      }
      const items = entries.map(f => ({ label: f, filePath: path.join(dir, f) }));
      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Multiple WAR files found. Select one to deploy.',
      });
      return picked?.filePath;
    }
    return undefined;
  }

  async clean(serverId?: string): Promise<void> {
    const config = await this.resolveConfig(serverId);
    if (!config) {
      return;
    }

    if (this.processRunner.isRunning(config.server.id)) {
      this.outputChannel.appendLine(`Stopping ${config.server.name} before cleaning...`);
      await this.processRunner.stop(config);
    }

    for (const sub of ['work', 'temp']) {
      const dir = path.join(config.server.tomcatHome, sub);
      if (!await pathExists(dir)) {
        continue;
      }
      const entries = await fs.promises.readdir(dir);
      await Promise.all(entries.map(e =>
        fs.promises.rm(path.join(dir, e), { recursive: true, force: true })
      ));
      this.outputChannel.appendLine(`Cleaned ${dir}`);
    }

    const webappsDir = path.join(config.server.tomcatHome, 'webapps');
    if (await pathExists(webappsDir)) {
      const entries = await fs.promises.readdir(webappsDir);
      await Promise.all(entries
        .filter(e => !WEBAPPS_PRESERVED.has(e))
        .map(e => fs.promises.rm(path.join(webappsDir, e), { recursive: true, force: true }))
      );
      this.outputChannel.appendLine(`Cleaned ${webappsDir} (preserved ${[...WEBAPPS_PRESERVED].join(', ')})`);
    }

    showTransientInfo(`${config.server.name} work/, temp/, and webapps/ directories cleaned.`);
  }

  dispose(): void {
    this.processRunner.killAll();
  }
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.promises.access(p);
    return true;
  } catch {
    return false;
  }
}
