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
import { TomcatDebugConfigProvider } from './debug/tomcatDebugConfigProvider';
import { TomcatDebugAdapterFactory } from './debug/tomcatDebugAdapterFactory';

export function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel('Tomcat Manager');
  const configLoader = new ConfigLoader();
  configLoader.setWarner((msg) => outputChannel.appendLine(`[config] ${msg}`));
  const processRunner = new ProcessRunner(outputChannel);
  const manager = new TomcatManager(configLoader, processRunner, outputChannel);

  configLoader.loadConfig().catch(() => {
    outputChannel.appendLine('No Tomcat servers configured. Use "Tomcat: Configure Servers" to open settings.');
  });

  const debugProvider = new TomcatDebugConfigProvider(configLoader);
  const debugFactory = new TomcatDebugAdapterFactory(processRunner, configLoader, manager);

  const updateRunButtonContext = () => {
    void vscode.commands.executeCommand(
      'setContext',
      'tomcatManager.hasLaunchConfig',
      configLoader.hasTomcatLaunchConfig(),
    );
  };
  const updateIsRunningContext = () => {
    void vscode.commands.executeCommand(
      'setContext',
      'tomcatManager.isRunning',
      processRunner.isAnyRunning(),
    );
  };
  updateRunButtonContext();
  updateIsRunningContext();

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('launch')) {
        updateRunButtonContext();
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(updateRunButtonContext),
    processRunner.onDidChangeRunning(updateIsRunningContext),
    configLoader.watchConfig(() => configLoader.loadConfig().catch((err: unknown) => {
      outputChannel.appendLine(`Config reload failed: ${err instanceof Error ? err.message : String(err)}`);
    })),
    deploy.register(context, manager, configLoader),
    clean.register(context, manager, configLoader),
    run.register(context, manager, configLoader),
    stop.register(context, manager, configLoader),
    restart.register(context, manager, configLoader),
    configureServers.register(context, configLoader),
    vscode.debug.registerDebugConfigurationProvider('tomcat', debugProvider),
    vscode.debug.registerDebugConfigurationProvider('tomcat', debugProvider, vscode.DebugConfigurationProviderTriggerKind.Dynamic),
    vscode.debug.registerDebugAdapterDescriptorFactory('tomcat', debugFactory),
    outputChannel,
    { dispose: () => manager.dispose() },
  );
}

export function deactivate() {}
