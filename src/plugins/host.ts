import { invoke } from '@tauri-apps/api/core'
import { leerPantalla, terminalActiva } from '../terminal/registro'
import { writePty } from '../terminal/ptyBridge'
import { esPedidoRpc, type Permiso, type RespuestaRpc } from './tipos'

/// El broker entre el codigo del plugin y la aplicacion.
///
/// El plugin corre en un iframe con `sandbox="allow-scripts"` y **sin**
/// `allow-same-origin`: origen nulo, sin API de Tauri, sin storage, sin cookies
/// y sin poder tocar `window.parent`. Lo unico que puede hacer es un
/// `postMessage`, y todo lo que llegue por ahi pasa por aca.
///
/// Este archivo es la frontera. Cada pedido se valida contra los permisos que el
/// usuario aprobo, no contra los que el manifiesto declara: instalar no es
/// aprobar. Un plugin sin el permiso recibe un rechazo, y el rechazo queda en la
/// consola con el id del plugin.

const MAX_LINEAS = 2000
/// Cuantos pedidos por segundo tolera un plugin. Un bucle dentro del iframe no
/// puede convertirse en un bucle de escrituras al PTY ni en una rafaga de
/// llamadas al modelo.
const MAX_POR_SEGUNDO = 20

interface Registrado {
  id: string
  ventana: Window
  permisos: Permiso[]
  /// Con confianza no se pide confirmacion por cada escritura en la terminal.
  confianza: boolean
  onComando?: (comandoId: string) => void
}

const registrados = new Map<Window, Registrado>()
const ritmo = new Map<string, { ventana: number; cuenta: number }>()

/// Lo llama `PanelPlugin` cuando el iframe termino de cargar.
export function registrarPlugin(entrada: Registrado): void {
  registrados.set(entrada.ventana, entrada)
}

export function olvidarPlugin(ventana: Window): void {
  registrados.delete(ventana)
}

function dentroDelRitmo(id: string): boolean {
  const ahora = Date.now()
  const actual = ritmo.get(id)
  if (!actual || ahora - actual.ventana > 1000) {
    ritmo.set(id, { ventana: ahora, cuenta: 1 })
    return true
  }
  actual.cuenta += 1
  return actual.cuenta <= MAX_POR_SEGUNDO
}

/// Pregunta antes de dejar que un plugin escriba en la shell.
///
/// Es la unica capacidad que ejecuta algo en la maquina del usuario, asi que la
/// confirmacion es por escritura y muestra el texto exacto. `confirm` bloquea el
/// hilo de la interfaz, y aca eso es deseable: mientras el usuario decide no
/// queremos que sigan entrando pedidos del mismo plugin.
function autorizaEscritura(entrada: Registrado, datos: string): boolean {
  if (entrada.confianza) return true
  const muestra = datos.length > 200 ? `${datos.slice(0, 200)}...` : datos
  return window.confirm(
    `Plugin "${entrada.id}" wants to write this to your terminal:\n\n${muestra}\n\nAllow this write?`,
  )
}

async function atender(entrada: Registrado, metodo: string, datos: unknown): Promise<unknown> {
  const tiene = (permiso: Permiso) => entrada.permisos.includes(permiso)

  switch (metodo) {
    case 'terminal.read': {
      if (!tiene('terminal.read')) throw new Error('permission denied: terminal.read')
      const viva = terminalActiva()
      if (!viva) throw new Error('no terminal is open')
      const pedido = (datos ?? {}) as { lines?: number }
      const lineas = Math.min(Math.max(1, Math.floor(pedido.lines ?? 200)), MAX_LINEAS)
      return { text: leerPantalla(viva.term, lineas) }
    }

    case 'terminal.write': {
      if (!tiene('terminal.write')) throw new Error('permission denied: terminal.write')
      const viva = terminalActiva()
      if (!viva) throw new Error('no terminal is open')
      const pedido = (datos ?? {}) as { data?: unknown }
      if (typeof pedido.data !== 'string' || pedido.data.length === 0) {
        throw new Error('terminal.write requires text in "data"')
      }
      if (!autorizaEscritura(entrada, pedido.data)) {
        throw new Error('the user did not approve this write')
      }
      await writePty(viva.ptyId, pedido.data)
      return { ok: true }
    }

    case 'llm.complete': {
      if (!tiene('llm.complete')) throw new Error('permission denied: llm.complete')
      // El `plugin_id` lo pone el broker a partir de que iframe mando el
      // mensaje. Si lo eligiera el plugin, gastaria el presupuesto de otro.
      return await invoke('llm_complete', { pluginId: entrada.id, pedido: datos })
    }

    case 'commands.trigger': {
      if (!tiene('commands')) throw new Error('permission denied: commands')
      const pedido = (datos ?? {}) as { id?: unknown }
      if (typeof pedido.id !== 'string') throw new Error('commands.trigger requires an id')
      entrada.onComando?.(pedido.id)
      return { ok: true }
    }

    default:
      throw new Error(`unknown method: ${metodo}`)
  }
}

function responder(ventana: Window, respuesta: RespuestaRpc): void {
  // El destino va como "*" porque el iframe tiene origen nulo y no hay un origen
  // concreto al que apuntar. No filtra nada: el mensaje va a esa ventana y solo
  // a esa, y lo que lleva es lo que ese mismo plugin acaba de pedir.
  ventana.postMessage(respuesta, '*')
}

let instalado = false

/// Engancha el unico escucha de `message` de la aplicacion.
export function instalarBroker(): () => void {
  if (instalado) return () => {}
  instalado = true

  const alLlegar = async (evento: MessageEvent) => {
    // La identidad sale de la ventana que mando el mensaje, nunca del contenido:
    // el contenido lo escribe el plugin y podria decir ser cualquiera.
    const entrada = evento.source ? registrados.get(evento.source as Window) : undefined
    if (!entrada) return
    if (!esPedidoRpc(evento.data)) return

    const { id, metodo, datos } = evento.data

    if (!dentroDelRitmo(entrada.id)) {
      responder(entrada.ventana, {
        nova: 1,
        id,
        ok: false,
        error: 'too many requests per second',
      })
      return
    }

    try {
      const resultado = await atender(entrada, metodo, datos)
      responder(entrada.ventana, { nova: 1, id, ok: true, datos: resultado })
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      console.warn(`[plugin ${entrada.id}] ${metodo} rejected: ${error}`)
      responder(entrada.ventana, { nova: 1, id, ok: false, error })
    }
  }

  window.addEventListener('message', alLlegar)
  return () => {
    window.removeEventListener('message', alLlegar)
    instalado = false
  }
}
