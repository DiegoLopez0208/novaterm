# NovaTerm starter plugins

These plugins are MIT licensed examples, not preinstalled or automatically trusted.
Copy a plugin directory into `~/.novaterm/plugins` and restart NovaTerm. The
folder name must match the manifest's `id`; use the installer below to do that.

```powershell
# Install one plugin, preserving any existing copy:
./scripts/install-example-plugins.ps1 -Name json-tools
# Install all seven examples:
./scripts/install-example-plugins.ps1
```

Open **Plugins → Installed → Open panel**. If panel permission is missing,
NovaTerm takes you to **Settings → Plugins & AI** to approve it. Return to the
library to open the panel after granting permission. The command palette also
offers **Open <plugin name>**. No permission is granted by copying files.

| Plugin | Purpose | Capabilities / prerequisites |
| --- | --- | --- |
| Git branch | Current branch in the status bar | Git on PATH, 10-second polling |
| Git changes | Tracked, unstaged diff summary | Git on PATH, 30-second polling |
| JSON tools | Format, validate and minify pasted JSON | Panel only; JavaScript number precision |
| Timestamp tools | Convert Unix seconds, milliseconds and ISO dates | Panel only; no continuous clock |
| Output inspector | Capture and filter the last 500 terminal lines | Panel + terminal read; button-triggered |
| Command snippets | Insert a reviewed one-line command without Enter | Panel + terminal write; host confirmation unless trusted |
| Output explainer | Explain the last 100 terminal lines | Panel + terminal read + AI provider/key/budget |

Panels do not fetch network resources, retain data after closing, or run background
pollers. Declarative widgets execute the manifest's commands while NovaTerm is
active. Git changes omits staged changes and untracked files. Snippet insertion
appends to existing shell input, so start at an empty prompt and review the line.
