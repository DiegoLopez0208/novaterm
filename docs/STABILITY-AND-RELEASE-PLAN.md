# NovaTerm stability, English migration, and distribution plan

Audit date: October 5, 2026.
Baseline commit: `85ad4e13be099da7b8e120c62c777fb605ebcfbc` on `master`.
The local checkout and the GitHub default branch matched at audit time.

This document is an implementation plan. Runtime resource savings have not
been measured during this audit. Existing README performance numbers are
historical claims and must not be treated as a new benchmark.

## Verified baseline

| Check | Result |
| --- | --- |
| Frontend tests | 58 passed across 6 files |
| Rust tests (`cargo test --lib --locked`) | 68 passed, 1 ignored |
| Ignored integration test | Plugin installation requires the local registry |
| Frontend production build | Passed |
| Lint | Exit code 1: `react(only-export-components)` in `src/tabs/TabBar.tsx:39` |
| Main JavaScript bundle | 758.63 kB minified, 208.59 kB gzip |
| Symbols font | 1,202.26 kB build asset; not a runtime RAM measurement |
| GitHub releases | 0 |
| GitHub workflows | None in the tracked tree |
| App versions | npm `0.0.0`, Rust/Tauri `0.1.0` |
| GitHub Packages | Unverified: API returned 403, missing `read:packages` |
| License | No root license; Cargo license field is empty |

The app already uses raw Tauri IPC channels, a bounded Rust PTY queue,
batched output, focus-aware polling, delayed WebGL disposal, and Windows
WebView2 memory controls. Preserve these features and measure their effects.
Rewriting the app or changing frameworks is not the first step.

## 1. Stability and resource use

### P0: bound work across the complete PTY pipeline

`src-tauri/src/pty/session.rs` bounds its reader queue to 256 chunks of up to
8 KiB. That bounds one queue, not all downstream transport/parser buffers.
`src/terminal/TerminalView.tsx:273` submits bytes directly to `term.write`
without an acknowledgement when parsing completes.

Implement per-session outstanding-byte accounting and batched acknowledgements
from xterm write callbacks. Pause backend delivery at a high watermark and
resume at a low watermark. Keep raw byte transport and incremental UTF-8
decoding. A renderer-only queue would just move the accumulation elsewhere.

Closing a panel must wake blocked senders; stale acknowledgements must not
affect a new session. Deliver the final output before the exit notification.
Verify sustained output, split UTF-8 characters, Ctrl+C, closing under load,
and frontend disconnection. Choose watermarks through measurement.

