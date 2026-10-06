# NovaTerm

A desktop terminal for Windows x64 with split panes, smooth history scrolling,
themes and an English plugin API. This package includes the native application.

```sh
npx novaterm
```

Or install the command globally:

```sh
npm install --global novaterm
novaterm
novaterm C:/projects/my-project
```

Node.js 20+ and Microsoft Edge WebView2 Runtime are required. Windows x64 is the
only supported platform in this release. No Rust build, separate binary download
or installation script runs during npm installation. The desktop process stays
open after the launcher exits.

`novaterm --version` prints the package version. `novaterm --doctor` verifies
the bundled executable against its SHA-256 manifest; it does not test WebView2
or the interactive terminal.

For Start menu integration and an uninstaller, download the Windows setup from
[GitHub Releases](https://github.com/DiegoLopez0208/novaterm/releases/latest).
Installers and the executable are currently unsigned. Existing terminal
configuration and locally installed plugins are shared with the desktop build.

Create panel plugins with
[`@diegolopez02081/novaterm-plugin-sdk`](https://www.npmjs.com/package/@diegolopez02081/novaterm-plugin-sdk).

NovaTerm is MIT licensed. Bundled fonts retain their licenses in `licenses/`.
