import { describe, expect, it, vi } from 'vitest'
import { createAckBatcher, createInputWriter, createResizeWriter } from './flowControl'

function pending() {
  let resolve!: () => void
  let reject!: (reason: Error) => void
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

describe('PTY transport', () => {
  it('batches parsed bytes and ignores callbacks after disposal', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const batcher = createAckBatcher(send, vi.fn())
    batcher.parsed(1)
    batcher.parsed(3)
    expect(send).not.toHaveBeenCalled()
    await Promise.resolve()
    expect(send).toHaveBeenCalledExactlyOnceWith(4)
    batcher.parsed(2)
    batcher.dispose()
    await Promise.resolve()
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('notifies once if acknowledgement delivery fails', async () => {
    const send = vi.fn().mockRejectedValue(new Error('disconnected'))
    const error = vi.fn()
    const batcher = createAckBatcher(send, error)
    batcher.parsed(10)
    await vi.waitFor(() => expect(error).toHaveBeenCalledTimes(1))
    batcher.parsed(20)
    await Promise.resolve()
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('holds startup input and serializes writes after the session is ready', async () => {
    const ready = pending()
    const first = pending()
    const send = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(undefined)
    const writer = createInputWriter(ready.promise, send)
    const a = writer.write('a')
    const b = writer.write('b')
    await Promise.resolve()
    expect(send).not.toHaveBeenCalled()
    ready.resolve()
    await vi.waitFor(() => expect(send).toHaveBeenCalledExactlyOnceWith('a'))
    first.resolve()
    await Promise.all([a, b])
    expect(send.mock.calls).toEqual([['a'], ['b']])
  })

  it('cancels queued input on close without blocking an independent session', async () => {
    const blocked = pending()
    const send = vi.fn().mockReturnValue(blocked.promise)
    const writer = createInputWriter(Promise.resolve(), send)
    const first = writer.write('blocked')
    const queued = writer.write('discarded').catch((error: Error) => error.message)
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    writer.dispose()
    const independent = createInputWriter(Promise.resolve(), vi.fn().mockResolvedValue(undefined))
    await independent.write('still responsive')
    blocked.resolve()
    await first
    expect(await queued).toBe('PTY session is closed')
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('bounds queued paste size and rejects input after a failed spawn', async () => {
    const ready = pending()
    const send = vi.fn()
    const writer = createInputWriter(ready.promise, send)
    await expect(writer.write('x'.repeat(1048577))).rejects.toThrow('input queue is full')
    const waiting = writer.write('hello').catch((error: Error) => error.message)
    ready.reject(new Error('spawn failed'))
    expect(await waiting).toBe('spawn failed')
    expect(send).not.toHaveBeenCalled()
  })

  it('recovers queue capacity after failed writes', async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error('write failed')).mockResolvedValue(undefined)
    const writer = createInputWriter(Promise.resolve(), send)
    await expect(writer.write('first')).rejects.toThrow('write failed')
    await writer.write('second')
    expect(send.mock.calls).toEqual([['first'], ['second']])
  })

  it('coalesces resizes and sends the final size in order', async () => {
    const blocked = pending()
    const send = vi.fn().mockReturnValueOnce(blocked.promise).mockResolvedValue(undefined)
    const writer = createResizeWriter(Promise.resolve(), send)
    const first = writer.resize(80)
    await vi.waitFor(() => expect(send).toHaveBeenCalledExactlyOnceWith(80))
    const second = writer.resize(90)
    const final = writer.resize(120)
    blocked.resolve()
    await Promise.all([first, second, final])
    expect(send.mock.calls).toEqual([[80], [120]])
  })
})
