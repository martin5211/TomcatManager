import * as vscode from 'vscode';
import { TomcatManager } from '../core/tomcatManager';
import { ConfigLoader } from '../core/configLoader';

export function register(context: vscode.ExtensionContext, manager: TomcatManager, configLoader: ConfigLoader): vscode.Disposable {
  return vscode.commands.registerCommand('tomcatManager.restart', async () => {
    try {
      await configLoader.loadConfig();
      await manager.restart();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Tomcat Restart: ${msg}`);
    }
  });
}
