export const window = {
  showErrorMessage: jest.fn(),
  showInformationMessage: jest.fn(),
  showQuickPick: jest.fn(),
};

export const workspace = {
  workspaceFolders: undefined as
    | { name: string; uri: { fsPath: string } }[]
    | undefined,
};
