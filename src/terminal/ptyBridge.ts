import { Channel, invoke } from '@tauri-apps/api/core'

export type PtyId = string

export interface SpawnOptions {
  shell?: string
  args?: string[]
  cwd?: string
  cols: number
  rows: number
}

export interface PtyExit {
  code: number | null
}

/// El id se genera aca, no en el backend.
///
/// El frontend lo necesita para poder cerrar la sesion antes de que el spawn
/// conteste: si el panel se desmonta mientras el comando esta en vuelo, sin id
/// no habria a quien cerrarle.
export function nuevoPtyId(): PtyId {
  return crypto.randomUUID()
}

/// Los canales se crean antes del `invoke` y viajan con el, asi que ya estan
/// escuchando cuando el backend abre el PTY. Antes esto eran dos `listen` sobre
/// eventos `pty://{id}/...` que se suscribian aparte: el shell escribe apenas
/// existe el PTY, y entre el spawn y la suscripcion se perdia el prompt.
///
/// Los datos llegan como ArrayBuffer. El backend manda bytes crudos porque un
/// caracter UTF-8 puede quedar partido entre dos lecturas del PTY; el decode
/// incremental lo hace xterm.
export function spawnPty(
  id: PtyId,
  options: SpawnOptions,
  onData: (bytes: Uint8Array) => void,
  onExit: (exit: PtyExit) => void,
): Promise<PtyId> {
  const canalDatos = new Channel<ArrayBuffer>()
  canalDatos.onmessage = (buffer) => onData(new Uint8Array(buffer))

  const canalSalida = new Channel<PtyExit>()
  canalSalida.onmessage = onExit

  return invoke<PtyId>('pty_spawn', {
    id,
    options,
    onData: canalDatos,
    onExit: canalSalida,
  })
}

export function writePty(id: PtyId, data: string): Promise<void> {
  return invoke('pty_write', { id, data })
}

export function resizePty(id: PtyId, cols: number, rows: number): Promise<void> {
  return invoke('pty_resize', { id, cols, rows })
}

export function closePty(id: PtyId): Promise<void> {
  return invoke('pty_close', { id })
}
