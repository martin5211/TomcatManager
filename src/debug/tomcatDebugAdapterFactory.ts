import * as vscode from 'vscode';
import { ProcessRunner } from '../core/processRunner';
import { ConfigLoader } from '../core/configLoader';
import { TomcatManager } from '../core/tomcatManager';
import { TomcatDebugAdapter } from './tomcatDebugAdapter';

export class TomcatDebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory {
  constructor(
    private processRunner: ProcessRunner,
    private configLoader: ConfigLoader,
    private outputChannel: vscode.OutputChannel,
    private manager: TomcatManager,
  ) {}

  createDebugAdapterDescriptor(): vscode.DebugAdapterDescriptor {
    const adapter = new TomcatDebugAdapter(this.processRunner, this.configLoader, this.outputChannel, this.manager);
    return new vscode.DebugAdapterInlineImplementation(adapter);
  }
}
