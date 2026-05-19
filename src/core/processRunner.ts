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
const DEFAULT_STOP_TIMEOUT_MS = 2_000;
const DEFAULT_KILL_TIMEOUT_MS = 1_000;
const READY_TIMEOUT_MS = 60_000;
const READY_PATTERN = /Server startup in \d+(?:[.,]\d+)?\s*m?s/i;

function getStopTimeoutMs(): number {
  return vscode.workspace.getConfiguration('tomcatManager').get<number>('stopTimeoutMs', DEFAULT_STOP_TIMEOUT_MS);
}

function getKillTimeoutMs(): number {
  return vscode.workspace.getConfiguration('tomcatManager').get<number>('killTimeoutMs', DEFAULT_KILL_TIMEOUT_MS);
}

export interface RunResult {
  onExit: Promise<number | null>;
  ready: Promise<{ detected: boolean }>;
}

export class ProcessRunner {
  private processes = new Map<string, TrackedProcess>();
  private readonly _onDidChangeRunning = new vscode.EventEmitter<void>();
  readonly onDidChangeRunning = this._onDidChangeRunning.event;

  constructor(private outputChannel: vscode.OutputChannel) {}

  isAnyRunning(): boolean {
    for (const [, tracked] of this.processes) {
      if (tracked.process.exitCode === null) {
        return true;
      }
    }
    return false;
  }

  private getCatalinaScript(config: ResolvedConfig): string {
    return path.join(config.server.tomcatHome, 'bin', `catalina${SCRIPT_EXT}`);
  }

  private getStartupScript(config: ResolvedConfig): string {
    return config.server.startupScript ?? this.getCatalinaScript(config);
  }

  private getShutdownScript(config: ResolvedConfig): string {
    return config.server.shutdownScript ?? this.getCatalinaScript(config);
  }

  private getStartupArgs(config: ResolvedConfig): string[] {
    return config.server.startupScript ? (config.server.startupArgs ?? []) : ['run'];
  }

  private getShutdownArgs(config: ResolvedConfig): string[] {
    return config.server.shutdownScript ? (config.server.shutdownArgs ?? []) : ['stop'];
  }

