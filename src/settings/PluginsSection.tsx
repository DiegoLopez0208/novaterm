import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { NovaConfig } from '../config/configBridge'
import { DESCRIPCION_PERMISO, type Plugin, type Permiso, type Proveedor } from '../plugins/tipos'

interface Props {
  config: NovaConfig
  onChange: (config: NovaConfig) => void
}

export function PluginsSection({ config, onChange }: Props) {
  const [plugins, setPlugins] = useState<Plugin[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [key, setKey] = useState('')

  useEffect(() => {
    let live = true
    void invoke<Plugin[]>('plugins_list').then((list) => {
      if (live) setPlugins(list)
    }).catch((error) => { if (live) setMessage(String(error)) })
    return () => { live = false }
  }, [])

  useEffect(() => { setKey(''); setMessage('') }, [config.llm.provider])

  const grant = async (plugin: Plugin, permission: Permiso, checked: boolean) => {
    setBusy(true)
    setMessage('')
    const current = (config.plugins.concedidos[plugin.id] ?? []).filter((p) => plugin.permissions.includes(p))
    const permissions = checked ? [...new Set([...current, permission])] : current.filter((p) => p !== permission)
    try {
      // Rust validates the requested permissions against the installed manifest.
      await invoke('plugin_conceder', { id: plugin.id, permisos: permissions })
      // Update the visible state and replace any pending debounced config save.
      onChange({ ...config, plugins: {
        ...config.plugins, concedidos: { ...config.plugins.concedidos, [plugin.id]: permissions },
      } })
      setMessage('Permissions saved.')
    } catch (error) { setMessage(String(error)) }
    finally { setBusy(false) }
  }

  const saveKey = async (remove = false) => {
    setBusy(true)
    setMessage('')
    try {
      await invoke('llm_clave', { proveedor: config.llm.provider, clave: remove ? '' : key })
      setKey('')
      setMessage(remove ? 'API key removed.' : 'API key saved in the system credential store.')
    } catch (error) { setMessage(String(error)) }
    finally { setBusy(false) }
  }

  return (
    <>
      <p className="grupo">Installed plugins</p>
      <p className="nota">Approve each capability explicitly. Terminal writes ask for confirmation unless the plugin is already trusted in your configuration.</p>
      {plugins.length === 0 && <p className="nota">No local plugins found. Copy an example to ~/.novaterm/plugins and restart NovaTerm.</p>}
      {plugins.map((plugin) => (
        <section key={plugin.id}>
          <strong>{plugin.name}</strong>
          <p className="nota">{plugin.description}</p>
          {plugin.permissions.map((permission) => (
            <label className="campo" key={permission}>
              <span>{DESCRIPCION_PERMISO[permission]}</span>
              <input type="checkbox" disabled={busy}
                checked={(config.plugins.concedidos[plugin.id] ?? []).includes(permission)}
                onChange={(event) => { void grant(plugin, permission, event.target.checked) }} />
            </label>
          ))}
          {plugin.permissions.length === 0 && <p className="nota">Declarative plugin: no API permissions.</p>}
        </section>
      ))}

      <div className="separador" />
      <p className="grupo">AI provider</p>
      <label className="campo">
        <span>Provider</span>
        <select disabled={busy} value={config.llm.provider}
          onChange={(event) => onChange({ ...config, llm: { ...config.llm, provider: event.target.value as Proveedor, model: '' } })}>
          <option value="deepseek">DeepSeek</option>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
        </select>
      </label>
      <label className="campo">
        <span>Model (blank uses provider default)</span>
        <input className="texto" disabled={busy} value={config.llm.model}
          onChange={(event) => onChange({ ...config, llm: { ...config.llm, model: event.target.value } })} />
      </label>
      <label className="campo">
        <span>Daily token budget per plugin</span>
        <input className="texto" disabled={busy} type="number" min={0} step={1000} value={config.llm.tokens_por_dia}
          onChange={(event) => {
            const value = Number(event.target.value)
            if (Number.isSafeInteger(value) && value >= 0) onChange({ ...config, llm: { ...config.llm, tokens_por_dia: value } })
          }} />
      </label>
      <label className="campo">
        <span>New API key for {config.llm.provider}</span>
        <input className="texto" type="password" autoComplete="off" disabled={busy} value={key}
          onChange={(event) => setKey(event.target.value)} />
      </label>
      <div className="botones-ssh">
        <button disabled={busy || !key.trim()} onClick={() => { void saveKey() }}>Save key</button>
        <button disabled={busy} onClick={() => { void saveKey(true) }}>Remove saved key</button>
      </div>
      {message && <p className="nota" role="status">{message}</p>}
    </>
  )
}
