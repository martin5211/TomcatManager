import * as vscode from 'vscode';
import { ProcessRunner } from '../core/processRunner';
import { ConfigLoader } from '../core/configLoader';
import { TomcatLaunchConfig, ResolvedConfig } from '../types/config';

interface DAPMessage {
  seq: number;
  type: string;
}

interface DAPRequest extends DAPMessage {
  type: 'request';
  command: string;
  arguments?: any;
}

interface DAPResponse {
  seq: number;
  type: 'response';
  request_seq: number;
  command: string;
  success: boolean;
  message?: string;
  body?: any;
}

interface DAPEvent {
  seq: number;
  type: 'event';
  event: string;
  body?: any;
}

export class TomcatDebugAdapter implements vscode.DebugAdapter {
  private seq = 1;
  private activeLaunchConfig: ResolvedConfig | undefined;
  private activeServerId: string | undefined;
  private readonly _onDidSendMessage = new vscode.EventEmitter<any>();
  readonly onDidSendMessage = this._onDidSendMessage.event;

  constructor(
    private processRunner: ProcessRunner,
    private configLoader: ConfigLoader,
    private outputChannel: vscode.OutputChannel,
  ) {}

  handleMessage(message: DAPMessage): void {
    if (message.type === 'request') {
      const request = message as DAPRequest;
      switch (request.command) {
        case 'initialize':
          this.onInitialize(request);
          break;
        case 'launch':
          this.onLaunch(request);
          break;
        case 'disconnect':
        case 'terminate':
          this.onStop(request);
          break;
        default:
          this.sendResponse(request, true);
          break;
      }
    }
  }

  private onInitialize(request: DAPRequest): void {
    this.sendResponse(request, true, undefined, {});
    this.sendEvent('initialized');
  }

  private async onLaunch(request: DAPRequest): Promise<void> {
    const launchConfig = request.arguments as TomcatLaunchConfig;

    const resolved = this.resolveConfig(launchConfig);
    if (!resolved) {
      this.sendResponse(request, false, 'Could not resolve server configuration. Check tomcatManager settings.');
      return;
    }

    const serverId = resolved.server.id;
    if (this.processRunner.isRunning(serverId)) {
      this.sendResponse(request, false, `Server "${resolved.server.name}" is already running.`);
      return;
    }

    // Prepend JPDA agent string to catalinaOpts if jpda is enabled
    if (launchConfig.jpda) {
      const port = launchConfig.jpdaPort ?? 8000;
      const suspend = launchConfig.jpdaSuspend ? 'y' : 'n';
      const jpdaAgent = `-agentlib:jdwp=transport=dt_socket,server=y,suspend=${suspend},address=*:${port}`;
      resolved.catalinaOpts = resolved.catalinaOpts
        ? `${jpdaAgent} ${resolved.catalinaOpts}`
        : jpdaAgent;
    }

    try {
      const { onExit } = await this.processRunner.run(resolved);
      this.activeLaunchConfig = resolved;
      this.activeServerId = serverId;
      this.sendResponse(request, true);

      // When the process exits, send TerminatedEvent
      onExit.then(() => {
        this.activeLaunchConfig = undefined;
        this.activeServerId = undefined;
        this.sendEvent('terminated');
      });

      // Auto-attach Java debugger if JPDA is enabled
      if (launchConfig.jpda && (launchConfig.attachJavaDebugger ?? true)) {
        const delay = launchConfig.attachDelay ?? 3000;
        const port = launchConfig.jpdaPort ?? 8000;
        setTimeout(() => {
          vscode.debug.startDebugging(undefined, {
            type: 'java',
            request: 'attach',
            name: 'Attach to Tomcat',
            hostName: 'localhost',
            port,
          });
        }, delay);
      }
    } catch (err: any) {
      this.sendResponse(request, false, err.message ?? 'Failed to start server.');
    }
  }

  private async onStop(request: DAPRequest): Promise<void> {
    if (this.activeLaunchConfig) {
      try {
        await this.processRunner.stop(this.activeLaunchConfig);
      } catch {
        // Best effort — process may have already exited
      }
      this.activeLaunchConfig = undefined;
      this.activeServerId = undefined;
    }
    this.sendResponse(request, true);
  }

  private resolveConfig(launchConfig: TomcatLaunchConfig): ResolvedConfig | undefined {
    let resolved: ResolvedConfig | undefined;

    // If serverId is explicitly provided in launch config, use it directly
    if (launchConfig.serverId) {
      resolved = this.configLoader.resolveForServer(launchConfig.serverId);
    } else {
      // Try workspace launch.json (serverId + catalinaOpts/javaOpts)
      resolved = this.configLoader.resolveFromWorkspace();
      if (!resolved) {
        // Fall back to single-server auto-select
        const servers = this.configLoader.getAvailableServers();
        if (servers.length === 1) {
          resolved = this.configLoader.resolveForServer(servers[0].id);
        }
      }
    }

    if (!resolved) {
      return undefined;
    }

    // Merge catalinaOpts/javaOpts from the launch config with server defaults
    if (launchConfig.catalinaOpts) {
      resolved.catalinaOpts = `${resolved.catalinaOpts} ${launchConfig.catalinaOpts}`.trim();
    }
    if (launchConfig.javaOpts) {
      resolved.javaOpts = `${resolved.javaOpts} ${launchConfig.javaOpts}`.trim();
    }

    return resolved;
  }

  private sendResponse(request: DAPRequest, success: boolean, message?: string, body?: any): void {
    const response: DAPResponse = {
      seq: this.seq++,
      type: 'response',
      request_seq: request.seq,
      command: request.command,
      success,
      message,
      body,
    };
    this._onDidSendMessage.fire(response);
  }

  private sendEvent(event: string, body?: any): void {
    const evt: DAPEvent = {
      seq: this.seq++,
      type: 'event',
      event,
      body,
    };
    this._onDidSendMessage.fire(evt);
  }

  dispose(): void {
    this._onDidSendMessage.dispose();
  }
}
