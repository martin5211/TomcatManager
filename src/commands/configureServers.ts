import * as vscode from 'vscode';
import { ConfigLoader } from '../core/configLoader';

export function register(context: vscode.ExtensionContext, configLoader: ConfigLoader): vscode.Disposable {
  return vscode.commands.registerCommand('tomcatManager.configureServers', async () => {
    await vscode.commands.executeCommand('workbench.action.openSettings', 'tomcatManager');
  });
}
