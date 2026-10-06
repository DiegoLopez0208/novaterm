import { chromium } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';

if (process.platform !== 'win32') throw new Error('Windows benchmark only');
const executable = resolve(process.argv[2] ?? 'src-tauri/target/release/app.exe');
const duration = Number(process.env.NOVA_SAMPLE_SECONDS ?? 20);
const soak = Number(process.env.NOVA_SOAK_SECONDS ?? 300);
assert.ok(duration >= 10 && duration <= 3600 && soak >= 30 && soak <= 3600);
const root = resolve('benchmark-results', `release-${Date.now()}`);
mkdirSync(root, { recursive: true });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const runs = [];
const startup = [];
const checks = [];
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))];
const freePort = () => new Promise((resolve, reject) => {
  const server = createServer();
  server.on('error', reject);
  server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
});

async function open(index) {
  const port = await freePort();
  const env = { ...process.env, WEBVIEW2_USER_DATA_FOLDER: join(root, `webview-${index}`),
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1` };
  delete env.NO_COLOR;
  delete env.FORCE_COLOR;
  const begin = performance.now();
  const child = spawn(executable, [], { cwd: root, env, stdio: 'ignore' });
  let browser;
  for (let attempt = 0; attempt < 150; attempt++) {
    try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 500 }); break; }
    catch { if (child.exitCode !== null) throw new Error(`Application exited: ${child.exitCode}`); await wait(100); }
  }
  assert.ok(browser, 'WebView2 debugging endpoint became available');
  const context = browser.contexts()[0];
  let page;
  for (let attempt = 0; attempt < 100; attempt++) {
    page = context.pages().find((p) => p.url().startsWith('http://tauri.localhost') || p.url().startsWith('https://tauri.localhost')) ?? context.pages()[0];
    if (page) break;
    await wait(100);
  }
  await page.locator('.terminal-host').first().waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__TAURI_INTERNALS__));
  startup.push({ repetition: index, observedWindowAndTerminalMs: Math.round(performance.now() - begin) });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const settings = await page.evaluate(async () => {
    const api = window.__TAURI_INTERNALS__;
    const config = await api.invoke('config_get');
    window.__NOVA_BENCH__ = { sessions: {}, errors: [], totalBytes: 0 };
    window.__NOVATERM_DIAGNOSTICS__ = true;
    window.addEventListener('novaterm:terminal-ready', ({ detail }) => {
      const { term, panelId, ptyId } = detail;
      const state = { term, panelId, text: '', bytes: 0 };
      window.__NOVA_BENCH__.sessions[ptyId] = state;
      const decoder = new TextDecoder();
      const write = term.write.bind(term);
      term.write = (data, callback) => {
        const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
        state.bytes += bytes.byteLength;
        window.__NOVA_BENCH__.totalBytes += bytes.byteLength;
        state.text = (state.text + decoder.decode(bytes, { stream: true })).slice(-32768);
        write(data, callback);
      };
    });
    window.addEventListener('novaterm:terminal-closed', ({ detail }) => {
      for (const [id, state] of Object.entries(window.__NOVA_BENCH__.sessions)) {
        if (state.panelId === detail.panelId) delete window.__NOVA_BENCH__.sessions[id];
      }
    });
    return { window: config.window, font: config.font, terminal: config.terminal, ui: config.ui,
      shell: 'Default PowerShell profile',
      plugins: (await api.invoke('plugins_list')).map((p) => ({ id: p.id, version: p.version, widgets: p.widgets.length })) };
  });
  // Replace the initial uninstrumented tab, without reloading the webview or
  // modifying the user's config, keys, profiles or installed plugins.
  await page.locator('.nueva-pestana').click();
  await page.locator('.pestana').first().locator('.cerrar-pestana').click();
  await page.waitForFunction(() => Object.keys(window.__NOVA_BENCH__.sessions).length === 1);
  const app = { child, browser, page, errors, settings };
  await command(app, "Write-Output ('NOVA_' + 'READY')");
  await marker(app, 'NOVA_READY');
  return app;
}

async function command(app, text) {
  await app.page.evaluate(async (data) => {
    const ids = Object.keys(window.__NOVA_BENCH__.sessions);
    const id = ids[ids.length - 1];
    await window.__TAURI_INTERNALS__.invoke('pty_write', { id, data: data + '\r' });
  }, text);
}
async function marker(app, text, timeout = 30000) {
  await app.page.waitForFunction((marker) => Object.values(window.__NOVA_BENCH__.sessions).some((s) => s.text.includes(marker)), text, { timeout });
}
async function sample(app, scenario, seconds = duration) {
  await app.page.bringToFront();
  const focusedAtStart = await app.page.evaluate(() => window.__TAURI_INTERNALS__.invoke('plugin:window|is_focused', { label: 'main' }));
  console.log(`Sampling ${scenario} for ${seconds}s (PID ${app.child.pid})`);
  const output = join(root, 'samples');
  await new Promise((sampleDone, reject) => {
    const sampler = spawn('powershell.exe', ['-NoProfile', '-File', resolve('scripts/measure-resources.ps1'),
      '-ProcessId', String(app.child.pid), '-DurationSeconds', String(seconds), '-Scenario', scenario,
      '-OutputDirectory', output], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let log = '';
    sampler.stdout.on('data', (chunk) => { log += chunk; });
    sampler.stderr.on('data', (chunk) => { log += chunk; });
    sampler.on('error', reject);
    sampler.on('exit', (code) => code === 0 ? sampleDone() : reject(new Error(log)));
  });
  const directory = readdirSync(output).sort().at(-1);
  const path = join(output, directory);
  const metadata = JSON.parse(readFileSync(join(path, 'metadata.json'), 'utf8').replace(/^\uFEFF/, ''));
  assert.equal(metadata.stopReason, 'duration-reached', 'Application survived collection');
  const lines = readFileSync(join(path, 'totals.csv'), 'utf8').replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  const columns = lines.shift().split(',').map((s) => s.replace(/^"|"$/g, ''));
  const rows = lines.map((line) => Object.fromEntries(line.split(',').map((s, i) => [columns[i], s.replace(/^"|"$/g, '')])));
  for (const group of ['app', 'workload']) {
    const values = rows.filter((r) => r.group === group);
    const cpu = values.filter((r) => r.cpuPercentMachine !== '').map((r) => Number(r.cpuPercentMachine));
    const privateMb = values.map((r) => Number(r.privateBytes) / 1024 ** 2);
    runs.push({ scenario, group, seconds: metadata.actualDurationSeconds, samples: values.length, focusedAtStart,
      medianCpuMachinePercent: percentile(cpu, 0.5), p95CpuMachinePercent: percentile(cpu, 0.95),
      medianPrivateMiB: percentile(privateMb, 0.5), peakPrivateMiB: Math.max(...privateMb),
      firstPrivateMiB: privateMb[0], lastPrivateMiB: privateMb.at(-1),
      rawDirectory: path.slice(root.length + 1), webView2: metadata.webView2Versions });
  }
  writeFileSync(join(root, 'partial.json'), JSON.stringify({ startup, runs }, null, 2) + '\n');
  return runs.at(-2);
}
async function close(app) {
  await app.page.getByRole('button', { name: 'Close', exact: true }).click();
  for (let i = 0; i < 100 && app.child.exitCode === null; i++) await wait(100);
  assert.notEqual(app.child.exitCode, null, 'Window close terminated application');
  checks.push({ name: 'clean-app-close', passed: true });
  // Disconnect CDP only; the application's own Close path already shut it down.
  await app.browser.close().catch(() => {});
  assert.deepEqual(app.errors, [], 'No JavaScript errors');
  const errors = app.finalErrors ?? [];
  assert.deepEqual(errors, [], 'No native IPC errors');
}

let app;
let settings;
try {
  if (process.env.NOVA_SMOKE_ONLY === '1') {
    app = await open(0);
    await app.page.getByRole('button', { name: 'Split right', exact: true }).click();
    await app.page.waitForFunction(() => Object.keys(window.__NOVA_BENCH__.sessions).length === 2);
    await command(app, "Write-Output ('NOVA_NATIVE_' + 'OK')");
    await marker(app, 'NOVA_NATIVE_OK');
    await app.page.getByRole('button', { name: 'Close pane', exact: true }).click();
    await app.page.waitForFunction(() => Object.keys(window.__NOVA_BENCH__.sessions).length === 1);
    await app.page.getByRole('button', { name: 'Settings', exact: true }).click();
    await app.page.getByRole('dialog').waitFor({ state: 'visible' });
    await app.page.keyboard.press('Escape');
    await app.page.keyboard.press('Control+Shift+P');
    await app.page.getByRole('dialog').waitFor({ state: 'visible' });
    await app.page.keyboard.press('Escape');
    await app.page.screenshot({ path: join(root, 'native-acceptance.png') });
    app.finalErrors = await app.page.evaluate(() => window.__NOVA_BENCH__.errors);
    await close(app); app = null;
    console.log(`Native smoke passed: ${executable}`);
    process.exit(0);
  }
  for (let rep = 1; rep <= 3; rep++) {
    app = await open(rep);
    settings = app.settings;
    await wait(5000);
    await sample(app, `idle-${rep}`);
    await command(app, `[Console]::Write("$([char]27)[31mRED $([char]27)[32mGREEN $([char]27)[38;2;80;140;240mTRUECOLOR$([char]27)[0m"); Write-Output ('NOVA_COLOR_' + 'OK')`);
    await marker(app, 'NOVA_COLOR_OK');
    checks.push({ name: `ansi-output-${rep}`, passed: await app.page.evaluate(() => Object.values(window.__NOVA_BENCH__.sessions).some((s) => s.text.includes('\x1b[31m') && s.text.includes('\x1b[38;2;80;140;240m'))) });
    const before = await app.page.evaluate(() => window.__NOVA_BENCH__.totalBytes);
    await command(app, `$end=[DateTime]::UtcNow.AddSeconds(${duration + 10}); while([DateTime]::UtcNow -lt $end) { [Console]::Write((('0123456789abcdef'*5)+"\r\n")*400); Start-Sleep -Milliseconds 10 }; Write-Output ('NOVA_OUTPUT_' + 'DONE')`);
    const output = await sample(app, `sustained-output-${rep}`);
    await marker(app, 'NOVA_OUTPUT_DONE', (duration + 30) * 1000);
    output.bytesReceived = await app.page.evaluate(() => window.__NOVA_BENCH__.totalBytes) - before;
    await app.page.getByRole('button', { name: 'Settings', exact: true }).click();
    await app.page.getByRole('dialog').waitFor({ state: 'visible' });
    await app.page.keyboard.press('Escape');
    await app.page.screenshot({ path: join(root, `native-${rep}.png`) });
    app.finalErrors = await app.page.evaluate(() => window.__NOVA_BENCH__.errors);
    await close(app); app = null;
  }
  app = await open(4);
  for (let i = 1; i < 10; i++) await app.page.locator('.nueva-pestana').click();
  await app.page.waitForFunction(() => Object.keys(window.__NOVA_BENCH__.sessions).length === 10);
  await wait(6000);
  await sample(app, 'ten-tabs');
  for (let i = 1; i < 10; i++) await app.page.locator('.pestana').first().locator('.cerrar-pestana').click();
  await app.page.waitForFunction(() => Object.keys(window.__NOVA_BENCH__.sessions).length === 1);
  for (let i = 0; i < 3; i++) await app.page.getByRole('button', { name: 'Split right', exact: true }).click();
  await app.page.waitForFunction(() => Object.keys(window.__NOVA_BENCH__.sessions).length === 4);
  await sample(app, 'four-panes');
  for (let i = 0; i < 3; i++) await app.page.getByRole('button', { name: 'Close pane', exact: true }).click();
  await app.page.waitForFunction(() => Object.keys(window.__NOVA_BENCH__.sessions).length === 1);
  for (let i = 0; i < 20; i++) {
    await app.page.locator('.nueva-pestana').click();
    await app.page.waitForFunction(() => Object.keys(window.__NOVA_BENCH__.sessions).length === 2);
    await app.page.locator('.pestana').last().locator('.cerrar-pestana').click();
    await app.page.waitForFunction(() => Object.keys(window.__NOVA_BENCH__.sessions).length === 1);
  }
  await command(app, "Write-Output ('NOVA_CYCLES_' + 'OK')");
  await marker(app, 'NOVA_CYCLES_OK');
  checks.push({ name: 'twenty-tab-open-close-cycles', passed: true });
  await sample(app, 'post-cycles-soak', soak);
  await command(app, "Write-Output ('NOVA_SOAK_' + 'OK')");
  await marker(app, 'NOVA_SOAK_OK');
  checks.push({ name: 'shell-responsive-after-soak', passed: true });
  app.finalErrors = await app.page.evaluate(() => window.__NOVA_BENCH__.errors);
  await close(app); app = null;
  assert.ok(checks.every((c) => c.passed), 'All compatibility checks passed');
  const result = { capturedUtc: new Date().toISOString(), sourceCommit: revision,
    version: JSON.parse(readFileSync('package.json', 'utf8')).version,
    executableSha256: createHash('sha256').update(readFileSync(executable)).digest('hex'),
    os: execFileSync('cmd.exe', ['/c', 'ver'], { encoding: 'utf8' }).trim(), settings,
    startup, runs, checks, rawRoot: root,
    limitations: ['Current-version baseline only; no before/after savings claim.',
      'Startup includes CDP connection and observation overhead; OS caches were not flushed.',
      'Loopback CDP, bounded output instrumentation and resource sampling add overhead.',
      'App totals include WebView2; workload totals include shells and widget subprocesses.',
      'Five-minute soak is not a full working-day endurance test.',
      'Private bytes are committed private memory, not physical RAM; summed working sets can double-count shared pages.'] };
  mkdirSync('.ecc/benchmarks', { recursive: true });
  writeFileSync('.ecc/benchmarks/windows-0.1.1.json', JSON.stringify(result, null, 2) + '\n');
  writeFileSync(join(root, 'summary.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(`Benchmark complete: ${root}`);
} finally {
  if (app?.child.exitCode === null) {
    await app.page.getByRole('button', { name: 'Close', exact: true }).click().catch(() => {});
    await app.browser.close().catch(() => {});
  }
}
