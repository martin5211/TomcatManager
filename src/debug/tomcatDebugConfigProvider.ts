import * as vscode from 'vscode';
import { ConfigLoader } from '../core/configLoader';

export class TomcatDebugConfigProvider implements vscode.DebugConfigurationProvider {
  constructor(private configLoader: ConfigLoader) {}

  provideDebugConfigurations(): vscode.DebugConfiguration[] {
    return [
      {
        type: 'tomcat',
        request: 'launch',
        name: 'Run Tomcat',
      },
      {
        type: 'tomcat',
        request: 'launch',
        name: 'Debug Tomcat (JPDA)',
        jpda: true,
        jpdaPort: 8000,
      },
    ];
  }

  resolveDebugConfiguration(
    folder: vscode.WorkspaceFolder | undefined,
    config: vscode.DebugConfiguration,
  ): vscode.DebugConfiguration | undefined {
    // If launch.json is missing or the config is empty, provide defaults
    if (!config.type && !config.request && !config.name) {
      config.type = 'tomcat';
      config.request = 'launch';
      config.name = 'Run Tomcat';
    }

    // Try to auto-fill serverId from workspace settings
    if (!config.serverId) {
      const resolved = this.configLoader.resolveFromWorkspace();
      if (resolved) {
        config.serverId = resolved.server.id;
      }
    }

    return config;
  }
}
