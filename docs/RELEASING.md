# Releases and packages

The application and SDK share a version. Update `package.json`, root
`package-lock.json` (including `packages[""]`), `src-tauri/Cargo.toml`, the `app`
entry in `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json` and
`packages/plugin-sdk/package.json` and `packages/launcher/package.json` together.
Use `node scripts/bump-version.mjs <version>`, then `node scripts/check-version.mjs`.

## Windows desktop

1. Merge a reviewed PR with passing CI into `master`.
2. Update `docs/RELEASE-NOTES.md` for the release and validate the version.
3. Create a `v<version>` tag on the reviewed commit and push that tag.
4. The Windows workflow runs tests and builds NSIS and MSI installers. Only
   after success does it create a **draft** release and upload both installers
   plus a portable ZIP, the bundled npm launcher archive and SHA-256 checksums.
   No automatic publication or updater is configured.
5. Test both installers on Windows and use the checklist below. Review the draft
   notes and publish the release through GitHub when acceptance passes.

Manual workflow dispatch requires selecting a version tag, not a branch. If a
draft already exists, the workflow fails rather than silently replacing assets;
inspect the failed run and existing artifacts before retrying.

### Acceptance checklist

- Install, launch, uninstall and reinstall in a disposable Windows environment.
- Open the default shell, type, paste, resize, split panes, switch tabs and close
  sessions under continuous output. Confirm output is intact and shortcuts work.
- Test English settings, command palette, SSH and existing configuration files.
- Copy and open the shipped plugin examples, approve only needed permissions,
  and verify rejected permissions stay rejected.
- Sample idle, sustained-output and repeated-open/close resources as described in
  [RESOURCE-BENCHMARK.md](RESOURCE-BENCHMARK.md). Do not claim reductions without
  comparable baseline results.

Installers currently have no code-signing configuration. Linux/macOS and ARM64
distribution require their own builds and validation before adding release targets.

For a local artifact check without contacting GitHub, run
`node scripts/draft-release.mjs v<version> --prepare-only` after building both
installers. It rejects mismatched versions and creates `SHA256SUMS.txt`.
App and bundled font license notices are included in the installers.

## Desktop npm launcher

`packages/launcher` publishes as `novaterm`, with a Windows x64 executable,
integrity manifest, MIT license and font notices. The application source's root
`package.json` stays private. The launcher and application share a version.

After the reviewed release build, run:

```sh
node scripts/prepare-launcher.mjs
npm --prefix packages/launcher test
node packages/launcher/bin/novaterm.mjs --doctor
```

`node scripts/draft-release.mjs v<version> --prepare-only` packages the launcher
and portable ZIP alongside both installers and generates checksums for all four
artifacts. Test the packed tarball from a fresh npm prefix, including launching
the native application. Publish that reviewed tarball with `npm publish <tgz>`;
do not publish the private frontend project. No automatic npm publication of the
desktop launcher is configured yet.

## Plugin SDK package

The SDK is public on npm as `@diegolopez02081/novaterm-plugin-sdk`, starting at
version 0.1.0. The npm account name differs from the GitHub username. Install it
without GitHub registry configuration:

```sh
npm install @diegolopez02081/novaterm-plugin-sdk
```

Publishing a release triggers `packages.yml`, which checks out its tag, validates
versions, tests the SDK, skips versions already available on npm, and publishes
new versions using OIDC. A package version cannot be republished. The desktop
frontend npm project remains private. SDK contents are limited to its module, types,
manifest, README and MIT license; there are no runtime dependencies.

**One-time account setup is still required before automatic publication of a new
version.** In the npm package settings, configure a GitHub trusted publisher:
owner `DiegoLopez0208`, repository `novaterm`, workflow `packages.yml`, permission
to publish directly. Alternatively, with an interactive npm login and account 2FA:

```sh
npm trust github @diegolopez02081/novaterm-plugin-sdk --file packages.yml --repo DiegoLopez0208/novaterm --allow-publish
```

The credential available for the initial publication cannot perform this account
change: npm rejects granular tokens that bypass 2FA for trusted publisher setup.
No npm credential is stored in the repository or added to GitHub secrets.
NovaTerm and the SDK use MIT; bundled fonts retain their separate notices.

References: [Tauri Windows installers](https://v2.tauri.app/distribute/windows-installer/)
and [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/).
