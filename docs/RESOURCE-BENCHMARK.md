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

The PTY transport and cancellation changes are described in `PTY-FLOW-CONTROL.md`.
GitHub CI covers frontend and Windows backend checks. Linux/macOS native builds,
releases, SDK packages, and full English
migration are later change sets in `STABILITY-AND-RELEASE-PLAN.md`.

## Validation of this change set

- Frontend: 76 tests pass; production build and lint with denied warnings pass.
- Backend: 78 tests pass; the registry integration is skipped without its server.
  A second ignored entry is a subprocess fixture executed by the limit tests.
- Windows executable: `npm run tauri -- build --debug --no-bundle` passes.
  This confirms compilation with embedded assets; the GUI was not exercised.
- The sampler was exercised against a disposable process, including descendant
  classification and CSV/metadata export. This is a harness smoke test, not a
  before/after NovaTerm resource benchmark.
- Vitest was updated from 4.1.10 to the patched 4.1.11 after a dependency audit;
  [upstream advisory](https://github.com/advisories/GHSA-82fw-gwwq-j7x9).
- GitHub CI status must be verified on the PR before merging.

## Measured Windows 0.1.1 baseline — 2026-10-06

The native release executable was exercised through real WebView2, xterm.js and
ConPTY sessions. This is a current-version baseline, not a before/after comparison
or evidence that NovaTerm consumes less than another terminal.

| Scenario | Repetitions | App + WebView2 private MiB | App CPU (% of whole machine) | Shell/workload private MiB |
| --- | ---: | ---: | ---: | ---: |
| Idle | 3 | 205.7 | 0.08 | 63.0 |
| Sustained output | 3 | 307.6 | 6.50 | 69.8 |
| Ten tabs | 1 | 295.3 | 0.08 | 576.8 |
| Four panes | 1 | 299.3 | 0.00 | 226.4 |
| After 20 tab cycles / five-minute soak | 1 | 223.9 | 0.08 | 61.2 |

Values are medians of each run's median. Idle and output scenarios have three
20-second sampling windows; tab/pane scenarios have one. CPU is normalized over
12 logical processors, so 100% means the whole machine. The output workload emits
400 lines of 80 characters per write with a 10 ms pause, for about 30 seconds
per repetition. End markers confirm delivery completed; received bytes ranged from
32.6 to
40.8 MiB per repetition.

Launch to an observed visible terminal: median **1.48 s**,
range **1.42–1.90 s**,
across four launches with separate WebView2 data folders. This includes CDP
connection/observation overhead. OS disk caches were not flushed; this is not an
exact shell-ready or cold-boot latency measurement.

The post-cycle 300-second soak finished with a responsive shell.
App/WebView2 private memory moved from **448.5** to
**222.9 MiB** (peak 448.5 MiB).
All four application windows closed through NovaTerm's normal Close action.
ANSI/truecolor delivery, settings, tab/pane cleanup and shell end markers passed;
no JavaScript errors were recorded during the observed sessions.

Machine: Microsoft Windows 11 Home Single Language (build 26200), AMD Ryzen 5 5600H with Radeon Graphics
(12 logical processors), AMD Radeon(TM) Graphics, NVIDIA GeForce RTX 3060 Laptop GPU.
WebView2 154.0.4258.62. The captured configuration and per-run counters are in
[.ecc/benchmarks/windows-0.1.1.json](../.ecc/benchmarks/windows-0.1.1.json).
Personal PowerShell profile files were absent. Existing widgets remained enabled;
the harness never changes the user's configuration or plugin permissions.

Private bytes measure committed private memory, not physical RAM. App totals
include WebView2; workload totals include shells, console hosts and widget
subprocesses. Sampling and local CDP instrumentation add overhead. Window focus
was recorded at the beginning of each scenario but was not locked throughout.
Other desktop activity was not controlled. Interrupted harness runs, including
one interrupted by an installer closing a running NovaTerm instance, are excluded
from the completed baseline and retained locally for diagnosis.

This five-minute soak does not establish full-day reliability or prove absence
of memory leaks. Elevated MSI install/uninstall was not tested on this non-admin
account; the MSI payload was extracted and its native terminal smoke-tested.
NSIS install/launch/uninstall/reinstall and a separately downloaded public npm
package were tested. The npm launcher opened a directory containing spaces.

### Reproduce

    npm run tauri -- build --bundles nsis,msi
    node scripts/benchmark-windows.mjs
    # Optional longer collection:
    $env:NOVA_SAMPLE_SECONDS = '60'
    $env:NOVA_SOAK_SECONDS = '1800'
    node scripts/benchmark-windows.mjs

Run installer acceptance separately: installers can close existing NovaTerm
processes. The harness writes its complete raw CSV/metadata runs beneath the
ignored benchmark-results folder and a tracked JSON baseline under .ecc.
It enables a loopback WebView2 debugging endpoint only for its own test instances;
normal launches do not enable these diagnostics.
