# Contributing to NovaTerm

Use English for public documentation, new identifiers, UI copy, comments,
commit messages, issues, and pull requests. Keep changes focused and document
compatibility behavior when renaming configuration or plugin API fields.

## Setup and checks

Use Node.js 24 and stable Rust. Install platform dependencies listed in the
[Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

```sh
npm ci
npm run lint -- --deny-warnings
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml --lib --locked
```

The native test suite requires Node and starts real shell processes. Run PTY
tests when changing terminal transport, input, session cleanup, or layout.
The ignored registry integration needs a running local plugin registry.

## Preserve terminal behavior

- Never silently drop output to reduce memory use. Apply producer backpressure.
- Keep UTF-8 bytes intact across chunks and acknowledge completed parsing.
- Keep Ctrl+C process interruption and bracketed paste working.
- Do not recreate a PTY when applying configuration or switching tabs.
- Keep shared registry locks away from blocking native work.
- Cancel pending work on close and preserve session identity during startup.
- Use bounded retries, output capture, and concurrency for external commands.

## Compatibility

Existing TOML and plugin manifests use some legacy Spanish keys. Accept those
through explicit aliases/adapters when introducing English fields. Do not
rewrite unrelated user configuration, credentials, or SSH files. Include a
migration test for persisted schema changes.

Do not grant plugin permissions implicitly or expose API keys to plugin code.
Use the existing sandbox and broker instead of loading third-party code directly
into the application webview.

## Pull requests

Describe the trigger, resulting behavior, and verification. State which native
platforms were tested. Keep resource claims tied to controlled measurements from
known binaries, not unit tests or bundle sizes. Include limitations when GUI or
cross-platform behavior remains unverified.

NovaTerm and the plugin SDK use the [MIT license](LICENSE). Bundled font licenses
are independent and must remain intact.
