# NovaTerm 0.1.1 — Windows preview

NovaTerm for Windows x64 is available as a setup installer, MSI and portable ZIP.
With Node.js 20+ and WebView2 installed, run `npx novaterm` or install globally
with `npm install --global novaterm`. The npm package includes the native app;
no Rust compilation or binary download script runs during installation.

- New geometric branding and a compact terminal welcome with an optional brief fade.
- Smooth history scrolling that respects reduced motion and inactive panes.
- Installed plugin library, explicit permission review and sandboxed panels.
- Seven example plugins, including JSON tools, timestamp tools and reviewed command snippets.
- Bounded PTY output and widget execution, serialized input and resize handling.
- MIT application and SDK; bundled font licenses are included.

Validation: 83 frontend tests, 81 native tests (2 fixtures/integration tests
ignored), 8 browser UI tests, 4 plugin example tests and 2 launcher tests.
NSIS installation, launch, uninstall and reinstall preserve existing configuration.
The MSI payload was extracted and its executable exercised; an elevated MSI
install/uninstall cycle was not exercised on this non-administrator account.
The public npm package was downloaded separately, its executable verified and
its launcher and native application exercised.

See `docs/RESOURCE-BENCHMARK.md` for the measured Windows baseline and its limits.
The public plugin registry is not deployed yet. Linux, macOS and ARM64 binaries,
automatic desktop updates and code signing are not included. Windows may display
an unknown-publisher warning for these unsigned executables.
