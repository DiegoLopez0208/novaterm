import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useEnFoco } from './useEnFoco'

export interface WidgetPlugin {
  id: string
  command: string
  args: string[]
  intervalo_ms: number
  prefijo: string
  usar_cwd: boolean
}

export interface Plugin {
  id: string
  name: string
  version: string
  description: string
  widgets: WidgetPlugin[]
}

export interface SalidaWidget {
  id: string
  texto: string
}

/// Ejecuta los widgets que aportan los plugins y devuelve su salida.
///
/// Cada widget lleva su propio intervalo porque no todos cuestan lo mismo: la
/// rama de git se puede mirar seguido, y un comando que consulta la red no.
export function usePluginWidgets(cwd: string | null): SalidaWidget[] {
  const enFoco = useEnFoco()
  const [widgets, setWidgets] = useState<WidgetPlugin[]>([])
  const [salidas, setSalidas] = useState<Record<string, string>>({})
  // El cwd cambia mientras los temporizadores ya estan andando; en un ref se
  // lee siempre el ultimo sin tener que rearmarlos.
  const cwdRef = useRef(cwd)
  cwdRef.current = cwd

  useEffect(() => {
    invoke<Plugin[]>('plugins_list')
      .then((plugins) => setWidgets(plugins.flatMap((p) => p.widgets)))
      .catch(() => setWidgets([]))
  }, [])

  useEffect(() => {
    // Cada tick lanza un proceso externo: con la ventana atras no se corre.
    if (widgets.length === 0 || !enFoco) return

    const correr = (widget: WidgetPlugin) => {
      invoke<string>('plugin_widget_run', { widget, cwd: cwdRef.current })
        .then((texto) => setSalidas((previas) => ({ ...previas, [widget.id]: texto })))
        .catch(() => {
          // Un widget que falla (no esta git, o el directorio no es un repo) se
          // esconde en vez de mostrar el error en la barra.
          setSalidas((previas) => ({ ...previas, [widget.id]: '' }))
        })
    }

    // Cada corrida lanza un proceso externo. La primera se demora un segundo
    // para no pelear con el spawn del shell en el arranque.
    const temporizadores: number[] = []
    const arranque = window.setTimeout(() => {
      for (const widget of widgets) {
        correr(widget)
        temporizadores.push(
          window.setInterval(() => correr(widget), Math.max(1000, widget.intervalo_ms)),
        )
      }
    }, 1000)

    return () => {
      window.clearTimeout(arranque)
      temporizadores.forEach((id) => window.clearInterval(id))
    }
  }, [widgets, enFoco])

  return widgets
    .map((widget) => ({ id: widget.id, texto: salidas[widget.id] ?? '' }))
    .filter((salida) => salida.texto !== '')
}
