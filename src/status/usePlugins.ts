import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { Plugin, WidgetPlugin } from '../plugins/tipos'
import { PLUGINS_CHANGED } from '../plugins/events'
import { createPoller } from './poller'
import { useEnFoco } from './useEnFoco'

interface InstalledWidget {
  id: string
  widget: WidgetPlugin
}

interface WidgetRequest {
  widget: WidgetPlugin
  cwd: string | null
}

export interface SalidaWidget {
  id: string
  texto: string
}

/** Poll installed widgets only while focused, with bounded concurrent work. */
export function usePluginWidgets(cwd: string | null): SalidaWidget[] {
  const focused = useEnFoco()
  const [widgets, setWidgets] = useState<InstalledWidget[]>([])
  const [outputs, setOutputs] = useState<Record<string, string>>({})
  const pollerRef = useRef<ReturnType<typeof createPoller<WidgetRequest>> | null>(null)

  useEffect(() => {
    let alive = true
    let generation = 0
    const reload = () => {
      const request = ++generation
      void invoke<Plugin[]>('plugins_list')
        .then((plugins) => {
          if (!alive || request !== generation) return
          setWidgets(plugins.flatMap((plugin) => plugin.widgets.map((widget) => ({
            id: JSON.stringify([plugin.id, widget.id]),
            widget,
          }))))
          setOutputs({})
        })
        .catch(() => {
          if (alive && request === generation) setWidgets([])
        })
    }
    reload()
    window.addEventListener(PLUGINS_CHANGED, reload)
    return () => {
      alive = false
      window.removeEventListener(PLUGINS_CHANGED, reload)
    }
  }, [])

  useEffect(() => {
    const poller = createPoller<WidgetRequest>(
      ({ widget, cwd: directory }) => invoke<string>('plugin_widget_run', { widget, cwd: directory }),
      (id, text) => setOutputs((previous) =>
        previous[id] === text ? previous : { ...previous, [id]: text }),
    )
    pollerRef.current = poller
    return () => {
      poller.dispose()
      pollerRef.current = null
    }
  }, [])

  useEffect(() => {
    pollerRef.current?.setJobs(focused ? widgets.map(({ id, widget }) => ({
      id,
      intervalMs: widget.intervalo_ms,
      value: { widget, cwd },
    })) : [])
    return () => pollerRef.current?.setJobs([])
  }, [widgets, focused, cwd])

  return widgets
    .map(({ id }) => ({ id, texto: outputs[id] ?? '' }))
    .filter((output) => output.texto !== '')
}
