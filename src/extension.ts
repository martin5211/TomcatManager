import * as vscode from 'vscode';
import { ConfigLoader } from './core/configLoader';
import { ProcessRunner } from './core/processRunner';
import { TomcatManager } from './core/tomcatManager';
import * as deploy from './commands/deploy';
import * as clean from './commands/clean';
import * as run from './commands/run';
import * as stop from './commands/stop';
import * as restart from './commands/restart';
import * as configureServers from './commands/configureServers';

export function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel('Tomcat Manager');
  const configLoader = new ConfigLoader();
  const processRunner = new ProcessRunner(outputChannel);
  const manager = new TomcatManager(configLoader, processRunner, outputChannel);

  configLoader.loadConfig().catch(() => {
    outputChannel.appendLine('No Tomcat servers configured. Use "Tomcat: Configure Servers" to open settings.');
  });

  context.subscriptions.push(
    configLoader.watchConfig(() => configLoader.loadConfig().catch(() => {})),
    deploy.register(context, manager, configLoader),
    clean.register(context, manager, configLoader),
    run.register(context, manager, configLoader),
    stop.register(context, manager, configLoader),
    restart.register(context, manager, configLoader),
    configureServers.register(context, configLoader),
    outputChannel,
    { dispose: () => manager.dispose() },
  );
}

export function deactivate() {}
