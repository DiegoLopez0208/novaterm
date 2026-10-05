import { Channel, invoke } from '@tauri-apps/api/core'
import { createAckBatcher, createInputWriter, createResizeWriter } from './flowControl'

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

interface SessionControl {
  input: ReturnType<typeof createInputWriter>
  resize: ReturnType<typeof createResizeWriter<{ cols: number; rows: number }>>
  acknowledgements: ReturnType<typeof createAckBatcher>
}
const sessions = new Map<PtyId, SessionControl>()

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
  onData: (bytes: Uint8Array, parsed: () => void) => void,
  onExit: (exit: PtyExit) => void,
): Promise<PtyId> {
  if (sessions.has(id)) return Promise.reject(new Error('PTY session already exists'))
  const flowToken = crypto.randomUUID()
  let ready!: () => void
  let failed!: (reason: unknown) => void
  const spawned = new Promise<void>((resolve, reject) => { ready = resolve; failed = reject })
  const control: SessionControl = {
    input: createInputWriter(spawned, (data) => invoke('pty_write', { id, data })),
    resize: createResizeWriter(spawned, (size) => invoke('pty_resize', { id, ...size })),
    acknowledgements: createAckBatcher(
      (bytes) => invoke('pty_ack', { id, token: flowToken, bytes }),
      () => { if (sessions.get(id) === control) void closePty(id).catch(() => {}) },
    ),
  }
  sessions.set(id, control)
  const canalDatos = new Channel<ArrayBuffer>()
  canalDatos.onmessage = (buffer) => {
    if (sessions.get(id) !== control) return
    let parsed = false
    onData(new Uint8Array(buffer), () => {
      if (parsed) return
      parsed = true
      control.acknowledgements.parsed(buffer.byteLength)
    })
  }

  const canalSalida = new Channel<PtyExit>()
  canalSalida.onmessage = (exit) => {
    if (sessions.get(id) !== control) return
    control.input.dispose()
    control.resize.dispose()
    control.acknowledgements.dispose()
    sessions.delete(id)
    onExit(exit)
  }

  const invocation = invoke<PtyId>('pty_spawn', {
    id,
    flowToken,
    options,
    onData: canalDatos,
    onExit: canalSalida,
  })
  void invocation.then(ready, (error) => {
    failed(error)
    control.input.dispose()
    control.resize.dispose()
    control.acknowledgements.dispose()
    if (sessions.get(id) === control) sessions.delete(id)
  })
  return invocation
}

export function writePty(id: PtyId, data: string): Promise<void> {
  return sessions.get(id)?.input.write(data) ?? Promise.reject(new Error('PTY session is closed'))
}

export function resizePty(id: PtyId, cols: number, rows: number): Promise<void> {
  return sessions.get(id)?.resize.resize({ cols, rows }) ?? Promise.reject(new Error('PTY session is closed'))
}

export function closePty(id: PtyId): Promise<void> {
  const control = sessions.get(id)
  control?.input.dispose()
  control?.resize.dispose()
  control?.acknowledgements.dispose()
  sessions.delete(id)
  return invoke('pty_close', { id })
}
