import { useEffect, useRef, useState } from 'react'
import type { SearchAddon } from '@xterm/addon-search'
import { atajo } from '../acciones/registro'

interface Props {
  buscador: SearchAddon | null
  onCerrar: () => void
}

/// Buscar en el scrollback. Vive dentro del panel y no en el chrome: cada panel
/// tiene su propia terminal y su propio historial, y buscar en "la terminal"
/// sin decir en cual no significa nada cuando hay cuatro abiertas.
export function BarraBusqueda({ buscador, onCerrar }: Props) {
  const [texto, setTexto] = useState('')
  const [sinResultados, setSinResultados] = useState(false)
  const campoRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    campoRef.current?.focus()
    campoRef.current?.select()
  }, [])

  // Al cerrar hay que descartar lo resaltado, o quedan los recuadros de la
  // ultima busqueda pintados sobre el texto.
  useEffect(() => () => buscador?.clearDecorations(), [buscador])

  const opciones = {
    decorations: {
      matchBackground: '#00000000',
      matchBorder: 'var(--acento)',
      matchOverviewRuler: 'var(--acento)',
      activeMatchBackground: 'var(--acento)',
      activeMatchBorder: 'var(--acento)',
      activeMatchColorOverviewRuler: 'var(--acento)',
    },
  }

  const buscar = (hacia: 1 | -1, termino = texto) => {
    if (!buscador || !termino) {
      setSinResultados(false)
      return
    }
    const encontrado =
      hacia === 1
        ? buscador.findNext(termino, opciones)
        : buscador.findPrevious(termino, opciones)
    setSinResultados(!encontrado)
  }

  return (
    <div className="busqueda" role="search">
      <input
        ref={campoRef}
        className={sinResultados ? 'sin-resultados' : undefined}
        value={texto}
        placeholder="Buscar"
        aria-label="Buscar en la terminal"
        onChange={(e) => {
          setTexto(e.target.value)
          buscar(1, e.target.value)
        }}
        onKeyDown={(e) => {
          // La barra se come sus teclas: si no, el atajo global las procesa y
          // Escape terminaria cerrando el panel de ajustes en vez de esto.
          e.stopPropagation()
          if (e.key === 'Enter') buscar(e.shiftKey ? -1 : 1)
          if (e.key === 'Escape') onCerrar()
        }}
      />
      <button onClick={() => buscar(-1)} title="Anterior — Shift+Enter" aria-label="Anterior">
        ↑
      </button>
      <button onClick={() => buscar(1)} title="Siguiente — Enter" aria-label="Siguiente">
        ↓
      </button>
      <button
        onClick={onCerrar}
        title={`Cerrar — Esc (abrir: ${atajo('terminal.buscar')})`}
        aria-label="Cerrar la búsqueda"
      >
        ✕
      </button>
    </div>
  )
}
