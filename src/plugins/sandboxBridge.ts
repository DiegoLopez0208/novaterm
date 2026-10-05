// API injected into the plugin iframe. The host broker enforces permissions.
// Legacy method names and wire fields remain available for existing plugins.
export const SANDBOX_BRIDGE = `
(() => {
  let siguiente = 1
  const pendientes = new Map()

  addEventListener('message', (e) => {
    if (e.source !== parent) return
    const r = e.data
    if (!r || r.nova !== 1 || typeof r.id !== 'number') return
    const p = pendientes.get(r.id)
    if (!p) return
    pendientes.delete(r.id)
    clearTimeout(p.timer)
    r.ok ? p.resolver(r.datos) : p.rechazar(new Error(r.error || 'request rejected'))
  })

  function pedir(metodo, datos) {
    if (pendientes.size >= 128) return Promise.reject(new Error('Too many pending plugin requests'))
    const id = siguiente++
    return new Promise((resolver, rechazar) => {
      // Bound unanswered requests and release timers immediately on replies.
      const timer = setTimeout(() => {
        if (pendientes.delete(id)) rechazar(new Error(metodo + ': no response'))
      }, 130000)
      pendientes.set(id, { resolver, rechazar, timer })
      try {
        parent.postMessage({ nova: 1, id, metodo, datos }, '*')
      } catch (error) {
        pendientes.delete(id)
        clearTimeout(timer)
        rechazar(error)
      }
    })
  }

  globalThis.nova = {
    apiVersion: 1,
    terminal: {
      read: (lines = 200) => pedir('terminal.read', { lines }).then((r) => r.text),
      write: (data) => pedir('terminal.write', { data }),
      leer: (lines = 200) => pedir('terminal.read', { lines }).then((r) => r.text),
      escribir: (data) => pedir('terminal.write', { data }),
    },
    ai: {
      complete: (messages, options = {}) =>
        pedir('llm.complete', { messages, ...options }).then((r) =>
          ({ text: r.text, tokens: r.tokens, remaining: r.restante })),
    },
    commands: {
      trigger: (id) => pedir('commands.trigger', { id }),
    },
    ia: {
      preguntar: (messages, opciones = {}) =>
        pedir('llm.complete', { messages, ...opciones }),
    },
    comandos: {
      disparar: (id) => pedir('commands.trigger', { id }),
    },
  }
})()
`
