import { ConfigLoader } from '../core/configLoader';
import * as vscode from 'vscode';

jest.mock('fs', () => ({
  promises: {
    access: jest.fn().mockResolvedValue(undefined),
  },
}));

import * as fs from 'fs';

const mockedAccess = (fs as any).promises.access as jest.Mock;

function setServers(servers: any[]) {
  (vscode.workspace.getConfiguration as jest.Mock).mockImplementation((section?: string) => ({
    get: (key: string, def: any) => {
      if (section === 'tomcatManager' && key === 'servers') return servers;
      return def;
    },
    update: jest.fn().mockResolvedValue(undefined),
  }));
}

function setLaunchConfigurations(configs: any[]) {
  (vscode.workspace.getConfiguration as jest.Mock).mockImplementation((section?: string) => ({
    get: (key: string, def: any) => {
      if (section === 'tomcatManager' && key === 'servers') return currentServers;
      if (section === 'launch' && key === 'configurations') return configs;
      return def;
    },
    update: jest.fn().mockResolvedValue(undefined),
  }));
}

let currentServers: any[] = [];

/**
 * Set per-folder launch configurations. Pass a single array to apply to all folders,
 * or pass a function (folderUri => configs[]) for per-folder customization.
 */
function setLaunchConfigsByFolder(resolve: (folderUri: any) => any[]) {
  (vscode.workspace.getConfiguration as jest.Mock).mockImplementation((section?: string, scope?: any) => ({
    get: (key: string, def: any) => {
      if (section === 'tomcatManager' && key === 'servers') return currentServers;
      if (section === 'launch' && key === 'configurations') return resolve(scope);
      return def;
    },
    update: jest.fn().mockResolvedValue(undefined),
  }));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedAccess.mockResolvedValue(undefined);
  currentServers = [];
  (vscode.workspace as any).workspaceFolders = undefined;
});

describe('ConfigLoader.validate', () => {
  it('accepts a well-formed server list', async () => {
    setServers([
      { id: 'a', name: 'A', tomcatHome: '/a', jdkHome: '/jdk' },
    ]);
    const loader = new ConfigLoader();
    await expect(loader.loadConfig()).resolves.toBeDefined();
  });

  it('rejects servers missing required fields', async () => {
    setServers([{ id: 'a', name: 'A', tomcatHome: '/a' /* jdkHome missing */ }]);
    const loader = new ConfigLoader();
    await expect(loader.loadConfig()).rejects.toThrow(/missing required fields/);
  });

  it('rejects duplicate ids', async () => {
    setServers([
      { id: 'dup', name: 'A', tomcatHome: '/a', jdkHome: '/jdk' },
      { id: 'dup', name: 'B', tomcatHome: '/b', jdkHome: '/jdk' },
    ]);
    const loader = new ConfigLoader();
    await expect(loader.loadConfig()).rejects.toThrow(/duplicate server id "dup"/);
  });
});

describe('ConfigLoader.warnOnMissingPaths', () => {
  it('emits a warning per missing path via the warner callback', async () => {
    setServers([
      { id: 'a', name: 'A', tomcatHome: '/missing/tomcat', jdkHome: '/missing/jdk' },
    ]);
    mockedAccess.mockRejectedValue(new Error('ENOENT'));

    const warnings: string[] = [];
    const loader = new ConfigLoader();
    loader.setWarner((m) => warnings.push(m));
    await loader.loadConfig();
    // Let the void-fired path checks settle
    await new Promise(r => setImmediate(r));

    expect(warnings.length).toBe(2);
    expect(warnings.some(w => w.includes('tomcatHome'))).toBe(true);
    expect(warnings.some(w => w.includes('jdkHome'))).toBe(true);
  });
});

describe('ConfigLoader.resolveForServerInWorkspace', () => {
  const baseServer = {
    id: 'tomcat9',
    name: 'Tomcat 9',
    tomcatHome: '/opt/tomcat9',
    jdkHome: '/jdk',
    defaultCatalinaOpts: '-Xms256m',
  };

  it('merges launch.json catalinaOpts on top of server defaults', async () => {
    currentServers = [baseServer];
    setLaunchConfigurations([
      { type: 'tomcat', request: 'launch', name: 'Run', catalinaOpts: '-Xmx1g' },
    ]);
    const loader = new ConfigLoader();
    await loader.loadConfig();

    const resolved = loader.resolveForServerInWorkspace('tomcat9');
    expect(resolved?.catalinaOpts).toBe('-Xms256m -Xmx1g');
  });

  it('prefers a launch config that targets the same serverId', async () => {
    currentServers = [baseServer];
    setLaunchConfigurations([
      { type: 'tomcat', request: 'launch', name: 'Other', serverId: 'other', catalinaOpts: '-Xmx2g' },
      { type: 'tomcat', request: 'launch', name: 'Mine', serverId: 'tomcat9', catalinaOpts: '-Xmx512m' },
    ]);
    const loader = new ConfigLoader();
    await loader.loadConfig();

    const resolved = loader.resolveForServerInWorkspace('tomcat9');
    expect(resolved?.catalinaOpts).toBe('-Xms256m -Xmx512m');
  });

  it('returns undefined for an unknown server id', async () => {
    currentServers = [baseServer];
    setLaunchConfigurations([]);
    const loader = new ConfigLoader();
    await loader.loadConfig();

    expect(loader.resolveForServerInWorkspace('nope')).toBeUndefined();
  });
});

describe('ConfigLoader.hasTomcatLaunchConfig', () => {
  it('returns false when there are no workspace folders and no workspace-level configs', () => {
    setLaunchConfigsByFolder(() => []);
    const loader = new ConfigLoader();
    expect(loader.hasTomcatLaunchConfig()).toBe(false);
  });

  it('returns false when no folder has a tomcat-type config', () => {
    (vscode.workspace as any).workspaceFolders = [
      { name: 'a', uri: { fsPath: '/a' } },
      { name: 'b', uri: { fsPath: '/b' } },
    ];
    setLaunchConfigsByFolder(() => [
      { type: 'node', request: 'launch', name: 'Node' },
    ]);
    const loader = new ConfigLoader();
    expect(loader.hasTomcatLaunchConfig()).toBe(false);
  });

  it('returns true when at least one folder has a tomcat-type config', () => {
    const folderA = { name: 'a', uri: { fsPath: '/a' } };
    const folderB = { name: 'b', uri: { fsPath: '/b' } };
    (vscode.workspace as any).workspaceFolders = [folderA, folderB];
    setLaunchConfigsByFolder((scope) => {
      if (scope === folderA.uri) return [{ type: 'node', request: 'launch', name: 'Node' }];
      if (scope === folderB.uri) return [{ type: 'tomcat', request: 'launch', name: 'Run Tomcat' }];
      return [];
    });
    const loader = new ConfigLoader();
    expect(loader.hasTomcatLaunchConfig()).toBe(true);
  });

  it('returns true when only the workspace-level (multi-root) launch contains a tomcat config', () => {
    (vscode.workspace as any).workspaceFolders = [];
    setLaunchConfigsByFolder((scope) => {
      // workspace-level call passes no scope (undefined)
      if (scope === undefined) return [{ type: 'tomcat', request: 'launch', name: 'Run Tomcat' }];
      return [];
    });
    const loader = new ConfigLoader();
    expect(loader.hasTomcatLaunchConfig()).toBe(true);
  });
});
