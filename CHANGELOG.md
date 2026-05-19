# Changelog

## 0.3.6

- Shorter shutdown: graceful stop wait reduced from 10s to 2s, Windows force-kill fallback from 5s to 1s
- Info notifications (stop/deploy/clean) auto-dismiss after 3s via `withProgress` instead of waiting for manual dismissal
- Output channel is cleared and focused on each Tomcat run/restart/debug launch
- Auto-debug: when `-agentlib:jdwp` / `-Xrunjdwp` is detected in resolved `catalinaOpts`/`javaOpts`, `Tomcat: Run` launches via the VS Code debug session so the debug toolbar appears and the Java debugger auto-attaches to the parsed port
- New settings (all workspace-overridable):
  - `tomcatManager.stopTimeoutMs` (default 2000) — graceful shutdown wait before force-kill
  - `tomcatManager.killTimeoutMs` (default 1000) — Windows taskkill fallback timeout
  - `tomcatManager.hideRunButton` (default false) — hides the editor-title run/stop button
  - `tomcatManager.stickyNotifications` (default false) — keep info notifications until dismissed

## 0.3.5

- The editor-title play button toggles to a `$(debug-stop)` stop button while Tomcat is running, and back to play once it exits.

## 0.3.4

- Added a play button to the editor title bar for Java and `.properties` files when the workspace has a Tomcat launch configuration; hidden for files under `src/test/`. Click deploys (silently if no WAR is found) then starts Tomcat, matching the command palette flow.

## 0.3.3

- Fix: JPDA attach timer no longer fires after Tomcat exits during the attach delay
- Fix: per-project `catalinaOpts`/`javaOpts` from `launch.json` are honored when launching via the command palette in multi-server setups
- Fix: Windows force-kill now waits for `taskkill` before clearing tracked process state
- Fix: log lines split across stream chunks no longer produce broken output entries
- Fix: empty `JAVA_OPTS` / `CATALINA_OPTS` no longer overwrite the user's environment
- Multi-root: command-palette flow resolves `launch.json` against the active workspace folder
- Validation: duplicate server ids are rejected at config-load; missing `tomcatHome`/`jdkHome` paths are reported as warnings
- Deploy: friendly error when Tomcat holds a Windows file lock on the WAR; logs an overwrite notice when the destination already exists
- Clean: preserves `examples/` and `docs/` alongside `ROOT`/`manager`/`host-manager`
- Startup: replaced the immediate "started" popup with an output-channel readiness signal driven by Tomcat's "Server startup in X ms" log line
- API: added optional `startupArgs` / `shutdownArgs` for custom override scripts
- Internal: replaced sync `fs.*Sync` calls with `fs.promises`; `__workspaceFolderUri` properly typed; unused `outputChannel` injection removed from the debug adapter factory
- Packaging: `.vscodeignore` excludes historical `.vsix` files and dev-only assets

## 0.3.2

- README updated

## 0.3.1

- Fix: timer leak in the debug adapter (cleanup on dispose / disconnect)
- Fix: workspace folder scoping for the deploy step inside the debug launch
- Validate startup/shutdown script paths and surface missing-script errors
- Surface config errors instead of silently swallowing them
- Tests added for `processRunner` and `tomcatDebugAdapter`
- CI/CD pipeline added

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
