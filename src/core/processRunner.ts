import * as vscode from 'vscode';
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

  private getStartupScript(config: ResolvedConfig): string {
    if (config.server.startupScript) {
      return config.server.startupScript;
    }
    return path.join(config.server.tomcatHome, 'bin', `startup${SCRIPT_EXT}`);
  }

  private getShutdownScript(config: ResolvedConfig): string {
    if (config.server.shutdownScript) {
      return config.server.shutdownScript;
    }
    return path.join(config.server.tomcatHome, 'bin', `shutdown${SCRIPT_EXT}`);
  }

  private buildEnv(config: ResolvedConfig): NodeJS.ProcessEnv {
    return {
      ...process.env,
      JAVA_HOME: config.server.jreHome,
      CATALINA_HOME: config.server.tomcatHome,
      JAVA_OPTS: config.javaOpts,
      CATALINA_OPTS: config.catalinaOpts,
    };
  }

  private spawnScript(scriptPath: string, config: ResolvedConfig): ChildProcess {
    const env = this.buildEnv(config);

    if (IS_WINDOWS) {
      return spawn('cmd.exe', ['/c', scriptPath], {
        env,
        cwd: config.server.tomcatHome,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } else {
      return spawn(scriptPath, [], {
        env,
        cwd: config.server.tomcatHome,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    }
  }

  private pipeOutput(proc: ChildProcess, label: string): void {
    proc.stdout?.on('data', (data: Buffer) => {
      this.outputChannel.appendLine(`[${label}] ${data.toString().trimEnd()}`);
    });
    proc.stderr?.on('data', (data: Buffer) => {
      this.outputChannel.appendLine(`[${label} ERR] ${data.toString().trimEnd()}`);
    });
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

  async run(config: ResolvedConfig): Promise<void> {
    const serverId = config.server.id;

    if (this.isRunning(serverId)) {
      throw new Error(`Server "${config.server.name}" is already running.`);
    }

    const scriptPath = this.getStartupScript(config);
    this.outputChannel.appendLine(`Starting ${config.server.name} (${scriptPath})...`);
    this.outputChannel.show(true);

    const proc = this.spawnScript(scriptPath, config);
    const tracked: TrackedProcess = {
      process: proc,
      pgid: proc.pid,
    };

    this.processes.set(serverId, tracked);
    this.pipeOutput(proc, config.server.name);

    proc.on('close', (code) => {
      this.outputChannel.appendLine(`[${config.server.name}] Process exited with code ${code}`);
      this.processes.delete(serverId);
    });

    proc.on('error', (err) => {
      this.outputChannel.appendLine(`[${config.server.name}] Error: ${err.message}`);
      this.processes.delete(serverId);
    });
  }

  async stop(config: ResolvedConfig): Promise<void> {
    const serverId = config.server.id;
    const tracked = this.processes.get(serverId);

    const scriptPath = this.getShutdownScript(config);
    this.outputChannel.appendLine(`Stopping ${config.server.name} (${scriptPath})...`);

    const shutdownProc = this.spawnScript(scriptPath, config);
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
