import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getConfig,
  getConfigPath,
  onConfigChanged,
  onConfigError,
  saveConfig,
  type NovaConfig,
} from './configBridge'
import type { UnlistenFn } from '@tauri-apps/api/event'

export interface ConfigState {
  config: NovaConfig | null
  path: string
  // Mensaje del ultimo archivo invalido. La config anterior sigue aplicada: se
  // avisa del error pero no se rompe la terminal por una coma de mas.
  error: string | null
  update: (config: NovaConfig) => void
}

declare global {
  interface Window {
    /// La inyecta Rust antes de que cargue el documento (ver `lib.rs`).
    __NOVA_CONFIG__?: NovaConfig
  }
}

export function useConfig(): ConfigState {
  // Arranque sin round-trip: el backend ya leyo el config.toml antes de crear
  // la ventana, asi que la primera pintada no tiene por que esperar un
  // `invoke`. `getConfig()` sigue corriendo abajo para reconciliar.
  const [config, setConfig] = useState<NovaConfig | null>(
    () => window.__NOVA_CONFIG__ ?? null,
  )
  const [path, setPath] = useState('')
  const [error, setError] = useState<string | null>(null)
  // Momento del ultimo cambio hecho desde el panel. El backend reemite al
  // guardar, y sin esta guarda el eco volveria a montar el valor viejo justo
  // mientras arrastras un slider.
  const propioHasta = useRef(0)
  const pendiente = useRef<number | null>(null)

  useEffect(() => {
    let vivo = true
    const unlisteners: UnlistenFn[] = []

    getConfig().then((inicial) => {
      if (vivo) setConfig(inicial)
    })
    getConfigPath().then((ruta) => {
      if (vivo) setPath(ruta)
    })

    onConfigChanged((nueva) => {
      if (Date.now() < propioHasta.current) return
      setConfig(nueva)
      setError(null)
    }).then((un) => unlisteners.push(un))

    onConfigError(setError).then((un) => unlisteners.push(un))

    return () => {
      vivo = false
      unlisteners.forEach((un) => un())
    }
  }, [])

  // Aplica en pantalla al instante y persiste un toque despues: guardar en cada
  // pixel de un slider seria una escritura a disco por frame.
  const update = useCallback((nueva: NovaConfig) => {
    setConfig(nueva)
    propioHasta.current = Date.now() + 1500
    if (pendiente.current !== null) window.clearTimeout(pendiente.current)
    pendiente.current = window.setTimeout(() => {
      propioHasta.current = Date.now() + 1500
      void saveConfig(nueva).catch((err) => setError(String(err)))
    }, 250)
  }, [])

  return { config, path, error, update }
}
