# Changelog

## 0.3.0

- **Breaking:** Per-project config moved to `.vscode/launch.json` (type `"tomcat"`) instead of workspace settings:
  - `serverId` — which server to use for this project
  - `catalinaOpts` — project CATALINA_OPTS (appended to server defaults)
  - `javaOpts` — project JAVA_OPTS (appended to server defaults)
- Server `defaultCatalinaOpts`/`defaultJavaOpts` are prepended to launch config values
- Removed `tomcatManager.serverId`, `tomcatManager.catalinaOpts`, `tomcatManager.javaOpts` from workspace settings

## 0.2.0

- Changed to VS Code native Settings UI (`tomcatManager.servers` / `tomcatManager.projects`) instead of `tomcat.servers.json`

## 0.1.6

- Logo changed

## 0.1.5

- Fixed active workspace

## 0.1.4

- Unit tests for tomcatManager.ts

## 0.1.3

- Added icon

## 0.1.2

- Added clean for webapps folder
