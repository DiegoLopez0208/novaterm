# Releases and packages

The application and SDK share a version. Update `package.json`, root
`package-lock.json` (including `packages[""]`), `src-tauri/Cargo.toml`, the `app`
entry in `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json` and
`packages/plugin-sdk/package.json` together. Run `node scripts/check-version.mjs`.

## Windows desktop

1. Merge a reviewed PR with passing CI into `master`.
2. Update `docs/RELEASE-NOTES.md` for the release and validate the version.
3. Create a `v<version>` tag on the reviewed commit and push that tag.
4. The Windows workflow runs tests and builds NSIS and MSI installers. Only
   after success does it create a **draft** release and upload both installers
   plus SHA-256 checksums. No automatic publication or updater is configured.
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

## Plugin SDK package

Publishing a release triggers a separate workflow that checks out its tag,
validates versions, tests the SDK and publishes
`@diegolopez0208/novaterm-plugin-sdk` to GitHub Packages using the workflow's
`GITHUB_TOKEN` with `packages: write`. The desktop npm project remains private.
The package has no runtime dependencies and includes only its module, types,
manifest and README. A package version cannot be republished.

Configure the scope in your npm client:

```ini
@diegolopez0208:registry=https://npm.pkg.github.com
```

GitHub Packages downloads require authentication with an appropriate token; keep
credentials in your user configuration or secret store, never in the repository.
The SDK is prepared but not yet published. NovaTerm and the SDK use the MIT
license; bundled fonts retain their separate license notices.

References: [Tauri Windows installers](https://v2.tauri.app/distribute/windows-installer/)
and [GitHub npm registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry).
