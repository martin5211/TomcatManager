# Tomcat Manager for VS Code

[![Version](https://vsmarketplacebadges.dev/version/MartinCaminoa.tomcat-manager.svg)](https://marketplace.visualstudio.com/items?itemName=MartinCaminoa.tomcat-manager)
[![Installs](https://vsmarketplacebadges.dev/installs-short/MartinCaminoa.tomcat-manager.svg)](https://marketplace.visualstudio.com/items?itemName=MartinCaminoa.tomcat-manager)

A VS Code extension for managing multiple Apache Tomcat servers from the command palette or from Run and Debug view. Define your servers once, bind them to workspaces, and run/stop/deploy without leaving the editor.

## What it does

- **Run / Stop / Restart** any configured Tomcat instance
- **Deploy** WAR files - automatically found in `target/`, `build/libs/`, or `dist/`
- **Clean** a server's `work/`, `temp/`, and `webapps/` directories (stops it first if running)
- **Per-project overrides** for `CATALINA_OPTS` and `JAVA_OPTS` via `launch.json`
- Native VS Code Settings UI with schema validation and autocomplete

## Configuration

Server definitions go in **User Settings** (shared across all projects), while project-specific settings go in `.vscode/launch.json`.

### User Settings — server definitions

```json
{
  "tomcatManager.servers": [
    {
      "id": "tomcat9",
      "name": "Tomcat 9",
      "tomcatHome": "/opt/tomcat9",
      "jdkHome": "/usr/lib/jvm/java-11",
      "defaultCatalinaOpts": "-Xms256m"
    }
  ]
}
```

### `.vscode/launch.json` — project binding + options

```json
{
  "configurations": [
    {
      "type": "tomcat",
      "request": "launch",
      "name": "Run Tomcat",
      "serverId": "tomcat9",
      "catalinaOpts": "-Xmx1g",
      "javaOpts": "-Denv=dev"
    }
  ]
}
```

The server's `defaultCatalinaOpts` is prepended to the launch config `catalinaOpts`, so the effective value above would be `-Xms256m -Xmx1g`. Same for `javaOpts`.

If only one server is configured, `serverId` can be omitted — it auto-selects.

## Commands

All available via `Ctrl+Shift+P`:

| Command | What it does |
|---------|-------------|
| **Tomcat: Run** | Start the server |
| **Tomcat: Stop** | Stop the server |
| **Tomcat: Restart** | Stop + start |
| **Tomcat: Deploy** | Copy a WAR to `webapps/` |
| **Tomcat: Clean** | Clear `work/`, `temp/`, and `webapps/` |
| **Tomcat: Configure Servers** | Open Tomcat settings |

## Building & Installing

See [INSTALL.md](INSTALL.md).

## License

EPL-2.0
