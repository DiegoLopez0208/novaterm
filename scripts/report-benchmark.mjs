import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const result = JSON.parse(readFileSync('.ecc/benchmarks/windows-0.1.1.json', 'utf8'));
const hardware = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-File', 'scripts/benchmark-hardware.ps1'], { encoding: 'utf8' }));
result.hardware = hardware;
result.runtimeSourceCommit = 'f0911bfc1dd90c530722c26c3710d2ca094f191a';
result.sourceNote = 'The benchmark began with the release changes in the working tree, then those same runtime sources were committed as f0911bf. Later changes rename the private frontend package and add reports; they do not alter emitted application assets. Raw metadata retains per-scenario revisions and dirty state.';
writeFileSync('.ecc/benchmarks/windows-0.1.1.json', JSON.stringify(result, null, 2) + '\n');
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const round = (n, precision = 1) => n.toFixed(precision);
const groups = [
  ['Idle', /^idle-/, 3],
  ['Sustained output', /^sustained-output-/, 3],
  ['Ten tabs', /^ten-tabs$/, 1],
  ['Four panes', /^four-panes$/, 1],
  ['After 20 tab cycles / five-minute soak', /^post-cycles-soak$/, 1],
];
const table = [
  '| Scenario | Repetitions | App + WebView2 private MiB | App CPU (% of whole machine) | Shell/workload private MiB |',
  '| --- | ---: | ---: | ---: | ---: |',
];
for (const [name, pattern, repetitions] of groups) {
  const app = result.runs.filter((r) => r.group === 'app' && pattern.test(r.scenario));
  const workload = result.runs.filter((r) => r.group === 'workload' && pattern.test(r.scenario));
  if (app.length !== repetitions || workload.length !== repetitions) throw new Error(`Missing runs: ${name}`);
  table.push(`| ${name} | ${repetitions} | ${round(median(app.map((r) => r.medianPrivateMiB)))} | ${round(median(app.map((r) => r.medianCpuMachinePercent)), 2)} | ${round(median(workload.map((r) => r.medianPrivateMiB)))} |`);
}
const timings = result.startup.map((r) => r.observedWindowAndTerminalMs);
const soak = result.runs.find((r) => r.group === 'app' && r.scenario === 'post-cycles-soak');
const output = result.runs.filter((r) => r.group === 'app' && r.scenario.startsWith('sustained-output-'));
const notes = `## Measured Windows 0.1.1 baseline — 2026-10-06

The native release executable was exercised through real WebView2, xterm.js and
ConPTY sessions. This is a current-version baseline, not a before/after comparison
or evidence that NovaTerm consumes less than another terminal.

${table.join('\n')}

Values are medians of each run's median. Idle and output scenarios have three
20-second sampling windows; tab/pane scenarios have one. CPU is normalized over
${hardware.logicalProcessors} logical processors, so 100% means the whole machine. The output workload emits
400 lines of 80 characters per write with a 10 ms pause, for about 30 seconds
per repetition. End markers confirm delivery completed; received bytes ranged from
${round(Math.min(...output.map((r) => r.bytesReceived)) / 1024 ** 2)} to
${round(Math.max(...output.map((r) => r.bytesReceived)) / 1024 ** 2)} MiB per repetition.

Launch to an observed visible terminal: median **${round(median(timings) / 1000, 2)} s**,
range **${round(Math.min(...timings) / 1000, 2)}–${round(Math.max(...timings) / 1000, 2)} s**,
across four launches with separate WebView2 data folders. This includes CDP
connection/observation overhead. OS disk caches were not flushed; this is not an
exact shell-ready or cold-boot latency measurement.

The post-cycle ${round(soak.seconds, 0)}-second soak finished with a responsive shell.
App/WebView2 private memory moved from **${round(soak.firstPrivateMiB)}** to
**${round(soak.lastPrivateMiB)} MiB** (peak ${round(soak.peakPrivateMiB)} MiB).
All four application windows closed through NovaTerm's normal Close action.
ANSI/truecolor delivery, settings, tab/pane cleanup and shell end markers passed;
no JavaScript errors were recorded during the observed sessions.

Machine: ${hardware.os} (build ${hardware.build}), ${hardware.cpu}
(${hardware.logicalProcessors} logical processors), ${hardware.gpu.join(', ')}.
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

`;
const file = 'docs/RESOURCE-BENCHMARK.md';
const original = readFileSync(file, 'utf8');
const marker = '## Measured Windows 0.1.1 baseline';
const previous = original.indexOf(marker);
const body = previous === -1 ? original : original.slice(0, previous).trimEnd() + '\n';
writeFileSync(file, (body + '\n' + notes).trimEnd() + '\n');
console.log(table.join('\n'));
