# Building and Installing Tomcat Manager

## Prerequisites

- Node.js 18+
- VS Code 1.85+
- npm (comes with Node)

## Build

    git clone <repo-url> && cd TomcatManager
    npm install
    npm run compile

## Run in Development

Open this folder in VS Code and press **F5**. A new VS Code window (Extension Development Host)
will open with the extension loaded. Configure your Tomcat servers via VS Code settings
(`tomcatManager.servers`), or run **Tomcat: Configure Servers** from the command palette to open the settings page.

## Package as .vsix

    npm install -g @vscode/vsce
    vsce package

This creates `tomcat-manager-0.1.0.vsix`.

## Install the .vsix

From VS Code: **Extensions** sidebar → **...** menu → **Install from VSIX...** → pick the file.

Or from the terminal:

    code --install-extension tomcat-manager-0.1.0.vsix

## Uninstall

    code --uninstall-extension tomcat-manager.tomcat-manager
