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

// El intervalo mas corto que pide algun widget. Un solo temporizador para todos
// en vez de uno por widget: son cuatro textos, no hace falta mas.
const PASO = Math.min(...WIDGETS.map((w) => w.intervalo ?? Infinity))

export function StatusBar({ shell, cwd, paneles }: Props) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [, setTick] = useState(0)
  const enFoco = useEnFoco()
  const primera = useRef(true)

  useEffect(() => {
    // Con la ventana atras no hay a quien mostrarle esto. Al volver el foco el
    // efecto se vuelve a montar y refresca en el acto.
    if (!enFoco) return

    let vivo = true

    const refrescar = () => {
      invoke<Stats>('system_stats')
        .then((datos) => {
          if (vivo) setStats(datos)
        })
        .catch(() => {
          // Si el backend no responde, los widgets que dependen de esto se
          // esconden solos; no hay nada que avisar.
        })
      if (vivo) setTick((t) => t + 1)
    }

    // Al arrancar la primera lectura espera un paso completo, porque
    // `system_stats` refresca todo sysinfo y compite con el spawn del PTY: el
    // prompt primero. Al recuperar el foco, en cambio, se lee ya, o la barra
    // muestra numeros viejos hasta el siguiente tick.
    let id = 0
    const arranque = window.setTimeout(
      () => {
        refrescar()
        id = window.setInterval(refrescar, PASO)
      },
      primera.current ? PASO : 0,
    )
    primera.current = false

    return () => {
      vivo = false
      window.clearTimeout(arranque)
      window.clearInterval(id)
    }
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