Reference: [xterm.js flow control](https://xtermjs.org/docs/guides/flowcontrol/).

### P0: isolate slow sessions and widget commands

`PtyManager::write`, `resize`, and `close` hold the shared session-map mutex
while doing session operations. A blocking write can delay other sessions.
Use per-session ownership/locking and keep map-lock duration short. Specify
the spawn/close lifecycle so closing during spawn cannot leave an orphan shell.
Test two simultaneous sessions with one deliberately blocked writer.

`src/status/usePlugins.ts` uses `setInterval` regardless of whether the previous
invocation has finished. `ejecutar_widget` uses `Command::output()` with neither
a deadline nor an output limit, collecting stdout and stderr before displaying
only the first stdout line. The Tauri widget command is synchronous.

Replace intervals with scheduling after completion. Add one active execution
per widget, a small global concurrency limit, deadlines, bounded output, and
failure backoff. Keep blocking subprocess work off the UI dispatch path.
Ignore stale results after focus/CWD/plugin changes. Define cancellation and
process cleanup, including descendant processes where supported.

Only update React state when displayed output changes. Refresh the plugin list
after installation/uninstallation, and namespace widget IDs by plugin ID.

### P1: reduce unnecessary work and correct renderer lifecycle

- Separate the clock refresh from CPU/RAM collection. Currently the shortest
  widget interval is one second, causing system-stat collection every second
  even though CPU/RAM widgets request two seconds.
- Separate pane visibility from keyboard focus. `PaneTree` currently passes
  `activo={esActivo && visible}` and WebGL follows that flag; visible unfocused
  split panes can lose GPU rendering after five seconds. Preserve GPU rendering
  where output is visible, subject to a measured context budget.
- Coalesce drag/resize work to animation frames and avoid redundant PTY resizes.
- Replace one sleeping native thread per focus-loss event with a cancellable
  timer or one worker. Coordinate initial memory purging with focus state so
  its delayed NORMAL restore does not override background LOW mode.
- Benchmark optional low-resource settings: blur off, reduced animations and
  cursor blinking, smaller configurable scrollback, slower status polling.
  Do not silently change existing user settings.
- Profile font loading and startup before changing the font set. Splitting a
  bundle alone does not prove lower steady-state CPU/RAM.

### P1: bound plugin downloads and preserve installed versions

The installer loads the entire response with `response.bytes()` and extracts
without compressed-size, expanded-size, or entry-count limits. Add enforced
stream limits and extraction budgets. Limits must work without Content-Length.

The installer removes the old directory before renaming the new one. Use a
replacement procedure with rollback, unique staging directories, and protection
against concurrent operations on the same plugin. Test interrupted updates,
invalid archives, oversized downloads, and recovery without losing the old plugin.

### Measurement and acceptance

Benchmark a release build from a known commit, rather than a dev server or an
unidentified executable. Use the same machine, window geometry, shell/profile,
workload, plugins, and WebView2 runtime for before/after runs.

Record the app process tree separately from shell workload processes. Include
WebView2 processes belonging to NovaTerm only. Collect CPU deltas over elapsed
time, private memory, working set, thread/handle counts, pending bytes, and
input/resize latency. Do not sum unrelated WebView2 instances.

Run at least three repetitions of:

1. One idle pane, foreground and minimized, for 60 seconds.
2. Ten tabs and four visible split panes, idle and with sustained output.
3. A fixed high-output workload, interruption, and close during output.
4. One hundred open/close cycles and repeated focus changes.
5. Slow, failing, and high-output plugin widgets.

Hard gates: no lost output in the bounded test workload; no stuck close or
orphan sessions; no overlapping execution for the same widget; bounded queues;
no continuing resource growth after repeated warm-up/cycle runs. Establish
CPU/RAM and latency budgets from the baseline, then record actual deltas.

## 2. English migration

Migrate in separate commits so behavior changes remain reviewable:

1. README, repository description, contributor documentation, templates,
   changelog, build instructions, and release notes.
2. User-facing labels, errors, permission descriptions, accessibility text,
   and welcome output. Default to English; centralize strings for future locales.
3. Internal file/module/component/function/type names and test descriptions.
4. Public configuration, plugin SDK, and registry protocol names with migration
   support. Coordinate registry changes with the separate registry project.

Examples: `acciones/registro` to `actions/registry`, `modelo` to `model`,
`tipos` to `types`, `memoria` to `memory`, `instalar` to `install`,
`intervalo_ms` to `interval_ms`, `prefijo` to `prefix`, and `usar_cwd` to `use_cwd`.

Use Serde aliases for existing TOML keys and explicit adapters/versioning for
IPC and plugin RPC changes. Keep legacy plugin SDK aliases during a documented
transition. Test old config files, SSH files, manifests, and existing plugins
before saving migrated data. Do not rewrite historical Git commits/issues.

Correct the README's outdated claim that all plugins are declarative: the code
also supports JavaScript entries in sandboxed iframes with a permission broker.

## 3. Releases and packages

### Releases: downloadable desktop applications

Add CI for frontend tests/build/lint and locked Rust tests. Resolve the existing
lint failure first. Validate native builds on each supported OS before claiming
cross-platform release support; Windows-only keyring features currently need
special attention for usable credential storage on Linux/macOS.

Synchronize the app version in package.json, package-lock.json, Cargo.toml,
Cargo.lock, and tauri.conf.json, and check equality against the release tag.
Add proper author/repository/description metadata. Choose the project license
explicitly and retain bundled font licenses.

Create tagged draft releases with Windows NSIS/MSI assets first, checksums,
English changelog, and source commit. Add Linux AppImage/deb and macOS DMG
after their native gates pass. Keep builds reproducible with lockfiles and
pinned action revisions. Cache build dependencies and cancel superseded CI runs.

Decide signing/notarization requirements before public distribution. The updater
can follow as a separate change with release signing, update failure handling,
and a tested recovery path.

Reference: [Tauri GitHub distribution](https://v2.tauri.app/distribute/pipelines/github/).

### Packages: a useful plugin SDK

Keep the desktop app private in npm. Extract a publishable scoped SDK such as
`@diegolopez0208/novaterm-plugin-sdk` with English TypeScript types, RPC helpers,
timeouts with cleared timers, manifest validation, API compatibility versions,
and examples. Check name availability before adopting it.

Use GitHub Packages if displaying a package beside the repository is a goal;
its npm registry requires token authentication even for public packages. For
frictionless public installation, also evaluate npmjs distribution. Publish SDK
artifacts from validated tags, and verify the packed package in a clean example.

Reference: [GitHub npm registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry).

## 4. Plugins and marketplace

Extend the existing host rather than introducing a second plugin system.
Existing support includes declarative widgets/profiles, sandboxed JS panels,
command contributions, terminal read/write permissions, LLM requests,
signed archives, installation, and a marketplace UI.

The default catalog URL is `http://127.0.0.1:8787`. A public marketplace needs
an operated HTTPS registry or an explicitly documented self-hosted setup.
The separate `novaterm-registry` project has an `explicame` example; its
Ctrl+Shift+E shortcut conflicts with the app's split-down shortcut.

First ship versioned examples:

- Git branch/status widget with bounded, infrequent polling.
- Custom shell/profile pack with no background work.
- Error explainer panel, invoked on demand, using terminal.read and llm.complete.

Document an English manifest and SDK contract, install/update/uninstall flows,
compatibility checks, permission revocation, disable/re-enable behavior, command
collision handling, and resource budgets. Confirm theme contribution requirements
before extending the manifest: themes are not currently a plugin contribution.

Add broker tests for permission denial, iframe identity, payload bounds,
concurrency limits, and cleanup after unload. Rate limiting alone does not bound
concurrent long-running requests. Sandbox isolation also does not provide a hard
CPU budget for arbitrary iframe JavaScript; describe that limitation accurately.

## Suggested implementation sequence

| Change set | Deliverable | Completion gate |
| --- | --- | --- |
| 1 | Baseline harness, lint fix, CI | Reproducible baseline and green checks |
| 2 | Widget execution limits and cheaper polling | Slow/failing widget tests and measured comparison |
| 3 | PTY flow control and session lifecycle | Output integrity, responsiveness, cleanup under load |
| 4 | English docs/UI, then internals and compatibility adapters | Existing config/plugins still work; all checks pass |
| 5 | Version metadata, release builds, draft release | Native installation and smoke tests per published OS |
| 6 | English plugin SDK and example packages | Clean SDK consumer build and plugin lifecycle tests |
| 7 | Public registry and marketplace rollout | Signed install/update, rollback, permission and limit tests |

Release the stability work before expanding background plugins. Treat each
change set as a small reviewable PR with its own validation and rollback path.
