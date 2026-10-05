import { afterEach, describe, expect, it, vi } from 'vitest'
import { closePty, resizePty, spawnPty, writePty } from './ptyBridge'

const mock = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({
  invoke: mock.invoke,
  Channel: class {
    onmessage?: (value: unknown) => void
  },
}))

const opened = new Set<string>()
const options = { cols: 80, rows: 24 }

afterEach(async () => {
  mock.invoke.mockResolvedValue(undefined)
  await Promise.all([...opened].map(closePty))
  opened.clear()
  mock.invoke.mockReset()
})

describe('PTY bridge lifecycle', () => {
  it('acknowledges each chunk once, only after the parser callback', async () => {
    mock.invoke.mockResolvedValue('ack-test')
    opened.add('ack-test')
    const data = vi.fn()
    await spawnPty('ack-test', options, data, vi.fn())
    const parameters = mock.invoke.mock.calls[0][1]
    parameters.onData.onmessage(new Uint8Array([0xc3]).buffer)
    parameters.onData.onmessage(new Uint8Array([0xa9]).buffer)
    expect(mock.invoke.mock.calls.filter(([command]) => command === 'pty_ack')).toHaveLength(0)
    expect(data.mock.calls.map(([bytes]) => [...bytes])).toEqual([[0xc3], [0xa9]])
    data.mock.calls[0][1]()
    data.mock.calls[0][1]()
    data.mock.calls[1][1]()
    await Promise.resolve()
    const acknowledgements = mock.invoke.mock.calls.filter(([command]) => command === 'pty_ack')
    expect(acknowledgements).toEqual([['pty_ack', {
      id: 'ack-test', token: parameters.flowToken, bytes: 2,
    }]])
  })

  it('holds DSR input and resize requests until spawn has completed', async () => {
    let complete!: (id: string) => void
    mock.invoke.mockImplementation((command: string) => command === 'pty_spawn'
      ? new Promise<string>((resolve) => { complete = resolve }) : Promise.resolve())
    opened.add('starting')
    const spawning = spawnPty('starting', options, vi.fn(), vi.fn())
    const input = writePty('starting', '\x1b[1;1R')
    const resize = resizePty('starting', 100, 30)
    await Promise.resolve()
    expect(mock.invoke).toHaveBeenCalledTimes(1)
    complete('starting')
    await Promise.all([spawning, input, resize])
    expect(mock.invoke).toHaveBeenCalledWith('pty_write', { id: 'starting', data: '\x1b[1;1R' })
    expect(mock.invoke).toHaveBeenCalledWith('pty_resize', { id: 'starting', cols: 100, rows: 30 })
  })

  it('does not delay close behind startup and ignores late channel callbacks', async () => {
    let complete!: (id: string) => void
    mock.invoke.mockImplementation((command: string) => command === 'pty_spawn'
      ? new Promise<string>((resolve) => { complete = resolve }) : Promise.resolve())
    opened.add('cancelled')
    const data = vi.fn()
    const spawning = spawnPty('cancelled', options, data, vi.fn())
    const channels = mock.invoke.mock.calls[0][1]
    const queued = writePty('cancelled', 'discarded').catch((error: Error) => error.message)
    await closePty('cancelled')
    channels.onData.onmessage(new Uint8Array([1, 2]).buffer)
    expect(data).not.toHaveBeenCalled()
    complete('cancelled')
    await spawning
    expect(await queued).toBe('PTY session is closed')
    expect(mock.invoke.mock.calls.some(([command]) => command === 'pty_write')).toBe(false)
  })

  it('cleans up a failed spawn and permits a fresh retry', async () => {
    opened.add('retry')
    mock.invoke.mockRejectedValueOnce(new Error('spawn failed')).mockResolvedValue('retry')
    await expect(spawnPty('retry', options, vi.fn(), vi.fn())).rejects.toThrow('spawn failed')
    await expect(spawnPty('retry', options, vi.fn(), vi.fn())).resolves.toBe('retry')
  })

  it('drops obsolete parser callbacks and releases input on natural exit', async () => {
    mock.invoke.mockResolvedValue('exit')
    opened.add('exit')
    const data = vi.fn()
    const exit = vi.fn()
    await spawnPty('exit', options, data, exit)
    const channels = mock.invoke.mock.calls[0][1]
    channels.onData.onmessage(new Uint8Array([1]).buffer)
    // Simulate explicit cancellation before xterm finishes parsing.
    await closePty('exit')
    data.mock.calls[0][1]()
    await Promise.resolve()
    expect(mock.invoke.mock.calls.some(([command]) => command === 'pty_ack')).toBe(false)
    await spawnPty('exit', options, vi.fn(), exit)
    const fresh = mock.invoke.mock.calls.findLast(([command]) => command === 'pty_spawn')![1]
    channels.onExit.onmessage({ code: 9 })
    expect(exit).not.toHaveBeenCalled()
    fresh.onExit.onmessage({ code: 0 })
    expect(exit).toHaveBeenCalledExactlyOnceWith({ code: 0 })
    await expect(writePty('exit', 'late')).rejects.toThrow('session is closed')
  })
})
