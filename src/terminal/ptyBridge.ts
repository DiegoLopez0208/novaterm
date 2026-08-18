import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

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

interface DataPayload {
  data: string
}

/// El id se genera aca, no en el backend.
///
/// El shell empieza a escribir apenas se abre el PTY. Si el id llegara como
/// respuesta del spawn, entre esa respuesta y el `listen` habria una ventana en
/// la que el prompt ya se emitio y nadie lo escucha: la terminal queda en
/// blanco. Sabiendo el id de antemano, se escucha primero y despues se abre.
export function nuevoPtyId(): PtyId {
  return crypto.randomUUID()
}

export function spawnPty(id: PtyId, options: SpawnOptions): Promise<PtyId> {
  return invoke<PtyId>('pty_spawn', { id, options })
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

// El backend manda base64 porque el PTY escupe bytes crudos: un caracter UTF-8
// puede quedar partido entre dos lecturas y decodificarlo aca lo romperia.
// xterm.js acepta Uint8Array y hace el decode incremental el mismo.
function decodeBase64(input: string): Uint8Array {
  const binary = atob(input)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export function onPtyData(
  id: PtyId,
  handler: (bytes: Uint8Array) => void,
): Promise<UnlistenFn> {
  return listen<DataPayload>(`pty://${id}/data`, (event) => {
    handler(decodeBase64(event.payload.data))
  })
}

export function onPtyExit(
  id: PtyId,
  handler: (exit: PtyExit) => void,
): Promise<UnlistenFn> {
  return listen<PtyExit>(`pty://${id}/exit`, (event) => handler(event.payload))
}
