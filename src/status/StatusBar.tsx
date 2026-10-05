import { useEffect, useRef, useState, Fragment } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { WIDGETS, type Stats } from './widgets'
import { usePluginWidgets } from './usePlugins'
import { useEnFoco } from './useEnFoco'

interface Props {
  shell: string
  cwd: string | null
  paneles: number
}

// The clock can repaint independently of the more expensive system queries.
const PASO = Math.min(...WIDGETS.map((w) => w.intervalo ?? Infinity))
const STATS_INTERVAL_MS = 2000

export function StatusBar({ shell, cwd, paneles }: Props) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [, setTick] = useState(0)
  const enFoco = useEnFoco()
  const primera = useRef(true)
  const statsPending = useRef(false)

  useEffect(() => {
    // Con la ventana atras no hay a quien mostrarle esto. Al volver el foco el
    // efecto se vuelve a montar y refresca en el acto.
    if (!enFoco) return

    let vivo = true

    const refrescar = async () => {
      if (statsPending.current) {
        id = window.setTimeout(() => void refrescar(), STATS_INTERVAL_MS)
        return
      }
      statsPending.current = true
      await invoke<Stats>('system_stats')
        .then((datos) => {
          if (vivo) setStats(datos)
        })
        .catch(() => {
          // Si el backend no responde, los widgets que dependen de esto se
          // esconden solos; no hay nada que avisar.
        })
      statsPending.current = false
      if (vivo) id = window.setTimeout(() => void refrescar(), STATS_INTERVAL_MS)
    }

    // Let the shell start first; refresh immediately when returning to focus.
    let id = 0
    const arranque = window.setTimeout(
      () => {
        void refrescar()
      },
      primera.current ? STATS_INTERVAL_MS : 0,
    )
    primera.current = false

    return () => {
      vivo = false
      window.clearTimeout(arranque)
      window.clearTimeout(id)
    }
  }, [enFoco])

  useEffect(() => {
    if (!enFoco) return
    const id = window.setInterval(() => setTick((tick) => tick + 1), PASO)
    return () => window.clearInterval(id)
  }, [enFoco])

  const contexto = { shell, cwd, paneles, stats }
  const dePlugins = usePluginWidgets(cwd)

  // Los de plugins van antes de la hora, que queda siempre a la derecha.
  const visibles = [
    ...WIDGETS.map((widget) => ({
      id: widget.id,
      contenido: widget.render(contexto),
    })),
    ...dePlugins.map((salida) => ({ id: salida.id, contenido: salida.texto })),
  ].filter((w) => w.contenido !== null && w.contenido !== undefined && w.contenido !== '')

  return (
    <footer className="barra-estado">
      {visibles.map((widget, indice) => (
        <Fragment key={widget.id}>
          {indice > 0 && <span className="separador-estado" aria-hidden="true" />}
          <span className={`widget widget-${widget.id}`}>{widget.contenido}</span>
        </Fragment>
      ))}
    </footer>
  )
}
