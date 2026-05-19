import * as vscode from 'vscode';

const DEFAULT_TIMEOUT_MS = 3_000;

export function showTransientInfo(message: string, timeoutMs: number = DEFAULT_TIMEOUT_MS): void {
  const sticky = vscode.workspace.getConfiguration('tomcatManager').get<boolean>('stickyNotifications', false);
  if (sticky) {
    void vscode.window.showInformationMessage(message);
    return;
  }
  void vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: message },
    () => new Promise<void>(resolve => setTimeout(resolve, timeoutMs)),
  );
}
