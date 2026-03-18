import { TomcatDebugAdapter } from '../debug/tomcatDebugAdapter';
import { ResolvedConfig, TomcatServer } from '../types/config';

import * as vscode from 'vscode';

const sampleServer: TomcatServer = {
  id: 'tomcat9',
  name: 'Tomcat 9',
  tomcatHome: '/opt/tomcat9',
  jdkHome: '/usr/lib/jvm/java-17',
};

const sampleConfig: ResolvedConfig = {
  server: sampleServer,
  catalinaOpts: '',
  javaOpts: '',
};

function createMocks() {
  const exitResolve: { resolve?: (code: number | null) => void } = {};
  const onExit = new Promise<number | null>((resolve) => {
    exitResolve.resolve = resolve;
  });

  const processRunner = {
    run: jest.fn().mockResolvedValue({ onExit }),
    stop: jest.fn().mockResolvedValue(undefined),
    isRunning: jest.fn().mockReturnValue(false),
    killAll: jest.fn(),
  };

  const configLoader = {
    resolveForServer: jest.fn().mockReturnValue(sampleConfig),
    resolveFromWorkspace: jest.fn(),
    getAvailableServers: jest.fn().mockReturnValue([sampleServer]),
    loadConfig: jest.fn(),
  };

  const outputChannel = {
    appendLine: jest.fn(),
    show: jest.fn(),
  };

  const manager = {
    deployOnly: jest.fn().mockResolvedValue(undefined),
  };

  return { processRunner, configLoader, outputChannel, manager, exitResolve };
}

function createAdapter(mocks: ReturnType<typeof createMocks>) {
  return new TomcatDebugAdapter(
    mocks.processRunner as any,
    mocks.configLoader as any,
    mocks.outputChannel as any,
    mocks.manager as any,
  );
}

function sendRequest(adapter: TomcatDebugAdapter, command: string, args?: any): Promise<any> {
  return new Promise((resolve) => {
    adapter.onDidSendMessage((msg: any) => {
      if (msg.type === 'response' && msg.command === command) {
        resolve(msg);
      }
    });
    adapter.handleMessage({
      seq: 1,
      type: 'request',
      command,
      arguments: args,
    } as any);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  (vscode.workspace as any).workspaceFolders = undefined;
  (vscode.window as any).activeTextEditor = undefined;
});

describe('TomcatDebugAdapter', () => {
  it('initialize responds with success', async () => {
    const mocks = createMocks();
    const adapter = createAdapter(mocks);

    const response = await sendRequest(adapter, 'initialize');
    expect(response.success).toBe(true);
  });

  it('launch calls processRunner.run() with correct config', async () => {
    const mocks = createMocks();
    const adapter = createAdapter(mocks);

    const response = await sendRequest(adapter, 'launch', {
      type: 'tomcat',
      request: 'launch',
      name: 'Run Tomcat',
      serverId: 'tomcat9',
    });

    expect(response.success).toBe(true);
    expect(mocks.processRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({ server: sampleServer }),
    );
  });

  it('launch with jpda prepends JPDA agent to catalinaOpts', async () => {
    const mocks = createMocks();
    const adapter = createAdapter(mocks);

    await sendRequest(adapter, 'launch', {
      type: 'tomcat',
      request: 'launch',
      name: 'Debug Tomcat',
      serverId: 'tomcat9',
      jpda: true,
      jpdaPort: 5005,
      jpdaSuspend: true,
    });

    const runArg = mocks.processRunner.run.mock.calls[0][0] as ResolvedConfig;
    expect(runArg.catalinaOpts).toContain('-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=*:5005');
  });

  it('disconnect calls processRunner.stop()', async () => {
    const mocks = createMocks();
    const adapter = createAdapter(mocks);

    // First launch
    await sendRequest(adapter, 'launch', {
      type: 'tomcat',
      request: 'launch',
      name: 'Run Tomcat',
      serverId: 'tomcat9',
    });

    // Then disconnect
    const response = await sendRequest(adapter, 'disconnect');
    expect(response.success).toBe(true);
    expect(mocks.processRunner.stop).toHaveBeenCalledWith(
      expect.objectContaining({ server: sampleServer }),
    );
  });

  it('terminate calls processRunner.stop()', async () => {
    const mocks = createMocks();
    const adapter = createAdapter(mocks);

    await sendRequest(adapter, 'launch', {
      type: 'tomcat',
      request: 'launch',
      name: 'Run Tomcat',
      serverId: 'tomcat9',
    });

    const response = await sendRequest(adapter, 'terminate');
    expect(response.success).toBe(true);
    expect(mocks.processRunner.stop).toHaveBeenCalled();
  });

  it('returns error when server is already running', async () => {
    const mocks = createMocks();
    mocks.processRunner.isRunning.mockReturnValue(true);
    const adapter = createAdapter(mocks);

    const response = await sendRequest(adapter, 'launch', {
      type: 'tomcat',
      request: 'launch',
      name: 'Run Tomcat',
      serverId: 'tomcat9',
    });

    expect(response.success).toBe(false);
    expect(response.message).toContain('already running');
  });

  it('returns error when config cannot be resolved', async () => {
    const mocks = createMocks();
    mocks.configLoader.resolveForServer.mockReturnValue(undefined);
    mocks.configLoader.getAvailableServers.mockReturnValue([]);
    const adapter = createAdapter(mocks);

    const response = await sendRequest(adapter, 'launch', {
      type: 'tomcat',
      request: 'launch',
      name: 'Run Tomcat',
      serverId: 'nonexistent',
    });

    expect(response.success).toBe(false);
    expect(response.message).toContain('Could not resolve');
  });
});
