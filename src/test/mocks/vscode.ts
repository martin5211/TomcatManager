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
};
