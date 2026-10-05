import { useEffect, useRef, useState } from 'react'
import { atajo } from '../acciones/registro'
import { Cerrar, ChevronAbajo, IconoPerfil, Mas } from '../chrome/Iconos'
import { hojas, type Pestana } from './modelo'
import { shortTitle } from './title'

export interface PerfilDisponible {
  id: string
  name: string
  command: string
  args: string[]
  /// Que shell es: "powershell", "cmd", "linux", "bash" o "ssh". Lo manda el
  /// backend con cada perfil y hasta ahora se descartaba.
  icon: string
  detectado: boolean
}

interface Props {
  pestanas: Pestana[]
  activa: string
  perfiles: PerfilDisponible[]
  onSeleccionar: (id: string) => void
  onCerrar: (id: string) => void
  onNueva: (perfil?: PerfilDisponible) => void
  onRenombrar: (id: string, alias: string) => void
}

/// Que shell corre la pestaña, para elegirle el icono. El modelo guarda el
/// comando con el que se abrio el panel, no el perfil: se busca por ahi, y si
/// la pestaña salio del shell por defecto no hay comando y se cae al generico.
function iconoDePestana(pestana: Pestana, perfiles: PerfilDisponible[]): string {
  const comando = hojas(pestana.raiz)[0]?.perfil?.shell
  if (!comando) return ''
  const perfil = perfiles.find((p) => p.command === comando)
  return perfil?.icon ?? ''
}

export function TabBar({
  pestanas,
  activa,
  perfiles,
  onSeleccionar,
  onCerrar,
  onNueva,
  onRenombrar,
}: Props) {
  const [editando, setEditando] = useState<string | null>(null)
  const [menu, setMenu] = useState(false)

  return (
    <div className="pestanas" role="tablist">
      {pestanas.map((pestana) => {
        const paneles = hojas(pestana.raiz).length
        const etiqueta = pestana.alias ?? shortTitle(pestana.titulo)
        const esActiva = pestana.id === activa
        const icono = iconoDePestana(pestana, perfiles)

        return (
          <div
            key={pestana.id}
            className={`pestana${esActiva ? ' activa' : ''}`}
            role="tab"
            aria-selected={esActiva}
            onMouseDown={(e) => {
              if (e.button === 1) {
                e.preventDefault()
                onCerrar(pestana.id)
                return
              }
              onSeleccionar(pestana.id)
            }}
            onDoubleClick={() => setEditando(pestana.id)}
          >
            {editando === pestana.id ? (
              <CampoNombre
                inicial={etiqueta}
                onListo={(valor) => {
                  onRenombrar(pestana.id, valor)
                  setEditando(null)
                }}
              />
            ) : (
              <>
                <IconoPerfil nombre={icono} tam={11} />
                <span className="etiqueta">{etiqueta}</span>
                {paneles > 1 && <span className="paneles">{paneles}</span>}
                <button
                  className="cerrar-pestana"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => onCerrar(pestana.id)}
                  aria-label={`Cerrar ${etiqueta}`}
                  title="Cerrar"
                >
                  <Cerrar tam={11} />
                </button>
              </>
            )}
          </div>
        )
      })}

      <div className="nueva-envoltorio">
        <button
          className="nueva-pestana"
          onClick={() => onNueva()}
          title={`Nueva pestaña — ${atajo('pestana.nueva')}`}
        >
          <Mas tam={12} />
        </button>
        {perfiles.length > 0 && (
          <button
            className="desplegar-perfiles"
            onClick={() => setMenu((v) => !v)}
            aria-label="Elegir perfil"
            title="Elegir perfil"
          >
            <ChevronAbajo tam={11} />
          </button>
        )}

        {menu && (
          <>
            <div className="menu-fondo" onClick={() => setMenu(false)} />
            <ul className="menu-perfiles" role="menu">
              {perfiles.map((perfil) => (
                <li key={perfil.id}>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenu(false)
                      onNueva(perfil)
                    }}
                  >
                    <IconoPerfil nombre={perfil.icon} />
                    {perfil.name}
                    {!perfil.detectado && <em>propio</em>}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}

function CampoNombre({
  inicial,
  onListo,
}: {
  inicial: string
  onListo: (valor: string) => void
}) {
  const [valor, setValor] = useState(inicial)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    ref.current?.select()
  }, [])

  return (
    <input
      ref={ref}
      className="nombre-pestana"
      value={valor}
      onChange={(e) => setValor(e.target.value)}
      onBlur={() => onListo(valor)}
      onKeyDown={(e) => {
        // Se frena la propagacion o el atajo global de la app se lleva la tecla.
        e.stopPropagation()
        if (e.key === 'Enter') onListo(valor)
        if (e.key === 'Escape') onListo(inicial)
      }}
    />
  )
}
