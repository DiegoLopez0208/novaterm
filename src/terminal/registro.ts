import type { Terminal } from '@xterm/xterm'
import type { PtyId } from './ptyBridge'

/// Las terminales vivas, por panel.
///
/// Hasta ahora no habia forma de llegar al `TerminalView` activo desde arriba:
/// esta cuatro niveles mas abajo y el arbol de paneles se arma solo. Lo unico
/// que existia era el `CustomEvent` de la busqueda, que sirve para gritarle
/// "abrite" a quien este escuchando pero no para pedirle datos.
///
/// El broker de plugins si necesita pedirle datos ---leer el scrollback,
/// escribir en la sesion--- asi que cada panel se anota al montarse y se borra
/// en su limpieza.
interface Viva {
  term: Terminal
  ptyId: PtyId
}

const vivas = new Map<string, Viva>()
declare global {
  interface Window {
    /** Opt-in local diagnostics, enabled only by the native benchmark harness. */
    __NOVATERM_DIAGNOSTICS__?: boolean
  }
}
/// Cual es el panel que tiene el foco. Un plugin siempre habla con este.
let activo: string | null = null

export function registrar(panelId: string, viva: Viva): void {
  vivas.set(panelId, viva)
  if (window.__NOVATERM_DIAGNOSTICS__) {
    window.dispatchEvent(new CustomEvent('novaterm:terminal-ready', { detail: { panelId, ...viva } }))
  }
}

export function olvidar(panelId: string): void {
  vivas.delete(panelId)
  if (window.__NOVATERM_DIAGNOSTICS__) {
    window.dispatchEvent(new CustomEvent('novaterm:terminal-closed', { detail: { panelId } }))
  }
  if (activo === panelId) activo = null
}

export function marcarActivo(panelId: string): void {
  activo = panelId
}

export function terminalActiva(): Viva | null {
  if (activo) {
    const viva = vivas.get(activo)
    if (viva) return viva
  }
  // Si el panel activo se cerro y todavia no hubo otro foco, sirve cualquiera
  // que siga viva: es preferible a que un plugin falle porque el usuario cerro
  // un panel justo antes.
  const primera = vivas.values().next()
  return primera.done ? null : primera.value
}

/// Las ultimas `lineas` del buffer, sin secuencias de escape.
///
/// Se arma desde el buffer de xterm y no desde lo que llego del PTY: xterm ya
/// resolvio los saltos, los borrados y el reposicionamiento del cursor, asi que
/// esto es lo que el usuario realmente esta viendo. Reconstruirlo desde los
/// bytes crudos daria un texto que no coincide con la pantalla.
export function leerPantalla(term: Terminal, lineas: number): string {
  const buffer = term.buffer.active
  const hasta = buffer.baseY + buffer.cursorY
  const desde = Math.max(0, hasta - lineas + 1)

  const filas: string[] = []
  for (let y = desde; y <= hasta; y++) {
    filas.push(buffer.getLine(y)?.translateToString(true) ?? '')
  }

  // Las filas vacias del final son el espacio debajo del prompt: no aportan
  // nada y gastan tokens.
  while (filas.length > 0 && filas[filas.length - 1].trim() === '') filas.pop()
  return filas.join('\n')
}
