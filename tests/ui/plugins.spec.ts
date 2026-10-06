import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

const entries = Object.fromEntries(['json-tools', 'timestamp-tools', 'output-inspector', 'command-snippets'].map((name) =>
  [`example-${name}`, readFileSync(`examples/plugins/${name}/index.js`, 'utf8')]))
const installed = [
  { id: 'example-json-tools', name: 'JSON tools', description: 'Format and validate JSON locally.', permissions: ['ui.panel'] },
  { id: 'example-timestamp-tools', name: 'Timestamp tools', description: 'Convert timestamps locally.', permissions: ['ui.panel'] },
  { id: 'example-output-inspector', name: 'Output inspector', description: 'Capture terminal output on demand.', permissions: ['ui.panel', 'terminal.read'] },
  { id: 'example-command-snippets', name: 'Command snippets', description: 'Insert reviewed commands.', permissions: ['ui.panel', 'terminal.write'] },
].map((plugin) => ({ ...plugin, version: '0.1.0', widgets: [], profiles: [], commands: [], entry: 'index.js', carpeta: '' }))

async function boot(page: Page, options: { denied?: boolean; offline?: boolean } = {}) {
  await page.addInitScript(({ plugins, sources, options }) => {
    const normal = { black: '#161821', red: '#e27878', green: '#b4be82', yellow: '#e2a478', blue: '#84a0c6', magenta: '#a093c7', cyan: '#89b8c2', white: '#c6c8d1' }
    const config = {
      window: { opacity: 1, blur: false, padding: 12, decorations: false },
      font: { family: 'Nova Mono', size: 14, line_height: 1.1, letter_spacing: 0, ligatures: false },
      cursor: { style: 'bar', blink: false }, terminal: { scrollback: 5000, smooth_scroll_ms: 120, copy_on_select: false, gpu: false },
      shell: { default_profile: null }, ui: { tab_bar: true, status_bar: true, animations: true, welcome: false },
      colors: { background: '#0d0f18', foreground: '#d8dee9', cursor: '#ffffff', selection: '#2b3245', normal, bright: { ...normal, black: '#6b7089' } },
      profiles: [], llm: { provider: 'deepseek', model: '', tokens_por_dia: 200000 },
      plugins: { concedidos: options.denied ? {} : Object.fromEntries(plugins.map((plugin) => [plugin.id, plugin.permissions])), de_confianza: [], registro: 'http://127.0.0.1:8787' },
    }
    const win = window as unknown as Record<string, unknown>
    win.__NOVA_CONFIG__ = config
    const calls: { command: string; args: unknown }[] = []
    win.__TEST_CALLS__ = calls
    let callbackId = 0
    const callbacks = new Map<number, (value: unknown) => void>()
    const listeners = new Map<string, number>()
    win.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} }
    win.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
      transformCallback: (callback: (value: unknown) => void) => { callbacks.set(++callbackId, callback); return callbackId },
      unregisterCallback: (id: number) => callbacks.delete(id),
      invoke: async (command: string, args: Record<string, unknown> = {}) => {
        calls.push({ command, args })
        if (command === 'config_get' || command === 'config_reload') return config
        if (command === 'config_path') return 'C:/test/config.toml'
        if (command === 'plugins_list') return plugins
        if (command === 'profiles_list') return [{ id: 'pwsh', name: 'PowerShell', command: 'pwsh.exe', args: [], icon: '', detectado: true }]
        if (command === 'plugin_entry') return sources[String(args.id)]
        if (command === 'market_buscar') {
          if (options.offline) throw new Error('Test registry offline')
          return [{ id: 'remote-plugin', name: 'Remote tool', description: 'A registry example.', permissions: ['ui.panel', 'terminal.read'], clave_publica: '', versions: [{ version: '0.1.0', url: '', sha256: '', firma: '' }] }]
        }
        if (command === 'plugin:event|listen') { listeners.set(String(args.event), Number(args.handler)); return 1 }
        if (command === 'plugin_conceder') {
          config.plugins.concedidos[String(args.id)] = args.permisos as string[]
          callbacks.get(listeners.get('config://changed') ?? -1)?.({ event: 'config://changed', id: 1, payload: structuredClone(config) })
        }
        if (command === 'config_save') Object.assign(config, args.config)
        if (command === 'pty_spawn') return args.id
        if (command === 'plugin:window|is_focused') return true
        if (command === 'system_stats') return { cpu: 0, ram_usada: 0, ram_total: 16 * 1024 ** 3 }
        return null
      },
    }
  }, { plugins: installed, sources: entries, options })
  await page.goto('/')
  await page.getByRole('button', { name: 'Plugins', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Plugin library' })).toBeVisible()
}

test('installed library filters locally, opens a real sandbox and formats JSON', async ({ page }) => {
  await boot(page, { offline: true })
  await page.getByRole('searchbox', { name: 'Search plugins' }).fill('JSON')
  await expect(page.locator('.plugin-card')).toHaveCount(1)
  await page.getByRole('button', { name: 'Open panel' }).click()
  const frame = page.frameLocator('iframe[title="JSON tools"]')
  await frame.getByRole('textbox', { name: 'JSON input' }).fill('{"text":"<script>雪</script>"}')
  await frame.getByRole('button', { name: 'Format JSON' }).click()
  await expect(frame.getByRole('textbox', { name: 'Formatted JSON' })).toHaveValue('{\n  "text": "<script>雪</script>"\n}')
  await expect(page.locator('iframe')).toHaveAttribute('sandbox', 'allow-scripts')
  await page.screenshot({ path: 'test-results/json-panel.png' })
})

test('missing panel permission opens settings and grants only after a user action', async ({ page }) => {
  await boot(page, { denied: true })
  await page.locator('.plugin-card').filter({ hasText: 'JSON tools' }).getByRole('button', { name: 'Open panel' }).click()
  await expect(page.getByRole('heading', { name: 'Plugins & AI' })).toBeVisible()
  await page.screenshot({ path: 'test-results/plugin-settings.png' })
  await expect(page.locator('iframe')).toHaveCount(0)
  const permission = page.locator('.installed-plugin-settings').filter({ hasText: 'JSON tools' }).getByRole('checkbox')
  await expect(permission).not.toBeChecked()
  await permission.check()
  await expect(page.getByRole('status')).toHaveText('Permissions saved.')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Plugins', exact: true }).click()
  await page.locator('.plugin-card').filter({ hasText: 'JSON tools' }).getByRole('button', { name: 'Open panel' }).click()
  await expect(page.frameLocator('iframe').getByRole('heading', { name: 'JSON tools' })).toBeVisible()
})

test('offline discovery has a retry state while installed plugins remain available', async ({ page }) => {
  await boot(page, { offline: true })
  await page.screenshot({ path: 'test-results/plugin-library.png' })
  await page.getByRole('button', { name: 'Discover', exact: true }).click()
  await expect(page.getByText('The registry could not be reached')).toBeVisible()
  await page.getByRole('button', { name: 'Retry connection' }).click()
  await expect(page.getByText('The registry could not be reached')).toBeVisible()
  await page.getByRole('button', { name: /^Installed/ }).click()
  await expect(page.locator('.plugin-card')).toHaveCount(4)
  await expect(page.getByText('The registry could not be reached')).not.toBeVisible()
})

test('installation review never preselects capabilities and traps keyboard focus', async ({ page }) => {
  await boot(page)
  const close = page.getByRole('button', { name: 'Close plugin library' })
  await close.focus()
  await page.keyboard.press('Shift+Tab')
  await expect(page.locator('.plugin-card').last().getByRole('button', { name: 'Uninstall' })).toBeFocused()
  await page.getByRole('button', { name: 'Discover', exact: true }).click()
  await page.getByRole('button', { name: 'Review plugin' }).click()
  for (const checkbox of await page.getByRole('checkbox').all()) await expect(checkbox).not.toBeChecked()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Plugins', exact: true })).toBeFocused()
})

test('mobile layouts fit and settings navigation remains usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 740 })
  await boot(page)
  const library = page.locator('.marketplace')
  expect(await library.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/plugin-library-mobile.png' })
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Terminal', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Terminal', exact: true })).toBeVisible()
  expect(await page.locator('.settings').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
})

test('snippet panel writes only after a click and host consent, without Enter', async ({ page }) => {
  await boot(page)
  await page.locator('.plugin-card').filter({ hasText: 'Command snippets' }).getByRole('button', { name: 'Open panel' }).click()
  const frame = page.frameLocator('iframe[title="Command snippets"]')
  await expect(frame.getByRole('heading', { name: 'Command snippets' })).toBeVisible()
  const writes = () => page.evaluate(() => (window as unknown as { __TEST_CALLS__: { command: string; args: { data?: string } }[] }).__TEST_CALLS__.filter((call) => call.command === 'pty_write'))
  expect(await writes()).toHaveLength(0)
  page.once('dialog', (dialog) => dialog.dismiss())
  await frame.getByRole('button', { name: 'Insert into terminal' }).click()
  await expect(frame.getByRole('status')).toContainText('did not approve')
  expect(await writes()).toHaveLength(0)
  page.once('dialog', (dialog) => dialog.accept())
  await frame.getByRole('button', { name: 'Insert into terminal' }).click()
  await expect(frame.getByRole('status')).toContainText('Inserted without Enter')
  expect((await writes()).map((call) => call.args.data)).toEqual(['git status --short'])
})