  private buildEnv(config: ResolvedConfig): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      JAVA_HOME: config.server.jdkHome,
      CATALINA_HOME: config.server.tomcatHome,
    };
    if (config.javaOpts) {
      env.JAVA_OPTS = config.javaOpts;
    }
    if (config.catalinaOpts) {
      env.CATALINA_OPTS = config.catalinaOpts;
    }
    return env;
  }

  private spawnScript(scriptPath: string, args: string[], config: ResolvedConfig): ChildProcess {
    const env = this.buildEnv(config);

    if (IS_WINDOWS) {
      return spawn('cmd.exe', ['/c', scriptPath, ...args], {
        env,
        cwd: config.server.tomcatHome,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    }
    return spawn(scriptPath, args, {
      env,
      cwd: config.server.tomcatHome,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }

  private pipeOutput(proc: ChildProcess, label: string): void {
    const wire = (stream: NodeJS.ReadableStream | null) => {
      if (!stream) return;
      let buf = '';
      stream.on('data', (chunk: Buffer) => {
        buf += chunk.toString();
        const lines = buf.split(/\r?\n/);
        buf = lines.pop() ?? '';
        for (const line of lines) {
          this.outputChannel.appendLine(`[${label}] ${line}`);
        }
      });
      stream.on('end', () => {
        if (buf.length > 0) {
          this.outputChannel.appendLine(`[${label}] ${buf}`);
          buf = '';
        }
      });
    };
    wire(proc.stdout);
    wire(proc.stderr);
  }

  private forceKill(tracked: TrackedProcess): Promise<void> {
    return new Promise<void>((resolve) => {
      try {
        if (IS_WINDOWS) {
          const pid = tracked.process.pid;
          if (pid === undefined) {
            resolve();
            return;
          }
          const kill = spawn('taskkill', ['/T', '/F', '/PID', String(pid)], { stdio: 'ignore' });
          const fallback = setTimeout(resolve, getKillTimeoutMs());
          const finish = () => {
            clearTimeout(fallback);
            resolve();
          };
          kill.on('close', finish);
          kill.on('error', finish);
        } else {
          const pgid = tracked.pgid ?? tracked.process.pid;
          if (pgid !== undefined) {
            process.kill(-pgid, 'SIGKILL');
          }
          resolve();
        }
      } catch {
        // Process may have already exited
        resolve();
      }
    });
  }

  private watchReady(proc: ChildProcess): Promise<{ detected: boolean }> {
    return new Promise((resolve) => {
      let resolved = false;
      const finish = (detected: boolean) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        resolve({ detected });
      };
      const timer = setTimeout(() => finish(false), READY_TIMEOUT_MS);
      timer.unref?.();
      const watch = (chunk: Buffer) => {
        if (resolved) return;
        if (READY_PATTERN.test(chunk.toString())) {
          finish(true);
        }
      };
      proc.stdout?.on('data', watch);
      proc.stderr?.on('data', watch);
      proc.on('close', () => finish(false));
    });
  }

  async run(config: ResolvedConfig): Promise<RunResult> {
    const serverId = config.server.id;

    if (this.isRunning(serverId)) {
      throw new Error(`Server "${config.server.name}" is already running.`);
    }

    const scriptPath = this.getStartupScript(config);
    if (!await pathExists(scriptPath)) {
      throw new Error(`Startup script not found: ${scriptPath}`);
    }
    const startArgs = this.getStartupArgs(config);
    this.outputChannel.clear();
    this.outputChannel.show(true);
    this.outputChannel.appendLine(`Starting ${config.server.name} (${scriptPath} ${startArgs.join(' ')})...`);

    const proc = this.spawnScript(scriptPath, startArgs, config);
    const tracked: TrackedProcess = {
      process: proc,
      pgid: proc.pid,
    };

    this.processes.set(serverId, tracked);
    this._onDidChangeRunning.fire();
    this.pipeOutput(proc, config.server.name);
    const ready = this.watchReady(proc);

    const onExit = new Promise<number | null>((resolve) => {
      proc.on('close', (code) => {
        this.outputChannel.appendLine(`[${config.server.name}] Process exited with code ${code}`);
        this.processes.delete(serverId);
        this._onDidChangeRunning.fire();
        resolve(code);
      });

      proc.on('error', (err) => {
        this.outputChannel.appendLine(`[${config.server.name}] Error: ${err.message}`);
        this.processes.delete(serverId);
        this._onDidChangeRunning.fire();
        resolve(null);
      });
    });

    return { onExit, ready };
  }

  async stop(config: ResolvedConfig): Promise<void> {
    const serverId = config.server.id;
    const tracked = this.processes.get(serverId);

    const scriptPath = this.getShutdownScript(config);
    if (!await pathExists(scriptPath)) {
      throw new Error(`Shutdown script not found: ${scriptPath}`);
    }
    const stopArgs = this.getShutdownArgs(config);
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

    const exited = await new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => resolve(false), getStopTimeoutMs());

      tracked.process.on('close', () => {
        clearTimeout(timeout);
        resolve(true);
      });

      if (tracked.process.exitCode !== null) {
        clearTimeout(timeout);
        resolve(true);
      }
    });

    if (!exited) {
      this.outputChannel.appendLine(`[${config.server.name}] Graceful shutdown timed out. Force killing...`);
      await this.forceKill(tracked);
    }

    this.processes.delete(serverId);
  }

  isRunning(serverId: string): boolean {
    const tracked = this.processes.get(serverId);
    if (!tracked) {
      return false;
    }
    if (tracked.process.exitCode !== null) {
      this.processes.delete(serverId);
      this._onDidChangeRunning.fire();
      return false;
    }
    return true;
  }

  killAll(): void {
    for (const [serverId, tracked] of this.processes) {
      void this.forceKill(tracked);
      this.processes.delete(serverId);
    }
    this._onDidChangeRunning.fire();
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
