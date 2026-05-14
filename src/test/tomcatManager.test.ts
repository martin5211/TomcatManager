import { TomcatManager } from '../core/tomcatManager';
import { ResolvedConfig, TomcatServer } from '../types/config';

import * as vscode from 'vscode';

import * as fs from 'fs';
jest.mock('fs', () => ({
  promises: {
    access: jest.fn(),
    readdir: jest.fn(),
    copyFile: jest.fn(),
    mkdir: jest.fn(),
    rm: jest.fn(),
  },
}));

const mockedFs = fs as unknown as {
  promises: {
    access: jest.Mock;
    readdir: jest.Mock;
    copyFile: jest.Mock;
    mkdir: jest.Mock;
    rm: jest.Mock;
  };
};

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

function exists(): Promise<undefined> {
  return Promise.resolve(undefined);
}
function missing(): Promise<never> {
  return Promise.reject(new Error('ENOENT'));
}

function createMocks() {
  const configLoader = {
    resolveForServer: jest.fn(),
    resolveForServerInWorkspace: jest.fn(),
    resolveFromWorkspace: jest.fn(),
    getAvailableServers: jest.fn().mockReturnValue([]),
  };

  const processRunner = {
    run: jest.fn().mockResolvedValue({
      onExit: Promise.resolve(0),
      ready: Promise.resolve({ detected: true }),
    }),
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

function setWorkspaceFolder(fsPath: string, name = 'my-app') {
  const folder = { name, uri: { fsPath } };
  (vscode.workspace as any).workspaceFolders = [folder];
  (vscode.workspace.getWorkspaceFolder as jest.Mock).mockReturnValue(folder);
}

function clearWorkspaceFolder() {
  (vscode.workspace as any).workspaceFolders = undefined;
  (vscode.window as any).activeTextEditor = undefined;
  (vscode.workspace.getWorkspaceFolder as jest.Mock).mockReturnValue(undefined);
}

beforeEach(() => {
  jest.clearAllMocks();
  clearWorkspaceFolder();
  // Default: deploy step finds nothing (no workspace folder)
  mockedFs.promises.access.mockImplementation(missing);
  mockedFs.promises.readdir.mockResolvedValue([]);
  mockedFs.promises.copyFile.mockResolvedValue(undefined);
  mockedFs.promises.mkdir.mockResolvedValue(undefined);
  mockedFs.promises.rm.mockResolvedValue(undefined);
});

describe('resolveConfig', () => {
  it('returns config when serverId is provided and found', async () => {
    const { manager, configLoader, processRunner } = createManager();
    configLoader.resolveForServer.mockReturnValue(sampleConfig);

    await manager.run('tomcat9');

    expect(configLoader.resolveForServer).toHaveBeenCalledWith('tomcat9');
    expect(processRunner.run).toHaveBeenCalledWith(sampleConfig);
  });

  it('shows error when serverId is not found', async () => {
    const { manager, configLoader } = createManager();
    configLoader.resolveForServer.mockReturnValue(undefined);

    await manager.run('missing');

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      'Server "missing" not found in configuration.',
    );
  });

  it('resolves from workspace settings when no serverId', async () => {
    const { manager, configLoader } = createManager();
    configLoader.resolveFromWorkspace.mockReturnValue(sampleConfig);

    await manager.run();

    expect(configLoader.resolveFromWorkspace).toHaveBeenCalled();
  });

  it('falls back to pickServer (resolveForServerInWorkspace) when no workspace mapping', async () => {
    const { manager, configLoader } = createManager();
    configLoader.resolveFromWorkspace.mockReturnValue(undefined);
    configLoader.getAvailableServers.mockReturnValue([sampleServer]);
    (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({
      label: sampleServer.name,
      description: sampleServer.id,
      server: sampleServer,
    });
    configLoader.resolveForServerInWorkspace.mockReturnValue(sampleConfig);

    await manager.run();

    expect(vscode.window.showQuickPick).toHaveBeenCalled();
    expect(configLoader.resolveForServerInWorkspace).toHaveBeenCalledWith('tomcat9', undefined);
  });

  it('passes the active workspace folder when resolving from workspace', async () => {
    const { manager, configLoader } = createManager();
    setWorkspaceFolder('/home/user/proj', 'proj');
    configLoader.resolveFromWorkspace.mockReturnValue(sampleConfig);

    await manager.run();

    const folderArg = configLoader.resolveFromWorkspace.mock.calls[0][0];
    expect(folderArg?.uri?.fsPath).toBe('/home/user/proj');
  });
});

describe('run()', () => {
  it('calls processRunner.run() and logs readiness to the output channel', async () => {
    const { manager, configLoader, processRunner, outputChannel } = createManager();
    configLoader.resolveForServer.mockReturnValue(sampleConfig);

    await manager.run('tomcat9');
    // allow reportReady microtask to run
    await new Promise(r => setImmediate(r));

    expect(processRunner.run).toHaveBeenCalledWith(sampleConfig);
    const logged = outputChannel.appendLine.mock.calls.map(c => c[0] as string);
    expect(logged.some(l => l.includes('started') && l.includes('Tomcat 9'))).toBe(true);
  });

  it('logs "readiness signal not detected" when ready resolves false', async () => {
    const { manager, configLoader, processRunner, outputChannel } = createManager();
    configLoader.resolveForServer.mockReturnValue(sampleConfig);
    processRunner.run.mockResolvedValue({
      onExit: Promise.resolve(null),
      ready: Promise.resolve({ detected: false }),
    });

    await manager.run('tomcat9');
    await new Promise(r => setImmediate(r));

    const logged = outputChannel.appendLine.mock.calls.map(c => c[0] as string);
    expect(logged.some(l => l.includes('readiness signal not detected'))).toBe(true);
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

describe('restart()', () => {
  it('stops first if running, then starts', async () => {
    const { manager, configLoader, processRunner } = createManager();
    configLoader.resolveForServer.mockReturnValue(sampleConfig);
    processRunner.isRunning.mockReturnValue(true);

    await manager.restart('tomcat9');

    expect(processRunner.stop).toHaveBeenCalledWith(sampleConfig);
    expect(processRunner.run).toHaveBeenCalledWith(sampleConfig);
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

describe('deploy()', () => {
  beforeEach(() => {
    setWorkspaceFolder('/home/user/my-app');
  });

  it('finds single WAR in target/ and copies it', async () => {
    const { manager, configLoader } = createManager();
    configLoader.resolveForServer.mockReturnValue(sampleConfig);

    mockedFs.promises.access.mockImplementation((p: any) => {
      const s = String(p);
      if (s.includes('target') || s.includes('webapps')) return exists();
      return missing();
    });
    mockedFs.promises.readdir.mockImplementation((p: any) => {
      if (String(p).includes('target')) return Promise.resolve(['app.war'] as any);
      return Promise.resolve([] as any);
    });

    await manager.deploy('tomcat9');

    expect(mockedFs.promises.copyFile).toHaveBeenCalledWith(
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

    mockedFs.promises.access.mockImplementation((p: any) => {
      const s = String(p);
      if (s.includes('target') || s.includes('webapps')) return exists();
      return missing();
    });
    mockedFs.promises.readdir.mockImplementation((p: any) => {
      if (String(p).includes('target')) return Promise.resolve(['a.war', 'b.war'] as any);
      return Promise.resolve([] as any);
    });

    (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({
      label: 'b.war',
      filePath: '/home/user/my-app/target/b.war',
    });

    await manager.deploy('tomcat9');

    expect(vscode.window.showQuickPick).toHaveBeenCalled();
    expect(mockedFs.promises.copyFile).toHaveBeenCalledWith(
      '/home/user/my-app/target/b.war',
      expect.stringContaining('b.war'),
    );
  });

  it('shows message when no WAR found', async () => {
    const { manager, configLoader } = createManager();
    configLoader.resolveForServer.mockReturnValue(sampleConfig);

    await manager.deploy('tomcat9');

    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      'No WAR file found to deploy to Tomcat 9.',
    );
  });

  it('creates webapps/ directory if missing', async () => {
    const { manager, configLoader } = createManager();
    configLoader.resolveForServer.mockReturnValue(sampleConfig);

    mockedFs.promises.access.mockImplementation((p: any) => {
      const s = String(p);
      if (s.includes('target')) return exists();
      return missing(); // webapps does not exist
    });
    mockedFs.promises.readdir.mockImplementation((p: any) => {
      if (String(p).includes('target')) return Promise.resolve(['app.war'] as any);
      return Promise.resolve([] as any);
    });

    await manager.deploy('tomcat9');

    expect(mockedFs.promises.mkdir).toHaveBeenCalledWith(
      expect.stringContaining('webapps'),
      { recursive: true },
    );
  });

  it('throws a friendly error when EBUSY (file locked by Tomcat)', async () => {
    const { manager, configLoader } = createManager();
    configLoader.resolveForServer.mockReturnValue(sampleConfig);

    mockedFs.promises.access.mockImplementation((p: any) => {
      const s = String(p);
      if (s.includes('target') || s.includes('webapps')) return exists();
      return missing();
    });
    mockedFs.promises.readdir.mockImplementation((p: any) => {
      if (String(p).includes('target')) return Promise.resolve(['app.war'] as any);
      return Promise.resolve([] as any);
    });
    const ebusy: any = new Error('busy');
    ebusy.code = 'EBUSY';
    mockedFs.promises.copyFile.mockRejectedValue(ebusy);

    // deployOnly throws — friendly EBUSY message bubbles up
    await expect(manager.deploy('tomcat9')).rejects.toThrow(/locked .* Stop the server/);
  });

  it('logs an overwrite notice when destination WAR already exists', async () => {
    const { manager, configLoader, outputChannel } = createManager();
    configLoader.resolveForServer.mockReturnValue(sampleConfig);

    mockedFs.promises.access.mockImplementation((p: any) => {
      // target/, webapps/, and the destination WAR all exist
      const s = String(p);
      if (s.includes('target') || s.includes('webapps')) return exists();
      return missing();
    });
    mockedFs.promises.readdir.mockImplementation((p: any) => {
      if (String(p).includes('target')) return Promise.resolve(['app.war'] as any);
      return Promise.resolve([] as any);
    });

    await manager.deploy('tomcat9');

    const logged = outputChannel.appendLine.mock.calls.map(c => c[0] as string);
    expect(logged.some(l => l.includes('Overwriting existing app.war'))).toBe(true);
  });
});

describe('clean()', () => {
  it('stops server if running before cleaning', async () => {
    const { manager, configLoader, processRunner } = createManager();
    configLoader.resolveForServer.mockReturnValue(sampleConfig);
    processRunner.isRunning.mockReturnValue(true);

    await manager.clean('tomcat9');

    expect(processRunner.stop).toHaveBeenCalledWith(sampleConfig);
  });

  it('cleans work/ and temp/ directories', async () => {
    const { manager, configLoader } = createManager();
    configLoader.resolveForServer.mockReturnValue(sampleConfig);

    mockedFs.promises.access.mockImplementation((p: any) => {
      const s = String(p);
      if (s.includes('work') || s.includes('temp')) return exists();
      return missing();
    });
    mockedFs.promises.readdir.mockImplementation((p: any) => {
      if (String(p).includes('work')) return Promise.resolve(['Catalina'] as any);
      if (String(p).includes('temp')) return Promise.resolve(['upload_123'] as any);
      return Promise.resolve([] as any);
    });

    await manager.clean('tomcat9');

    const rmTargets = mockedFs.promises.rm.mock.calls.map(c => String(c[0]));
    expect(rmTargets.some(t => t.includes('Catalina'))).toBe(true);
    expect(rmTargets.some(t => t.includes('upload_123'))).toBe(true);
  });

  it('preserves ROOT, manager, host-manager, examples, docs in webapps/', async () => {
    const { manager, configLoader } = createManager();
    configLoader.resolveForServer.mockReturnValue(sampleConfig);

    mockedFs.promises.access.mockResolvedValue(undefined);
    mockedFs.promises.readdir.mockImplementation((p: any) => {
      const s = String(p);
      if (s.includes('webapps')) {
        return Promise.resolve(['ROOT', 'manager', 'host-manager', 'examples', 'docs', 'myapp', 'myapp.war'] as any);
      }
      return Promise.resolve([] as any);
    });

    await manager.clean('tomcat9');

    const rmTargets = mockedFs.promises.rm.mock.calls.map(c => String(c[0]));
    expect(rmTargets.some(t => t.endsWith('/myapp') || t.endsWith('\\myapp'))).toBe(true);
    expect(rmTargets.some(t => t.endsWith('myapp.war'))).toBe(true);
    expect(rmTargets.some(t => t.endsWith('ROOT'))).toBe(false);
    expect(rmTargets.some(t => t.endsWith('examples'))).toBe(false);
    expect(rmTargets.some(t => t.endsWith('docs'))).toBe(false);
    expect(rmTargets.some(t => t.endsWith('host-manager'))).toBe(false);
  });
});

describe('dispose()', () => {
  it('calls processRunner.killAll()', () => {
    const { manager, processRunner } = createManager();

    manager.dispose();

    expect(processRunner.killAll).toHaveBeenCalled();
  });
});
