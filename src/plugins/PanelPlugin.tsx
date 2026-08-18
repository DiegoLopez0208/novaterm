import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { olvidarPlugin, registrarPlugin } from './host'
import type { Permiso, Plugin } from './tipos'

/// La API que ve el plugin dentro del iframe.
///
/// Es una capa fina sobre `postMessage`: no decide nada, solo empareja pedidos
/// con respuestas para que el plugin pueda usar `await`. Todo lo que importa lo
/// decide el broker del otro lado.
const PUENTE = `
(() => {
  let siguiente = 1
  const pendientes = new Map()

  addEventListener('message', (e) => {
    const r = e.data
    if (!r || r.nova !== 1 || typeof r.id !== 'number') return
    const p = pendientes.get(r.id)
    if (!p) return
    pendientes.delete(r.id)
    r.ok ? p.resolver(r.datos) : p.rechazar(new Error(r.error || 'rechazado'))
  })

  function pedir(metodo, datos) {
    const id = siguiente++
    return new Promise((resolver, rechazar) => {
      pendientes.set(id, { resolver, rechazar })
      parent.postMessage({ nova: 1, id, metodo, datos }, '*')
      // Sin esto, un metodo que el broker no conteste deja la promesa colgada
      // para siempre y el plugin parece trabado sin decir por que.
      setTimeout(() => {
        if (pendientes.delete(id)) rechazar(new Error(metodo + ': sin respuesta'))
      }, 130000)
    })
  }

  globalThis.nova = {
    terminal: {
      leer: (lines = 200) => pedir('terminal.read', { lines }).then((r) => r.text),
      escribir: (data) => pedir('terminal.write', { data }),
    },
    ia: {
      preguntar: (messages, opciones = {}) =>
        pedir('llm.complete', { messages, ...opciones }),
    },
    comandos: {
      disparar: (id) => pedir('commands.trigger', { id }),
    },
  }
})()
`

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
<script>${PUENTE}</script>
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
        <button type="button" onClick={onCerrar} title="Cerrar el panel">
          ✕
        </button>
      </header>

      {error && <p className="error-plugin">No se pudo cargar el plugin: {error}</p>}

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
