import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ChildProcess, spawn } from 'child_process';
import { ResolvedConfig } from '../types/config';

interface TrackedProcess {
  process: ChildProcess;
  pgid?: number;
}

const IS_WINDOWS = process.platform === 'win32';
const SCRIPT_EXT = IS_WINDOWS ? '.bat' : '.sh';
const STOP_TIMEOUT_MS = 10_000;

export class ProcessRunner {
  private processes = new Map<string, TrackedProcess>();

  constructor(private outputChannel: vscode.OutputChannel) {}

  private getCatalinaScript(config: ResolvedConfig): string {
    return path.join(config.server.tomcatHome, 'bin', `catalina${SCRIPT_EXT}`);
  }

  private getStartupScript(config: ResolvedConfig): string {
    if (config.server.startupScript) {
      return config.server.startupScript;
    }
    return this.getCatalinaScript(config);
  }

  private getShutdownScript(config: ResolvedConfig): string {
    if (config.server.shutdownScript) {
      return config.server.shutdownScript;
    }
    return this.getCatalinaScript(config);
  }

  private buildEnv(config: ResolvedConfig): NodeJS.ProcessEnv {
    return {
      ...process.env,
      JAVA_HOME: config.server.jdkHome,
      CATALINA_HOME: config.server.tomcatHome,
      JAVA_OPTS: config.javaOpts,
      CATALINA_OPTS: config.catalinaOpts,
    };
  }

  private spawnScript(scriptPath: string, args: string[], config: ResolvedConfig): ChildProcess {
    const env = this.buildEnv(config);

    if (IS_WINDOWS) {
      return spawn('cmd.exe', ['/c', scriptPath, ...args], {
        env,
        cwd: config.server.tomcatHome,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } else {
      return spawn(scriptPath, args, {
        env,
        cwd: config.server.tomcatHome,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    }
  }

  private pipeOutput(proc: ChildProcess, label: string): void {
    const writeLines = (data: Buffer) => {
      const lines = data.toString().trimEnd().split(/\r?\n/);
      for (const line of lines) {
        this.outputChannel.appendLine(`[${label}] ${line}`);
      }
    };
    proc.stdout?.on('data', writeLines);
    proc.stderr?.on('data', writeLines);
  }

  private forceKill(tracked: TrackedProcess): void {
    try {
      if (IS_WINDOWS) {
        const pid = tracked.process.pid;
        if (pid !== undefined) {
          spawn('taskkill', ['/T', '/F', '/PID', String(pid)], { stdio: 'ignore' });
        }
      } else {
        const pgid = tracked.pgid ?? tracked.process.pid;
        if (pgid !== undefined) {
          process.kill(-pgid, 'SIGKILL');
        }
      }
    } catch {
      // Process may have already exited
    }
  }

  async run(config: ResolvedConfig): Promise<{ onExit: Promise<number | null> }> {
    const serverId = config.server.id;

    if (this.isRunning(serverId)) {
      throw new Error(`Server "${config.server.name}" is already running.`);
    }

    const scriptPath = this.getStartupScript(config);
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`Startup script not found: ${scriptPath}`);
    }
    const startArgs = config.server.startupScript ? [] : ['run'];
    this.outputChannel.appendLine(`Starting ${config.server.name} (${scriptPath} ${startArgs.join(' ')})...`);
    this.outputChannel.show(true);

    const proc = this.spawnScript(scriptPath, startArgs, config);
    const tracked: TrackedProcess = {
      process: proc,
      pgid: proc.pid,
    };

    this.processes.set(serverId, tracked);
    this.pipeOutput(proc, config.server.name);

    const onExit = new Promise<number | null>((resolve) => {
      proc.on('close', (code) => {
        this.outputChannel.appendLine(`[${config.server.name}] Process exited with code ${code}`);
        this.processes.delete(serverId);
        resolve(code);
      });

      proc.on('error', (err) => {
        this.outputChannel.appendLine(`[${config.server.name}] Error: ${err.message}`);
        this.processes.delete(serverId);
        resolve(null);
      });
    });

    return { onExit };
  }

  async stop(config: ResolvedConfig): Promise<void> {
    const serverId = config.server.id;
    const tracked = this.processes.get(serverId);

    const scriptPath = this.getShutdownScript(config);
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`Shutdown script not found: ${scriptPath}`);
    }
    const stopArgs = config.server.shutdownScript ? [] : ['stop'];
    this.outputChannel.appendLine(`Stopping ${config.server.name} (${scriptPath} ${stopArgs.join(' ')})...`);

    const shutdownProc = this.spawnScript(scriptPath, stopArgs, config);
    this.pipeOutput(shutdownProc, `${config.server.name} shutdown`);

    await new Promise<void>((resolve) => {
      shutdownProc.on('close', () => resolve());
      shutdownProc.on('error', () => resolve());
    });

    if (!tracked) {
      this.outputChannel.appendLine(`[${config.server.name}] No tracked process; shutdown script executed.`);
      return;
    }

    // Wait for the tracked process to exit, or force kill after timeout
    const exited = await new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => resolve(false), STOP_TIMEOUT_MS);

      tracked.process.on('close', () => {
        clearTimeout(timeout);
        resolve(true);
      });

      // If already exited
      if (tracked.process.exitCode !== null) {
        clearTimeout(timeout);
        resolve(true);
      }
    });

    if (!exited) {
      this.outputChannel.appendLine(`[${config.server.name}] Graceful shutdown timed out. Force killing...`);
      this.forceKill(tracked);
    }

    this.processes.delete(serverId);
  }

  isRunning(serverId: string): boolean {
    const tracked = this.processes.get(serverId);
    if (!tracked) {
      return false;
    }
    // Check if process has already exited
    if (tracked.process.exitCode !== null) {
      this.processes.delete(serverId);
      return false;
    }
    return true;
  }

  killAll(): void {
    for (const [serverId, tracked] of this.processes) {
      this.forceKill(tracked);
      this.processes.delete(serverId);
    }
  }
}
