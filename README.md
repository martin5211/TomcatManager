# Tomcat Manager for VS Code

[![Version](https://vsmarketplacebadges.dev/version/MartinCaminoa.tomcat-manager.svg)](https://marketplace.visualstudio.com/items?itemName=MartinCaminoa.tomcat-manager)
[![Installs](https://vsmarketplacebadges.dev/installs-short/MartinCaminoa.tomcat-manager.svg)](https://marketplace.visualstudio.com/items?itemName=MartinCaminoa.tomcat-manager)

A VS Code extension for managing multiple Apache Tomcat servers from the command palette. Define your servers once, map them to projects, and run/stop/deploy without leaving the editor.

## What it does

- **Run / Stop / Restart** any configured Tomcat instance
- **Deploy** WAR files — automatically found in `target/`, `build/libs/`, or `dist/`
- **Clean** a server's `work/`, `temp/`, and `webapps/` directories (stops it first if running)
- **Per-project overrides** for `CATALINA_OPTS` and `JAVA_OPTS`
- Native VS Code Settings UI with schema validation and autocomplete

## Configuration

Configure servers and projects in VS Code settings (or run **Tomcat: Configure Servers** to open the settings page). Add entries like this to your `settings.json`:

```json
{
  "tomcatManager.servers": [
    {
      "id": "tomcat9",
      "name": "Tomcat 9",
      "tomcatHome": "/opt/tomcat9",
      "jdkHome": "/usr/lib/jvm/java-11"
    }
  ],
  "tomcatManager.projects": {
    "my-webapp": {
      "serverId": "tomcat9",
      "catalinaOpts": "-Xmx512m"
    }
  }
}
```

Each project key matches a workspace folder name. When you run a command, the extension resolves the right server automatically, or lets you pick one if there's no mapping.

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
