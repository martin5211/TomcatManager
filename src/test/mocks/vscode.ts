export const window = {
  showErrorMessage: jest.fn(),
  showInformationMessage: jest.fn(),
  showQuickPick: jest.fn(),
  activeTextEditor: undefined as
    | { document: { uri: { fsPath: string } } }
    | undefined,
};

export const workspace = {
  workspaceFolders: undefined as
    | { name: string; uri: { fsPath: string } }[]
    | undefined,
  getWorkspaceFolder: jest.fn(),
  getConfiguration: jest.fn().mockReturnValue({
    get: jest.fn().mockReturnValue([]),
    update: jest.fn().mockResolvedValue(undefined),
  }),
  onDidChangeConfiguration: jest.fn().mockReturnValue({ dispose: jest.fn() }),
};

export const debug = {
  startDebugging: jest.fn().mockResolvedValue(true),
};

export class EventEmitter {
  private listeners: Array<(...args: any[]) => void> = [];
  event = (listener: (...args: any[]) => void) => {
    this.listeners.push(listener);
    return { dispose: () => { this.listeners = this.listeners.filter(l => l !== listener); } };
  };
  fire(data: any) {
    for (const listener of this.listeners) {
      listener(data);
    }
  }
  dispose() {
    this.listeners = [];
  }
}

export class DebugAdapterInlineImplementation {
  constructor(public adapter: any) {}
}

export class DebugAdapter {}
