import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { olvidarPlugin, registrarPlugin } from './host'
import type { Permiso, Plugin } from './tipos'

import { SANDBOX_BRIDGE } from './sandboxBridge'

/// Envuelve el codigo del plugin en un documento con su propia CSP.
///
/// `connect-src 'none'` es lo que le saca la red: sin eso, un plugin podria
/// mandar a donde quiera lo que acaba de leer de la terminal, y el permiso
/// `terminal.read` dejaria de significar "leer" para significar "exfiltrar".
/// `default-src 'none'` corta todo lo demas ---imagenes remotas, fuentes,
/// frames--- por la misma razon: cualquier recurso externo es un canal de salida.
function documento(codigo: string): string {
  const csp = [
    "default-src 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
    'img-src data:',
    "connect-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
  ].join('; ')

  return `<!doctype html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>
  :root { color-scheme: dark }
  body {
    margin: 0; padding: 10px;
    font: 12px/1.5 monospace;
    color: #d8dee9; background: transparent;
  }
</style>
</head><body>
<script>${SANDBOX_BRIDGE}</script>
<script type="module">
${codigo}
</script>
</body></html>`
}

interface Props {
  plugin: Plugin
  /// Los que el usuario aprobo, que no son necesariamente los que el manifiesto
  /// declara.
  concedidos: Permiso[]
  confianza: boolean
  onComando?: (comandoId: string) => void
  onCerrar: () => void
}

export function PanelPlugin({ plugin, concedidos, confianza, onComando, onCerrar }: Props) {
  const marcoRef = useRef<HTMLIFrameElement>(null)
  const [codigo, setCodigo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // El codigo lo lee Rust: el webview no tiene acceso al sistema de archivos, y
  // darselo solo para esto abriria un agujero mucho mayor que el que cierra.
  useEffect(() => {
    let vigente = true
    invoke<string>('plugin_entry', { id: plugin.id })
      .then((fuente) => {
        if (vigente) setCodigo(fuente)
      })
      .catch((err) => {
        if (vigente) setError(String(err))
      })
    return () => {
      vigente = false
    }
  }, [plugin.id])

  // El alta va contra la `contentWindow` del iframe, que es como el broker
  // identifica quien manda cada mensaje.
  useEffect(() => {
    const ventana = marcoRef.current?.contentWindow
    if (!ventana || !codigo) return

    registrarPlugin({
      id: plugin.id,
      ventana,
      permisos: concedidos,
      confianza,
      onComando,
    })
    return () => olvidarPlugin(ventana)
  }, [codigo, plugin.id, concedidos, confianza, onComando])

  return (
    <aside className="panel-plugin">
      <header>
        <span>{plugin.name}</span>
        <button type="button" onClick={onCerrar} title="Close panel">
          ✕
        </button>
      </header>

      {error && <p className="error-plugin">Could not load plugin: {error}</p>}

      {codigo && (
        <iframe
          ref={marcoRef}
          title={plugin.name}
          // Sin `allow-same-origin` a proposito: con el, el iframe compartiria
          // origen con la aplicacion y podria alcanzar su `window`, su storage y
          // la API de Tauri. Todo el aislamiento depende de que no este.
          sandbox="allow-scripts"
          srcDoc={documento(codigo)}
        />
      )}
    </aside>
  )
}
