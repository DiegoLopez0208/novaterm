import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { SANDBOX_BRIDGE } from './sandboxBridge'

function host() {
  const requests: { id: number; metodo: string; datos: unknown }[] = []
  const timers = new Map<number, () => void>()
  let nextTimer = 1
  let receive: (event: unknown) => void = () => {}
  const parent = { postMessage: (message: typeof requests[number]) => requests.push(message) }
  const scope = {
    parent,
    addEventListener: (_: string, handler: typeof receive) => { receive = handler },
    setTimeout: (handler: () => void) => {
      const id = nextTimer++
      timers.set(id, () => { timers.delete(id); handler() })
      return id
    },
    clearTimeout: (id: number) => timers.delete(id),
    nova: undefined as unknown as {
      apiVersion: number
      terminal: { read: (lines?: number) => Promise<string>; leer: (lines?: number) => Promise<string> }
      ai: { complete: (messages: unknown[]) => Promise<unknown> }
      ia: { preguntar: (messages: unknown[]) => Promise<unknown> }
    },
  }
  runInNewContext(SANDBOX_BRIDGE, scope)
  const reply = (data: unknown, source: unknown = parent) => receive({ source, data })
  return { api: scope.nova, requests, timers, reply }
}

describe('sandbox API compatibility and lifetime', () => {
  it('keeps the legacy wire protocol, rejects other sources and clears settled timers', async () => {
    const h = host()
    expect(h.api.apiVersion).toBe(1)
    const read = h.api.terminal.read(42)
    expect(h.requests[0]).toMatchObject({ metodo: 'terminal.read', datos: { lines: 42 } })
    h.reply({ nova: 1, id: 1, ok: true, datos: { text: 'spoofed' } }, {})
    expect(h.timers.size).toBe(1)
    h.reply({ nova: 1, id: 1, ok: true, datos: { text: 'real' } })
    expect(await read).toBe('real')
    expect(h.timers.size).toBe(0)
    const legacy = h.api.terminal.leer()
    h.reply({ nova: 1, id: 2, ok: true, datos: { text: 'legacy' } })
    expect(await legacy).toBe('legacy')
  })

  it('maps English AI results without changing legacy results', async () => {
    const h = host()
    const english = h.api.ai.complete([])
    const legacy = h.api.ia.preguntar([])
    const result = { text: 'explanation', tokens: 5, restante: 95 }
    h.reply({ nova: 1, id: 1, ok: true, datos: result })
    h.reply({ nova: 1, id: 2, ok: true, datos: result })
    expect(await english).toEqual({ text: 'explanation', tokens: 5, remaining: 95 })
    expect(await legacy).toEqual(result)
    expect(h.timers.size).toBe(0)
  })

  it('bounds unanswered requests, recovers a timed-out slot and propagates permission failures', async () => {
    const h = host()
    const pending = Array.from({ length: 128 }, () => h.api.terminal.read().catch((error: Error) => error.message))
    await expect(h.api.terminal.read()).rejects.toThrow('Too many pending')
    h.timers.get(1)!()
    expect(await pending[0]).toContain('no response')
    const next = h.api.terminal.read()
    h.reply({ nova: 1, id: 129, ok: false, error: 'permission denied' })
    await expect(next).rejects.toThrow('permission denied')
    for (let id = 2; id <= 128; id++) h.reply({ nova: 1, id, ok: false, error: 'closed' })
    await Promise.all(pending)
    expect(h.timers.size).toBe(0)
  })
})
