import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPoller, type PollJob } from './poller'

function pending() {
  let resolve!: (value: string) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<string>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

const job = (id: string, value = id, intervalMs = 1000): PollJob<string> => ({ id, value, intervalMs })

describe('widget polling', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('waits for completion before scheduling the next execution', async () => {
    const first = pending()
    const run = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue('next')
    const result = vi.fn()
    const poller = createPoller(run, result)
    poller.setJobs([job('git')])
    await vi.advanceTimersByTimeAsync(10000)
    expect(run).toHaveBeenCalledTimes(1)
    first.resolve('main')
    await vi.advanceTimersByTimeAsync(0)
    expect(result).toHaveBeenCalledWith('git', 'main')
    await vi.advanceTimersByTimeAsync(999)
    expect(run).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(run).toHaveBeenCalledTimes(2)
    poller.dispose()
  })

  it('caps concurrent work and releases a slot for queued widgets', async () => {
    const tasks = [pending(), pending(), pending()]
    const run = vi.fn().mockImplementationOnce(() => tasks[0].promise)
      .mockImplementationOnce(() => tasks[1].promise).mockImplementationOnce(() => tasks[2].promise)
    const poller = createPoller(run, vi.fn())
    poller.setJobs([job('a'), job('b'), job('c')])
    await vi.advanceTimersByTimeAsync(1000)
    expect(run).toHaveBeenCalledTimes(2)
    tasks[0].resolve('a')
    await vi.advanceTimersByTimeAsync(0)
    expect(run).toHaveBeenCalledTimes(3)
    poller.dispose()
    tasks[1].resolve('b')
    tasks[2].resolve('c')
    await vi.advanceTimersByTimeAsync(10000)
    expect(run).toHaveBeenCalledTimes(3)
  })

  it('ignores stale results and keeps the same widget serialized across focus/CWD changes', async () => {
    const first = pending()
    const second = pending()
    const run = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const result = vi.fn()
    const poller = createPoller(run, result)
    poller.setJobs([job('git', 'old-directory')])
    await vi.advanceTimersByTimeAsync(1000)
    poller.setJobs([])
    poller.setJobs([job('git', 'new-directory')])
    await vi.advanceTimersByTimeAsync(5000)
    expect(run).toHaveBeenCalledTimes(1)
    first.resolve('old branch')
    await vi.advanceTimersByTimeAsync(0)
    expect(result).not.toHaveBeenCalled()
    expect(run).toHaveBeenLastCalledWith('new-directory')
    second.resolve('new branch')
    await vi.advanceTimersByTimeAsync(0)
    expect(result).toHaveBeenCalledExactlyOnceWith('git', 'new branch')
    poller.dispose()
  })

  it('backs off failures and restores the normal interval after success', async () => {
    const run = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue('ok')
    const poller = createPoller(run, vi.fn())
    poller.setJobs([job('network')])
    await vi.advanceTimersByTimeAsync(1000)
    await vi.advanceTimersByTimeAsync(1999)
    expect(run).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(run).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1000)
    expect(run).toHaveBeenCalledTimes(3)
    poller.dispose()
  })

  it('preserves long configured intervals and cancels queued work on disposal', async () => {
    const run = vi.fn().mockResolvedValue('ok')
    const result = vi.fn()
    const poller = createPoller(run, result)
    poller.setJobs([job('slow-refresh', 'value', 120000)])
    await vi.advanceTimersByTimeAsync(61000)
    expect(run).toHaveBeenCalledTimes(1)
    poller.dispose()
    await vi.advanceTimersByTimeAsync(120000)
    expect(run).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('prevents overflowing manifest intervals from becoming rapid timers', async () => {
    const run = vi.fn().mockResolvedValue('ok')
    const poller = createPoller(run, vi.fn())
    poller.setJobs([job('huge-interval', 'value', Number.MAX_SAFE_INTEGER)])
    await vi.advanceTimersByTimeAsync(60000)
    expect(run).toHaveBeenCalledTimes(1)
    poller.dispose()
  })
})
