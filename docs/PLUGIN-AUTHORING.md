# Writing NovaTerm plugins

Copy an example directory from `examples/plugins` to `~/.novaterm/plugins/`.
Keep each plugin in its own directory containing `plugin.toml`, using its manifest
ID as the folder name. `scripts/install-example-plugins.ps1` handles this for the
seven [starter plugins](../examples/plugins/README.md). Restart NovaTerm
after manually copying a directory. Marketplace installs refresh discovery.
The default catalog is local; these examples do not require a running registry.

## Declarative widgets

The Git branch example invokes Git directly, with separate arguments, in the
active terminal's reported working directory. Shells that do not report their
directory cannot supply it. It polls every ten seconds. Widgets share a
two-process limit, have a five-second deadline and cap each output stream at
64 KiB. Failed polls back off.

English keys `interval_ms`, `prefix` and `use_cwd` are accepted alongside legacy
`intervalo_ms`, `prefijo` and `usar_cwd`. Do not specify both spellings of the
same key. Runtime serialization retains legacy keys for compatibility.

## Sandboxed panels

An `entry` file runs in an iframe without access to Tauri, storage or the
network. Bundle dependencies into one entry; external imports cannot load.
Rendering must use `textContent` for terminal output and model responses.

The host injects `globalThis.nova` with `apiVersion: 1`:

| Method | Permission | Result |
| --- | --- | --- |
| `terminal.read(lines = 200)` | `terminal.read` | Text from the active terminal, capped at 2,000 lines |
| `terminal.write(data)` | `terminal.write` | `{ ok: true }`; asks for confirmation unless trusted |
| `ai.complete(messages, { max_tokens })` | `llm.complete` | `{ text, tokens, remaining }` |
| `commands.trigger(id)` | `commands` | `{ ok: true }` |

Install `@diegolopez02081/novaterm-plugin-sdk` from npm for TypeScript definitions.
The source lives in `packages/plugin-sdk`. Existing
`terminal.leer/escribir`, `ia.preguntar` and `comandos.disparar` APIs remain
available. Legacy AI responses keep `restante`; the English API maps it to
`remaining` without changing the broker protocol.

The output explainer only requests AI after a button click. Open Settings →
Plugins & AI to configure a provider and key and approve its declared permissions
first. It never writes to the shell. Open a panel through **Plugins → Installed →
Open panel** or **Open <plugin name>** in the command palette. Missing panel
permission takes you to the plugin permission settings rather than granting it
automatically. After approval, return to the library to open the panel.

The iframe restricts capabilities but does not impose a hard CPU limit on plugin
JavaScript. Keep work brief, avoid continuous loops, and clear timers on teardown.
