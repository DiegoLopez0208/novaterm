/** Coalesce parsed-byte acknowledgements within one microtask. */
export function createAckBatcher(send: (bytes: number) => Promise<void>, onError: () => void) {
  let pending = 0
  let scheduled = false
  let closed = false
  return {
    parsed(bytes: number) {
      if (closed) return
      pending += bytes
      if (scheduled) return
      scheduled = true
      queueMicrotask(() => {
        scheduled = false
        if (closed || pending === 0) return
        const bytes = pending
        pending = 0
        void send(bytes).catch(() => {
          if (!closed) {
            closed = true
            onError()
          }
        })
      })
    },
    dispose() { closed = true; pending = 0 },
  }
}

/** Preserve input order even when backend writes use a blocking thread pool. */
export function createInputWriter(ready: Promise<unknown>, send: (data: string) => Promise<void>) {
  let tail: Promise<void> = Promise.resolve()
  let pendingCharacters = 0
  let pendingWrites = 0
  let closed = false
  // A failed spawn without pending input must not become an unhandled rejection.
  void ready.catch(() => {})
  return {
    write(data: string): Promise<void> {
      if (closed) return Promise.reject(new Error('PTY session is closed'))
      if (pendingWrites >= 128 || pendingCharacters + data.length > 1048576) {
        return Promise.reject(new Error('PTY input queue is full'))
      }
      pendingWrites++
      pendingCharacters += data.length
      const operation = tail.catch(() => {}).then(async () => {
        await ready
        if (closed) throw new Error('PTY session is closed')
        await send(data)
      }).finally(() => {
        pendingWrites--
        pendingCharacters -= data.length
      })
      tail = operation
      return operation
    },
    dispose() { closed = true },
  }
}

/** Keep the latest size, with at most one backend resize in flight. */
export function createResizeWriter<T>(ready: Promise<unknown>, send: (size: T) => Promise<void>) {
  let latest: { size: T } | null = null
  let active: Promise<void> | null = null
  let closed = false
  void ready.catch(() => {})
  return {
    resize(size: T): Promise<void> {
      if (closed) return Promise.reject(new Error('PTY session is closed'))
      latest = { size }
      if (active) return active
      active = (async () => {
        try {
          await ready
          while (!closed && latest) {
            const next = latest.size
            latest = null
            await send(next)
          }
        } finally {
          active = null
          latest = null
        }
      })()
      return active
    },
    dispose() { closed = true; latest = null },
  }
}
