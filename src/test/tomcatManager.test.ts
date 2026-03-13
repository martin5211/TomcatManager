import { TomcatManager } from '../core/tomcatManager';
import { ResolvedConfig, TomcatServer } from '../types/config';

// The vscode mock
import * as vscode from 'vscode';

import * as fs from 'fs';
jest.mock('fs');

const mockedFs = fs as jest.Mocked<typeof fs>;
const mockedVscode = vscode as jest.Mocked<typeof vscode>;

// Setup

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
  const configLoader = {
    resolveForServer: jest.fn(),
    resolveForProject: jest.fn(),
    getAvailableServers: jest.fn().mockReturnValue([]),
  };

  const processRunner = {
    run: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    isRunning: jest.fn().mockReturnValue(false),
    killAll: jest.fn(),
  };

  const outputChannel = {
    appendLine: jest.fn(),
    show: jest.fn(),
  };

  return { configLoader, processRunner, outputChannel };
}

function createManager(overrides?: Partial<ReturnType<typeof createMocks>>) {
  const mocks = createMocks();
  Object.assign(mocks, overrides);
  const manager = new TomcatManager(
    mocks.configLoader as any,
    mocks.processRunner as any,
    mocks.outputChannel as any,
  );
  return { manager, ...mocks };
}

// Helpers

/** Set the vscode workspace folder mock */
function setWorkspaceFolder(fsPath: string, name = 'my-app') {
  (vscode.workspace as any).workspaceFolders = [{ name, uri: { fsPath } }];
}

function clearWorkspaceFolder() {
  (vscode.workspace as any).workspaceFolders = undefined;
}

// Tests

beforeEach(() => {
  jest.clearAllMocks();
  clearWorkspaceFolder();
});

// resolveConfig

describe('resolveConfig', () => {
  it('returns config when serverId is provided and found', async () => {
    const { manager, configLoader } = createManager();
    configLoader.resolveForServer.mockReturnValue(sampleConfig);

    await manager.run('tomcat9');

    expect(configLoader.resolveForServer).toHaveBeenCalledWith('tomcat9');
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      'Tomcat 9 started.',
    );
  });

  it('shows error when serverId is not found', async () => {
    const { manager, configLoader } = createManager();
    configLoader.resolveForServer.mockReturnValue(undefined);

    await manager.run('missing');

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      'Server "missing" not found in configuration.',
    );
  });

  it('resolves from workspace folder name when no serverId', async () => {
    setWorkspaceFolder('/home/user/my-app');
    const { manager, configLoader } = createManager();
    configLoader.resolveForProject.mockReturnValue(sampleConfig);

    await manager.run();

    expect(configLoader.resolveForProject).toHaveBeenCalledWith('my-app');
  });

  it('falls back to pickServer when no project mapping', async () => {
    setWorkspaceFolder('/home/user/my-app');
    const { manager, configLoader } = createManager();
    configLoader.resolveForProject.mockReturnValue(undefined);
    configLoader.getAvailableServers.mockReturnValue([sampleServer]);
    (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({
      label: sampleServer.name,
      description: sampleServer.id,
      server: sampleServer,
    });
    configLoader.resolveForServer.mockReturnValue(sampleConfig);

    await manager.run();

    expect(vscode.window.showQuickPick).toHaveBeenCalled();
    expect(configLoader.resolveForServer).toHaveBeenCalledWith('tomcat9');
  });

  it('shows error when no workspace folder is open', async () => {
    clearWorkspaceFolder();
    const { manager } = createManager();

    await manager.run();

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      'No workspace folder open.',
    );
  });
});

// run()

describe('run()', () => {
  it('calls processRunner.run() and shows success message', async () => {
    const { manager, configLoader, processRunner } = createManager();
    configLoader.resolveForServer.mockReturnValue(sampleConfig);

    await manager.run('tomcat9');

    expect(processRunner.run).toHaveBeenCalledWith(sampleConfig);
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      'Tomcat 9 started.',
    );
  });

  it('shows error message on failure', async () => {
    const { manager, configLoader, processRunner } = createManager();
    configLoader.resolveForServer.mockReturnValue(sampleConfig);
    processRunner.run.mockRejectedValue(new Error('port in use'));

    await manager.run('tomcat9');

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      'Failed to start: port in use',
    );
  });
});

