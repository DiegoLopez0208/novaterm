import { useCallback, useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
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
        .catch((err) => setEstado(`No se pudo hablar con el registro: ${err}`))
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
    setEstado('Bajando y verificando la firma...')
    try {
      await invoke('plugin_install', { id: ficha.id, version: null })
      // Los permisos se conceden despues de instalar: antes no hay manifiesto en
      // disco contra el cual validarlos.
      if (marcados.length > 0) {
        await invoke('plugin_conceder', { id: ficha.id, permisos: marcados })
      }
      setEstado(`"${ficha.name}" quedó instalado.`)
      setElegida(null)
      recargarInstalados()
    } catch (err) {
      setEstado(`No se instaló: ${err}`)
    } finally {
      setCargando(false)
    }
  }

  const desinstalar = async (id: string) => {
    if (!window.confirm(`¿Desinstalar "${id}"? También se olvidan sus permisos.`)) return
    try {
      await invoke('plugin_uninstall', { id })
      recargarInstalados()
      setEstado(`"${id}" se desinstaló.`)
    } catch (err) {
      setEstado(`No se pudo desinstalar: ${err}`)
    }
  }

  const estaInstalado = (id: string) => instalados.some((p) => p.id === id)

  return (
    <div className="paleta-fondo" onMouseDown={onCerrar}>
      <div className="marketplace" onMouseDown={(e) => e.stopPropagation()}>
        <header>
          <h2>Plugins</h2>
          <button type="button" onClick={onCerrar} title="Cerrar">
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
            placeholder="Buscar en el catálogo"
            autoFocus
          />
          <button type="submit" disabled={cargando}>
            Buscar
          </button>
        </form>

        {estado && <p className="estado">{estado}</p>}

        {elegida ? (
          <section className="consentimiento">
            <h3>{elegida.name}</h3>
            <p>{elegida.description}</p>

            {elegida.permissions.length === 0 ? (
              <p className="sin-permisos">
                No pide ningún permiso: solo aporta widgets y perfiles.
              </p>
            ) : (
              <>
                <p className="grupo">Este plugin quiere poder:</p>
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
                  Lo que no marques queda denegado. Podés cambiarlo después en Ajustes.
                </p>
              </>
            )}

            <div className="acciones">
              <button type="button" onClick={() => setElegida(null)}>
                Volver
              </button>
              <button type="button" disabled={cargando} onClick={() => void instalar(elegida)}>
                Instalar
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
                    <em className="delicado">Pide acceso a tu terminal</em>
                  )}
                </div>
                {estaInstalado(ficha.id) ? (
                  <button type="button" onClick={() => void desinstalar(ficha.id)}>
                    Desinstalar
                  </button>
                ) : (
                  <button type="button" onClick={() => abrir(ficha)}>
                    Ver
                  </button>
                )}
              </li>
            ))}
            {fichas.length === 0 && !cargando && (
              <li className="vacio">No hay nada en el catálogo todavía.</li>
            )}
          </ul>
        )}
      </div>
    </div>
  )
}
