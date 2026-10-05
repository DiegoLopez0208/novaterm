export interface PollJob<T> {
  id: string
  intervalMs: number
  value: T
}

interface ScheduledJob<T> extends PollJob<T> {
  failures: number
}

/** Active work stays accounted for across focus/CWD changes until it finishes. */
export function createPoller<T>(
  run: (value: T) => Promise<string>,
  onResult: (id: string, result: string) => void,
  { concurrency = 2, initialDelayMs = 1000 } = {},
) {
  const jobs = new Map<string, ScheduledJob<T>>()
  const queued = new Map<string, ScheduledJob<T>>()
  const active = new Set<string>()
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  let disposed = false

  const schedule = (job: ScheduledJob<T>, delay: number) => {
    timers.set(job.id, setTimeout(() => {
      timers.delete(job.id)
      if (jobs.get(job.id) !== job || disposed) return
      queued.set(job.id, job)
      pump()
    }, delay))
  }

  const pump = () => {
    for (const [id, job] of queued) {
      if (active.size >= concurrency) break
      if (active.has(id)) continue
      queued.delete(id)
      active.add(id)
      void (async () => {
        let result = ''
        try {
          result = await run(job.value)
          job.failures = 0
        } catch {
          job.failures += 1
        } finally {
          active.delete(id)
          if (!disposed && jobs.get(id) === job) {
            onResult(id, result)
            // Browsers turn overflowing timeout delays into ~1 ms timers.
            const interval = Number.isFinite(job.intervalMs)
              ? Math.min(2147483647, Math.max(1000, job.intervalMs)) : 5000
            schedule(job, Math.min(Math.max(60000, interval), interval * 2 ** Math.min(job.failures, 6)))
          }
          pump()
        }
      })()
    }
  }

  const clear = () => {
    timers.forEach(clearTimeout)
    timers.clear()
    queued.clear()
    jobs.clear()
  }

  return {
    setJobs(next: PollJob<T>[]) {
      clear()
      if (disposed) return
      for (const job of next) {
        if (jobs.has(job.id)) continue
        const scheduled = { ...job, failures: 0 }
        jobs.set(job.id, scheduled)
        schedule(scheduled, initialDelayMs)
      }
    },
    dispose() {
      disposed = true
      clear()
    },
  }
}
