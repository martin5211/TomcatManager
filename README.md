# Tomcat Manager for VS Code

A VS Code extension for managing multiple Apache Tomcat servers from the command palette. Define your servers once, map them to projects, and run/stop/deploy without leaving the editor.

## What it does

- **Run / Stop / Restart** any configured Tomcat instance
- **Deploy** WAR files — automatically found in `target/`, `build/libs/`, or `dist/`
- **Clean** a server's `work/` and `temp/` directories (stops it first if running)
- **Per-project overrides** for `CATALINA_OPTS` and `JAVA_OPTS`
- JSON Schema validation for the config file, with autocomplete in VS Code

## Configuration

Drop a `tomcat.servers.json` in your workspace root (or run **Tomcat: Configure Servers** to scaffold one):

```json
{
  "servers": [
    {
      "id": "tomcat9",
      "name": "Tomcat 9",
      "tomcatHome": "/opt/tomcat9",
      "jdkHome": "/usr/lib/jvm/java-11"
    }
  ],
  "projects": {
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
| **Tomcat: Clean** | Clear `work/` and `temp/` |
| **Tomcat: Configure Servers** | Create or open `tomcat.servers.json` |

## Building & Installing

See [INSTALL.md](INSTALL.md).

## License

EPL-2.0
