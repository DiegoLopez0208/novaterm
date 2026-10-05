import { useCallback, useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { PLUGINS_CHANGED } from '../plugins/events'
import {
  DESCRIPCION_PERMISO,
  esDelicado,
  type Ficha,
  type Permiso,
  type Plugin,
} from '../plugins/tipos'

/// Catalogo de plugins: buscar, ver que pide cada uno, instalar y desinstalar.
///
/// La pantalla de consentimiento es la parte que importa. Instalar no concede
/// nada: hasta que el usuario marque los permisos, el broker rechaza todo. Por
/// eso se listan por su consecuencia y los delicados van marcados, en vez de
/// mostrar una lista de nombres tecnicos que nadie lee.

interface Props {
  onCerrar: () => void
}

export function MarketplacePanel({ onCerrar }: Props) {
  const [consulta, setConsulta] = useState('')
  const [fichas, setFichas] = useState<Ficha[]>([])
  const [instalados, setInstalados] = useState<Plugin[]>([])
  const [elegida, setElegida] = useState<Ficha | null>(null)
  const [marcados, setMarcados] = useState<Permiso[]>([])
  const [estado, setEstado] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  const recargarInstalados = useCallback(() => {
    void invoke<Plugin[]>('plugins_list')
      .then(setInstalados)
      .catch(() => setInstalados([]))
  }, [])

  useEffect(recargarInstalados, [recargarInstalados])

  const buscar = useCallback(
    (texto: string) => {
      setCargando(true)
      setEstado(null)
      invoke<Ficha[]>('market_buscar', { consulta: texto })
        .then(setFichas)
        .catch((err) => setEstado(`Could not connect to the registry: ${err}`))
        .finally(() => setCargando(false))
    },
    [],
  )

  // Una sola busqueda vacia al abrir, para que el catalogo no aparezca en
  // blanco. No se relanza al tipear: cada tecla seria un viaje al registro.
  useEffect(() => {
    buscar('')
  }, [buscar])

  const abrir = (ficha: Ficha) => {
    setElegida(ficha)
    // Nada viene marcado de entrada. Un permiso preseleccionado se concede solo
    // con apurarse, que es justo lo que hay que evitar.
    setMarcados([])
    setEstado(null)
  }

  const alternar = (permiso: Permiso) => {
    setMarcados((previos) =>
      previos.includes(permiso) ? previos.filter((p) => p !== permiso) : [...previos, permiso],
    )
  }

  const instalar = async (ficha: Ficha) => {
    setCargando(true)
    setEstado('Downloading and verifying signature...')
    try {
      await invoke('plugin_install', { id: ficha.id, version: null })
      window.dispatchEvent(new Event(PLUGINS_CHANGED))
      // Los permisos se conceden despues de instalar: antes no hay manifiesto en
      // disco contra el cual validarlos.
      if (marcados.length > 0) {
        await invoke('plugin_conceder', { id: ficha.id, permisos: marcados })
      }
      setEstado(`"${ficha.name}" was installed.`)
      setElegida(null)
      recargarInstalados()
    } catch (err) {
      setEstado(`Installation failed: ${err}`)
    } finally {
      setCargando(false)
    }
  }

  const desinstalar = async (id: string) => {
    if (!window.confirm(`Uninstall "${id}"? Its permissions will also be removed.`)) return
    try {
      await invoke('plugin_uninstall', { id })
      window.dispatchEvent(new Event(PLUGINS_CHANGED))
      recargarInstalados()
      setEstado(`"${id}" was uninstalled.`)
    } catch (err) {
      setEstado(`Could not uninstall: ${err}`)
    }
  }

  const estaInstalado = (id: string) => instalados.some((p) => p.id === id)

  return (
    <div className="paleta-fondo" onMouseDown={onCerrar}>
      <div className="marketplace" onMouseDown={(e) => e.stopPropagation()}>
        <header>
          <h2>Plugins</h2>
          <button type="button" onClick={onCerrar} title="Close">
            ✕
          </button>
        </header>

        <form
          className="buscador"
          onSubmit={(e) => {
            e.preventDefault()
            buscar(consulta)
          }}
        >
          <input
            value={consulta}
            onChange={(e) => setConsulta(e.target.value)}
            placeholder="Search catalog"
            autoFocus
          />
          <button type="submit" disabled={cargando}>
            Search
          </button>
        </form>

        {estado && <p className="estado">{estado}</p>}

        {elegida ? (
          <section className="consentimiento">
            <h3>{elegida.name}</h3>
            <p>{elegida.description}</p>

            {elegida.permissions.length === 0 ? (
              <p className="sin-permisos">
                No API permissions requested: this plugin contributes widgets and profiles.
              </p>
            ) : (
              <>
                <p className="grupo">This plugin requests permission to:</p>
                <ul className="permisos">
                  {elegida.permissions.map((permiso) => (
                    <li key={permiso} className={esDelicado(permiso) ? 'delicado' : undefined}>
                      <label>
                        <input
                          type="checkbox"
                          checked={marcados.includes(permiso)}
                          onChange={() => alternar(permiso)}
                        />
                        <span>{DESCRIPCION_PERMISO[permiso]}</span>
                      </label>
                    </li>
                  ))}
                </ul>
                <p className="aviso">
                  Unchecked permissions remain denied.
                </p>
              </>
            )}

            <div className="acciones">
              <button type="button" onClick={() => setElegida(null)}>
                Back
              </button>
              <button type="button" disabled={cargando} onClick={() => void instalar(elegida)}>
                Install
              </button>
            </div>
          </section>
        ) : (
          <ul className="catalogo">
            {fichas.map((ficha) => (
              <li key={ficha.id}>
                <div>
                  <strong>{ficha.name}</strong>
                  <p>{ficha.description}</p>
                  {ficha.permissions.some(esDelicado) && (
                    <em className="delicado">Requests terminal access</em>
                  )}
                </div>
                {estaInstalado(ficha.id) ? (
                  <button type="button" onClick={() => void desinstalar(ficha.id)}>
                    Uninstall
                  </button>
                ) : (
                  <button type="button" onClick={() => abrir(ficha)}>
                    View
                  </button>
                )}
              </li>
            ))}
            {fichas.length === 0 && !cargando && (
              <li className="vacio">The catalog is empty.</li>
            )}
          </ul>
        )}
      </div>
    </div>
  )
}
