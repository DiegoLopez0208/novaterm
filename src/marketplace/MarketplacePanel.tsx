import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { PLUGINS_CHANGED } from '../plugins/events'
import { useDialogFocus } from '../chrome/useDialogFocus'
import { DESCRIPCION_PERMISO, esDelicado, type Ficha, type Permiso, type Plugin } from '../plugins/tipos'

interface Props {
  onCerrar: () => void
  onOpen: (plugin: Plugin) => void
}

export function MarketplacePanel({ onCerrar, onOpen }: Props) {
  const dialog = useDialogFocus(onCerrar)
  const [view, setView] = useState<'discover' | 'installed'>('installed')
  const [query, setQuery] = useState('')
  const [catalog, setCatalog] = useState<Ficha[]>([])
  const [installed, setInstalled] = useState<Plugin[]>([])
  const [selected, setSelected] = useState<Ficha | null>(null)
  const [permissions, setPermissions] = useState<Permiso[]>([])
  const [message, setMessage] = useState('')
  const [registryError, setRegistryError] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const sequence = useRef(0)

  const reloadInstalled = useCallback(async () => {
    try { setInstalled(await invoke<Plugin[]>('plugins_list')) }
    catch (error) { setMessage(`Could not load installed plugins: ${error}`) }
  }, [])
  useEffect(() => { void reloadInstalled() }, [reloadInstalled])
  useEffect(() => () => { sequence.current += 1 }, [])

  const search = useCallback(async (text: string) => {
    const request = ++sequence.current
    setLoading(true)
    setRegistryError('')
    try {
      const result = await invoke<Ficha[]>('market_buscar', { consulta: text })
      if (request === sequence.current) setCatalog(result)
    } catch (error) {
      if (request === sequence.current) setRegistryError(`Registry unavailable: ${error}`)
    } finally { if (request === sequence.current) setLoading(false) }
  }, [])
  useEffect(() => { if (view === 'discover') void search('') }, [view, search])

  const install = async (plugin: Ficha) => {
    setBusy(true)
    setMessage('Downloading and verifying the plugin signature…')
    try {
      await invoke('plugin_install', { id: plugin.id, version: null })
      window.dispatchEvent(new Event(PLUGINS_CHANGED))
      await reloadInstalled()
      setMessage(`${plugin.name} installed.`)
      if (permissions.length) {
        try { await invoke('plugin_conceder', { id: plugin.id, permisos: permissions }) }
        catch (error) { setMessage(`${plugin.name} installed, but permissions could not be saved: ${error}. Open Settings → Plugins & AI to retry.`) }
      }
      setSelected(null)
      setView('installed')
    } catch (error) { setMessage(`Installation failed: ${error}`) }
    finally { setBusy(false) }
  }
  const uninstall = async (plugin: Plugin) => {
    if (!window.confirm(`Uninstall "${plugin.name}"? Its permissions will also be removed.`)) return
    setBusy(true)
    try {
      await invoke('plugin_uninstall', { id: plugin.id })
      window.dispatchEvent(new Event(PLUGINS_CHANGED))
      await reloadInstalled()
      setMessage(`${plugin.name} uninstalled.`)
    } catch (error) { setMessage(`Could not uninstall: ${error}`) }
    finally { setBusy(false) }
  }

  const local = installed.filter((plugin) => `${plugin.name} ${plugin.description}`.toLowerCase().includes(query.toLowerCase()))
  return (
    <div className="paleta-fondo" onMouseDown={() => { if (!busy) onCerrar() }}>
      <div className="marketplace" role="dialog" aria-modal="true" aria-labelledby="plugin-title"
        ref={dialog} tabIndex={-1} onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><span className="eyebrow">YOUR WORKSPACE, EXTENDED</span><h2 id="plugin-title">Plugin library</h2>
            <p>Small tools that make your terminal yours.</p></div>
          <button type="button" onClick={onCerrar} disabled={busy} aria-label="Close plugin library">×</button>
        </header>
        <nav className="library-nav" aria-label="Plugin library views">
          <button type="button" aria-pressed={view === 'installed'} disabled={busy}
            onClick={() => { setView('installed'); setSelected(null); setQuery('') }}>Installed <span>{installed.length}</span></button>
          <button type="button" aria-pressed={view === 'discover'} disabled={busy}
            onClick={() => { setView('discover'); setSelected(null); setQuery('') }}>Discover</button>
        </nav>
        <form className="buscador" role="search" onSubmit={(event) => {
          event.preventDefault(); if (view === 'discover') void search(query)
        }}>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)}
            aria-label="Search plugins" placeholder={view === 'installed' ? 'Filter installed plugins…' : 'Search the registry…'} disabled={busy} />
          {view === 'discover' && <button type="submit" disabled={loading || busy}>Search</button>}
        </form>
        {message && <p className="estado" role="status">{message}</p>}
        {view === 'discover' && registryError && <div className="library-notice" role="status">
          <strong>The registry could not be reached</strong><p>Your installed plugins are still available. Check the registry address in your configuration.</p>
          <details><summary>Connection details</summary><p>{registryError}</p></details>
          <button type="button" disabled={loading || busy} onClick={() => { void search(query) }}>Retry connection</button>
        </div>}
        {selected ? <section className="consentimiento">
          <span className="eyebrow">REVIEW BEFORE INSTALLING</span><h3>{selected.name}</h3><p>{selected.description}</p>
          <p className="nota">Version {selected.versions[0]?.version ?? 'unknown'} · {selected.id}</p>
          <p className="grupo">Choose capabilities to allow</p>
          <ul className="permisos">{selected.permissions.map((permission) => <li key={permission} className={esDelicado(permission) ? 'delicado' : undefined}>
            <label><input type="checkbox" disabled={busy} checked={permissions.includes(permission)} onChange={() => setPermissions((current) => current.includes(permission) ? current.filter((item) => item !== permission) : [...current, permission])} />
              <span>{DESCRIPCION_PERMISO[permission]}</span></label>
          </li>)}</ul>
          <p className="nota">{selected.permissions.length ? 'Unchecked capabilities remain denied. You can change them later in Settings.' : 'No sandbox API permissions requested. Declarative widgets may run the commands listed in their manifest.'}</p>
          <div className="acciones"><button type="button" disabled={busy} onClick={() => setSelected(null)}>Back</button>
            <button type="button" className="primary" disabled={busy || !selected.versions.length} onClick={() => { void install(selected) }}>{busy ? 'Installing…' : 'Install plugin'}</button></div>
        </section> : <div className="library-content" aria-busy={loading || busy}>
          {view === 'installed' ? <>
            <ul className="plugin-grid">{local.map((plugin) => <li className="plugin-card" key={plugin.id}>
              <div className="plugin-card-heading"><span className="plugin-mark" aria-hidden="true">{plugin.name.slice(0, 2).toUpperCase()}</span>
                <div><h3>{plugin.name}</h3><span className="plugin-meta">v{plugin.version} · {plugin.entry ? 'Panel' : 'Widget / profile'}</span></div></div>
              <p>{plugin.description}</p><div className="plugin-tags">{plugin.permissions.map((permission) => <span key={permission}>{permission}</span>)}</div>
              <div className="plugin-card-actions">{plugin.entry && <button type="button" className="primary" disabled={busy} onClick={() => onOpen(plugin)}>Open panel</button>}
                <button type="button" disabled={busy} onClick={() => { void uninstall(plugin) }}>Uninstall</button></div>
            </li>)}</ul>
            {!local.length && <div className="library-empty"><h3>{installed.length ? 'No matching plugins' : 'Make room for your tools'}</h3>
              <p>{installed.length ? 'Try a different name or clear the search.' : 'Discover plugins in the registry, or copy a starter plugin into ~/.novaterm/plugins and restart NovaTerm.'}</p>
              {!installed.length && <button type="button" onClick={() => setView('discover')}>Explore the registry</button>}</div>}
          </> : <>
            {loading && <p role="status" className="library-empty">Loading plugins…</p>}
            {!loading && !registryError && <ul className="plugin-grid">{catalog.map((plugin) => <li className="plugin-card" key={plugin.id}>
              <div className="plugin-card-heading"><span className="plugin-mark" aria-hidden="true">{plugin.name.slice(0, 2).toUpperCase()}</span><h3>{plugin.name}</h3></div>
              <p>{plugin.description}</p><div className="plugin-tags">{plugin.permissions.some(esDelicado) && <span>Terminal access</span>}{plugin.permissions.includes('llm.complete') && <span>Uses AI provider</span>}</div>
              <div className="plugin-card-actions">{installed.some((item) => item.id === plugin.id) ? <span className="plugin-meta">Installed · manage in Installed</span> :
                <button type="button" disabled={busy} onClick={() => { setSelected(plugin); setPermissions([]); setMessage('') }}>Review plugin</button>}</div>
            </li>)}</ul>}
            {!loading && !registryError && !catalog.length && <div className="library-empty"><h3>No plugins found</h3><p>Try another search. The registry may not have published plugins yet.</p></div>}
          </>}
        </div>}
        <footer className="library-footer">You control permissions. Installed panels open on demand.</footer>
      </div>
    </div>
  )
}