// stop()

describe('stop()', () => {
  it('calls processRunner.stop() and shows success message', async () => {
    const { manager, configLoader, processRunner } = createManager();
    configLoader.resolveForServer.mockReturnValue(sampleConfig);

    await manager.stop('tomcat9');

    expect(processRunner.stop).toHaveBeenCalledWith(sampleConfig);
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      'Tomcat 9 stopped.',
    );
  });

  it('shows error message on failure', async () => {
    const { manager, configLoader, processRunner } = createManager();
    configLoader.resolveForServer.mockReturnValue(sampleConfig);
    processRunner.stop.mockRejectedValue(new Error('not running'));

    await manager.stop('tomcat9');

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      'Failed to stop: not running',
    );
  });
});

// restart()

describe('restart()', () => {
  it('stops first if running, then starts', async () => {
    const { manager, configLoader, processRunner } = createManager();
    configLoader.resolveForServer.mockReturnValue(sampleConfig);
    processRunner.isRunning.mockReturnValue(true);

    await manager.restart('tomcat9');

    expect(processRunner.stop).toHaveBeenCalledWith(sampleConfig);
    expect(processRunner.run).toHaveBeenCalledWith(sampleConfig);
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      'Tomcat 9 restarted.',
    );
  });

  it('starts without stopping if not running', async () => {
    const { manager, configLoader, processRunner } = createManager();
    configLoader.resolveForServer.mockReturnValue(sampleConfig);
    processRunner.isRunning.mockReturnValue(false);

    await manager.restart('tomcat9');

    expect(processRunner.stop).not.toHaveBeenCalled();
    expect(processRunner.run).toHaveBeenCalledWith(sampleConfig);
  });

  it('shows error on failure', async () => {
    const { manager, configLoader, processRunner } = createManager();
    configLoader.resolveForServer.mockReturnValue(sampleConfig);
    processRunner.run.mockRejectedValue(new Error('boom'));

    await manager.restart('tomcat9');

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      'Failed to restart: boom',
    );
  });
});

// deploy()

describe('deploy()', () => {
  beforeEach(() => {
    setWorkspaceFolder('/home/user/my-app');
  });

  it('finds single WAR in target/ and copies it', async () => {
    const { manager, configLoader } = createManager();
    configLoader.resolveForServer.mockReturnValue(sampleConfig);

    mockedFs.existsSync.mockImplementation((p: fs.PathLike) => {
      const s = String(p);
      if (s.includes('target')) return true;
      if (s.includes('webapps')) return true;
      return false;
    });
    mockedFs.readdirSync.mockImplementation(((p: string) => {
      if (String(p).includes('target')) return ['app.war'];
      return [];
    }) as any);
    mockedFs.copyFileSync.mockImplementation(() => {});

    await manager.deploy('tomcat9');

    expect(mockedFs.copyFileSync).toHaveBeenCalledWith(
      expect.stringContaining('app.war'),
      expect.stringContaining('webapps'),
    );
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      'Deployed app.war to Tomcat 9.',
    );
  });

  it('shows quick pick when multiple WARs found', async () => {
    const { manager, configLoader } = createManager();
    configLoader.resolveForServer.mockReturnValue(sampleConfig);

    mockedFs.existsSync.mockImplementation((p: fs.PathLike) => {
      const s = String(p);
      if (s.includes('target')) return true;
      if (s.includes('webapps')) return true;
      return false;
    });
    mockedFs.readdirSync.mockImplementation(((p: string) => {
      if (String(p).includes('target')) return ['a.war', 'b.war'];
      return [];
    }) as any);
    mockedFs.copyFileSync.mockImplementation(() => {});

    (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({
      label: 'b.war',
      filePath: '/home/user/my-app/target/b.war',
    });

    await manager.deploy('tomcat9');

    expect(vscode.window.showQuickPick).toHaveBeenCalled();
    expect(mockedFs.copyFileSync).toHaveBeenCalledWith(
      '/home/user/my-app/target/b.war',
      expect.stringContaining('b.war'),
    );
  });

  it('shows error when no WAR found', async () => {
    const { manager, configLoader } = createManager();
    configLoader.resolveForServer.mockReturnValue(sampleConfig);

    mockedFs.existsSync.mockReturnValue(false);

    await manager.deploy('tomcat9');

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      'No WAR file found in target/, build/libs/, dist/, or workspace root.',
    );
  });

  it('creates webapps/ directory if missing', async () => {
    const { manager, configLoader } = createManager();
    configLoader.resolveForServer.mockReturnValue(sampleConfig);

    mockedFs.existsSync.mockImplementation((p: fs.PathLike) => {
      const s = String(p);
      if (s.includes('target')) return true;
      if (s.includes('webapps')) return false; // webapps does not exist
      return false;
    });
    mockedFs.readdirSync.mockImplementation(((p: string) => {
      if (String(p).includes('target')) return ['app.war'];
      return [];
    }) as any);
    mockedFs.mkdirSync.mockImplementation((() => undefined) as any);
    mockedFs.copyFileSync.mockImplementation(() => {});

    await manager.deploy('tomcat9');

    expect(mockedFs.mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('webapps'),
      { recursive: true },
    );
  });
});

