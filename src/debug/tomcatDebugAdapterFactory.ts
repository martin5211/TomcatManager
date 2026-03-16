import * as vscode from 'vscode';
import { ProcessRunner } from '../core/processRunner';
import { ConfigLoader } from '../core/configLoader';
import { TomcatDebugAdapter } from './tomcatDebugAdapter';

export class TomcatDebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory {
  constructor(
    private processRunner: ProcessRunner,
    private configLoader: ConfigLoader,
    private outputChannel: vscode.OutputChannel,
  ) {}

  createDebugAdapterDescriptor(): vscode.DebugAdapterDescriptor {
    const adapter = new TomcatDebugAdapter(this.processRunner, this.configLoader, this.outputChannel);
    return new vscode.DebugAdapterInlineImplementation(adapter);
  }
}
