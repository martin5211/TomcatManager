import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigLoader } from '../core/configLoader';

const EXAMPLE_CONFIG = `{
  "servers": [
    {
      "id": "tomcat9",
      "name": "Tomcat 9 Dev",
      "tomcatHome": "C:/apache-tomcat-9.0.85",
      "jdkHome": "C:/Program Files/Java/jdk-17",
      "defaultJavaOpts": "-Xms256m -Xmx512m",
      "defaultCatalinaOpts": "-Denv=dev"
    }
  ],
  "projects": {
    "my-webapp": {
      "serverId": "tomcat9",
      "javaOpts": "-Xms128m -Xmx256m",
      "catalinaOpts": "-Dapp.config=local"
    }
  }
}
`;

export function register(context: vscode.ExtensionContext, configLoader: ConfigLoader): vscode.Disposable {
  return vscode.commands.registerCommand('tomcatManager.configureServers', async () => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      vscode.window.showErrorMessage('No workspace folder open.');
      return;
    }

    const configPath = path.join(folder.uri.fsPath, 'tomcat.servers.json');

    if (!fs.existsSync(configPath)) {
      fs.writeFileSync(configPath, EXAMPLE_CONFIG, 'utf-8');
    }

    const doc = await vscode.workspace.openTextDocument(configPath);
    await vscode.window.showTextDocument(doc);
  });
}
