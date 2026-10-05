# Resource benchmark (Windows)

Build a known release commit with `npm ci` and `npm run tauri build`.
Record window dimensions, profile/shell, scrollback, GPU/blur settings, plugin
versions, and workload alongside the result. Do not include API keys or secrets.
Use the same setup for three repetitions before and after a change.

Launch the release application, identify its **native app PID**, and attach:

```powershell
Get-Process app,novaterm -ErrorAction SilentlyContinue
./scripts/measure-resources.ps1 -ProcessId 1234 -Scenario idle-foreground
```

The sampler does not start, focus, minimize, or terminate the app. Keep the
requested scenario running during collection. It writes `processes.csv`,
`totals.csv`, and `metadata.json` into a timestamped ignored `benchmark-results`
directory, including commit, working-tree state, binary hash, OS, CPU count,
and detected WebView2 versions. It never records process command lines.
CSV decimal separators are invariant, regardless of Windows regional settings.

Only descendants of the supplied PID are counted. The app group contains the
root and its WebView2 processes; other descendants are reported as workload.
Check that classification when testing external plugins. Unrelated WebView2
instances are excluded. Private memory and working set have different meanings;
shared working-set pages can be double counted when summed across processes.

CPU is calculated from successive cumulative process counters using measured
elapsed time. The first sample has no CPU delta. `cpuPercentOneCore=100` means
one logical core; `cpuPercentMachine` divides that by the logical processor
count. Processes that start and exit entirely between samples are not captured,
and the first observation of a new process has no delta. This script is suitable
for steady-state comparison, not precise startup latency or short-lived process
accounting. Sampling itself adds system work; use the same interval in both runs.

Collect idle foreground/minimized, ten tabs, four split panes, sustained output,
slow/failing widgets, and repeated open/close cycles. Preserve raw runs and report
medians/ranges rather than selecting the best run. Runtime CPU/RAM reductions
are not established merely by passing unit tests or generating this report.

## First stability changes

Widgets now wait for completion before the next refresh, with at most two
concurrent frontend executions. The backend independently allows two widget
commands, a five-second deadline, and 64 KiB each for stdout and stderr.
Failure retries back off, and stale results after focus/CWD changes are ignored.
Installing/removing a plugin refreshes widget discovery without restarting.

CPU/RAM polling now waits two seconds between completed reads. The clock still
updates every second. Legacy manifest keys and configuration remain supported.

The subprocess runner kills and reaps the direct child on deadline/output errors.
Detached descendant containment still needs platform-specific process groups or
Windows job objects. The current limits bound NovaTerm's capture buffers and
requests, not arbitrary subprocess trees or third-party iframe CPU usage.

GitHub CI covers frontend and Windows backend checks. Linux/macOS native builds,
PTY transport acknowledgements, releases, SDK packages, and full English
migration are later change sets in `STABILITY-AND-RELEASE-PLAN.md`.

## Validation of this change set

- Frontend: 64 tests pass; production build and lint with denied warnings pass.
- Backend: 70 tests pass; the registry integration is skipped without its server.
  A second ignored entry is a subprocess fixture executed by the limit tests.
- The sampler was exercised against a disposable process, including descendant
  classification and CSV/metadata export. This is a harness smoke test, not a
  before/after NovaTerm resource benchmark.
- Vitest was updated from 4.1.10 to the patched 4.1.11 after a dependency audit;
  [upstream advisory](https://github.com/advisories/GHSA-82fw-gwwq-j7x9).
- CI is prepared locally; it has not yet run on GitHub.