// clean()

describe('clean()', () => {
  it('stops server if running before cleaning', async () => {
    const { manager, configLoader, processRunner } = createManager();
    configLoader.resolveForServer.mockReturnValue(sampleConfig);
    processRunner.isRunning.mockReturnValue(true);

    mockedFs.existsSync.mockReturnValue(false);

    await manager.clean('tomcat9');

    expect(processRunner.stop).toHaveBeenCalledWith(sampleConfig);
  });

  it('cleans work/ and temp/ directories', async () => {
    const { manager, configLoader } = createManager();
    configLoader.resolveForServer.mockReturnValue(sampleConfig);

    mockedFs.existsSync.mockImplementation((p: fs.PathLike) => {
      const s = String(p);
      return s.includes('work') || s.includes('temp');
    });
    mockedFs.readdirSync.mockImplementation(((p: string) => {
      if (String(p).includes('work')) return ['Catalina'];
      if (String(p).includes('temp')) return ['upload_123'];
      return [];
    }) as any);
    mockedFs.rmSync.mockImplementation((() => {}) as any);

    await manager.clean('tomcat9');

    expect(mockedFs.rmSync).toHaveBeenCalledWith(
      expect.stringContaining('Catalina'),
      { recursive: true, force: true },
    );
    expect(mockedFs.rmSync).toHaveBeenCalledWith(
      expect.stringContaining('upload_123'),
      { recursive: true, force: true },
    );
  });

  it('preserves ROOT, manager, host-manager in webapps/', async () => {
    const { manager, configLoader } = createManager();
    configLoader.resolveForServer.mockReturnValue(sampleConfig);

    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readdirSync.mockImplementation(((p: string) => {
      const s = String(p);
      if (s.includes('webapps'))
        return ['ROOT', 'manager', 'host-manager', 'myapp', 'myapp.war'];
      return []; // work/ and temp/ empty
    }) as any);
    mockedFs.rmSync.mockImplementation((() => {}) as any);

    await manager.clean('tomcat9');

    // Remove myapp and myapp.war but NOT ROOT/manager/host-manager
    const rmCalls = mockedFs.rmSync.mock.calls.map(c => String(c[0]));
    expect(rmCalls.some(p => p.includes('myapp'))).toBe(true);
    expect(rmCalls.some(p => p.includes('myapp.war'))).toBe(true);
    expect(rmCalls.some(p => p.includes('ROOT'))).toBe(false);
    expect(rmCalls.some(p => p.includes('manager') && !p.includes('host-manager'))).toBe(false);
    expect(rmCalls.some(p => p.includes('host-manager'))).toBe(false);
  });
});

// dispose()

describe('dispose()', () => {
  it('calls processRunner.killAll()', () => {
    const { manager, processRunner } = createManager();

    manager.dispose();

    expect(processRunner.killAll).toHaveBeenCalled();
  });
});
