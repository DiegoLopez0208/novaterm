import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { MenuPanel } from '../panes/MenuPanel'
import { Terminal, type IDisposable, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { SearchAddon } from '@xterm/addon-search'
import '@xterm/xterm/css/xterm.css'
import {
  closePty,
  nuevoPtyId,
  resizePty,
  spawnPty,
  writePty,
  type PtyId,
  type SpawnOptions,
} from './ptyBridge'
import { conSimbolos, type NovaConfig } from '../config/configBridge'
import { EVENTO_BUSCAR } from '../acciones/registro'
import { crearManejador } from './portapapeles'
import { construirBienvenida, type InfoSistema } from './bienvenida'
import { BarraBusqueda } from './BarraBusqueda'
import { marcarActivo, olvidar, registrar } from './registro'
import { smoothScrollDuration, useMotionEnabled } from './motion'

interface Props {
  config: NovaConfig
  /** Identifica al panel en el registro de terminales vivas, del que se sirven
   *  los plugins para leer y escribir en la sesion que esta a la vista. */
  panelId: string
  profile?: Pick<SpawnOptions, 'shell' | 'args' | 'cwd'>
  /** Panel visible y seleccionado. Al volver a serlo hay que remedir y enfocar. */
  activo?: boolean
  puedeCerrarPanel?: boolean
  onDividir?: (direccion: 'vertical' | 'horizontal') => void
  onCerrarPanel?: () => void
  onExit?: (code: number | null) => void
  onTitle?: (title: string) => void
  /** Directorio actual, cuando el shell lo reporta por OSC 7. */
  onCwd?: (cwd: string) => void
}

function construirTema(config: NovaConfig): ITheme {
  const { colors } = config
  return {
    // Transparente: el fondo lo pinta el contenedor, una sola superficie para
    // toda la ventana. Si lo pintara tambien xterm, el alpha se aplicaria dos
    // veces y el area de texto quedaria mas opaca que su propio margen.
    background: 'rgba(0, 0, 0, 0)',
    foreground: colors.foreground,
    cursor: colors.cursor,
    cursorAccent: colors.background,
    selectionBackground: colors.selection,
    black: colors.normal.black,
    red: colors.normal.red,
    green: colors.normal.green,
    yellow: colors.normal.yellow,
    blue: colors.normal.blue,
    magenta: colors.normal.magenta,
    cyan: colors.normal.cyan,
    white: colors.normal.white,
    brightBlack: colors.bright.black,
    brightRed: colors.bright.red,
    brightGreen: colors.bright.green,
    brightYellow: colors.bright.yellow,
    brightBlue: colors.bright.blue,
    brightMagenta: colors.bright.magenta,
    brightCyan: colors.bright.cyan,
    brightWhite: colors.bright.white,
  }
}

function estiloDeCursor(style: string): 'block' | 'underline' | 'bar' {
  if (style === 'block' || style === 'underline' || style === 'bar') return style
  // "beam" es como lo llaman kitty y alacritty; xterm lo llama "bar".
  if (style === 'beam') return 'bar'
  return 'bar'
}

/// OSC 7 llega como `file://equipo/C:/Users/Diego/dev`. Se queda con la ruta y
/// la devuelve al estilo del sistema.
function rutaDesdeOsc7(dato: string): string | null {
  try {
    const url = new URL(dato)
    if (url.protocol !== 'file:') return null
    const ruta = decodeURIComponent(url.pathname)
    // En Windows queda un "/" delante de la letra de unidad.
    const limpia = /^\/[a-zA-Z]:/.test(ruta) ? ruta.slice(1) : ruta
    return limpia.replace(/\//g, '\\').replace(/\\$/, '') || null
  } catch {
    return null
  }
}

/** Cuanto espera un panel escondido antes de soltar su contexto de WebGL.
 *  Alternar pestanas de ida y vuelta no deberia recrearlo en cada paso. */
const DESCARGA_WEBGL_MS = 5000

/** Renderer de WebGL: una sola superficie que se repinta entera, en vez de los
 *  cientos de <span> del renderer del DOM. Baja el uso de CPU con salida pesada
 *  y evita que se vean las regiones de repintado moviendose sobre una ventana
 *  translucida.
 *
 *  Se descarto una vez porque con `allowTransparency` no dibujaba nada, pero
 *  aquella version pintaba el fondo desde xterm; ahora el fondo del tema es
 *  transparente y lo pinta el contenedor.
 *
 *  Cada contexto se lleva su propio atlas de glifos en memoria de video, asi que
 *  el dueno es el efecto de `activo`: uno solo por panel visible, y un panel que
 *  nace en segundo plano no llega a crearlo.
 *
 *  Devuelve null si la maquina no da WebGL; ahi queda el renderer del DOM, que
 *  siempre funciona.
 */
function cargarWebgl(term: Terminal): WebglAddon | null {
  try {
    const webgl = new WebglAddon()
    // Si el contexto se pierde (driver que se reinicia, GPU que se va a dormir)
    // se descarga el addon y xterm vuelve solo al renderer del DOM.
    webgl.onContextLoss(() => webgl.dispose())
    term.loadAddon(webgl)
    return webgl
  } catch {
    return null
  }
}

export function TerminalView({
  config,
  panelId,
  profile,
  activo = true,
  puedeCerrarPanel = false,
  onExit,
  onTitle,
  onCwd,
  onDividir,
  onCerrarPanel,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const ptyRef = useRef<PtyId | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const buscadorRef = useRef<SearchAddon | null>(null)
  const webglRef = useRef<WebglAddon | null>(null)
  const [busqueda, setBusqueda] = useState(false)
  const motionEnabled = useMotionEnabled(config.ui.animations, activo)
  const scrollDuration = smoothScrollDuration(config.terminal.smooth_scroll_ms, motionEnabled)
  const scrollDurationRef = useRef(scrollDuration)
  scrollDurationRef.current = scrollDuration
  // La config y los callbacks viven en refs para que el efecto de arranque no
  // dependa de ellos. El padre crea funciones nuevas en cada render; si el
  // efecto las tuviera como dependencia, cerraria y volveria a abrir el shell
  // en bucle y la terminal nunca mostraria nada.
  const configRef = useRef(config)
  configRef.current = config
  // PaneTree usa el mismo id como `key`, asi que en la practica no cambia
  // nunca para una instancia dada; la ref esta para que el efecto de arranque
  // pueda seguir sin dependencias, que es lo que evita que reabra el shell.
  const panelIdRef = useRef(panelId)
  panelIdRef.current = panelId
  const perfilRef = useRef(profile)
  const onTitleRef = useRef(onTitle)
  onTitleRef.current = onTitle
  const onExitRef = useRef(onExit)
  onExitRef.current = onExit
  const onCwdRef = useRef(onCwd)
  onCwdRef.current = onCwd

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let disposed = false
    let ptyId: PtyId | null = null
    // `term.dispose()` ya deberia arrastrarlos, pero estos dos escriben al PTY:
    // dejarlos atados a ese detalle es lo que vuelve invisible una fuga.
    const descartables: IDisposable[] = []
    const inicial = configRef.current

    const term = new Terminal({
      allowProposedApi: true,
      allowTransparency: true,
      fontFamily: conSimbolos(inicial.font.family),
      fontSize: inicial.font.size,
      lineHeight: inicial.font.line_height,
      letterSpacing: inicial.font.letter_spacing,
      cursorBlink: inicial.cursor.blink,
      cursorStyle: estiloDeCursor(inicial.cursor.style),
      scrollback: inicial.terminal.scrollback,
      smoothScrollDuration: scrollDurationRef.current,
      theme: construirTema(inicial),
    })

    const fit = new FitAddon()
    term.loadAddon(fit)

    const buscador = new SearchAddon()
    term.loadAddon(buscador)
    buscadorRef.current = buscador

    const unicode11 = new Unicode11Addon()
    term.loadAddon(unicode11)
    term.unicode.activeVersion = '11'

    term.open(host)

    fit.fit()
    termRef.current = term
    fitRef.current = fit

    // xterm mide el tamaño de celda al construirse. Con las fuentes propias
    // empaquetadas, la primera medicion puede caer sobre el fallback y dejar
    // filas y columnas fantasma: al terminar de cargar hay que remedir.
    void document.fonts.ready.then(() => {
      if (disposed) return
      try {
        fit.fit()
      } catch {
        // el contenedor todavia no tiene tamaño util
      }
    })

    term.onTitleChange((title) => onTitleRef.current?.(title))

    // Devolver false deja que xterm siga procesando la secuencia; devolver true
    // la daria por consumida.
    term.parser.registerOscHandler(7, (dato) => {
      const ruta = rutaDesdeOsc7(dato)
      if (ruta) onCwdRef.current?.(ruta)
      return false
    })

    term.onSelectionChange(() => {
      if (!configRef.current.terminal.copy_on_select) return
      const seleccion = term.getSelection()
      if (seleccion) void navigator.clipboard.writeText(seleccion)
    })

    // Copiar y pegar como en Windows Terminal, PowerShell y CMD modernos. Toda
    // la logica vive en `portapapeles.ts` para poder probarla sin montar nada.
    term.attachCustomKeyEventHandler(crearManejador(term))

    // La bienvenida se escribe **antes** de abrir el PTY: asi queda arriba de
    // todo y el prompt del shell cae abajo, como si la hubiera impreso el
    // sistema. Al reves competiria con la primera salida del shell.
    const bienvenida = async () => {
      if (!inicial.ui.welcome) return
      try {
        const info = await invoke<InfoSistema>('system_info')
        if (!disposed) term.write(construirBienvenida(info, inicial, term.cols))
      } catch {
        // Sin datos del sistema no hay bienvenida, y no es motivo para que la
        // terminal no abra.
      }
    }

    const start = async () => {
      // El id se sabe de antemano para poder cerrar la sesion si el panel se
      // desmonta antes de que el spawn conteste.
      const id = nuevoPtyId()
      ptyId = id
      ptyRef.current = id

      await bienvenida()
      if (disposed) return

      // Install input before output can arrive, including xterm's DSR replies.
      // The bridge holds writes until the backend has published the session.
      descartables.push(
        term.onData((data) => {
          void writePty(id, data).catch((error) => {
            if (!disposed) term.write(`\r\n[PTY input failed: ${String(error)}]\r\n`)
          })
        }),
        term.onResize(({ cols, rows }) => {
          void resizePty(id, cols, rows).catch(() => {})
        }),
      )

      // Los dos callbacks viajan con el spawn como canales de IPC, asi que ya
      // estan escuchando cuando el backend abre el PTY: no hay ventana en la
      // que el prompt se emita sin nadie del otro lado.
      await spawnPty(
        id,
        {
          ...perfilRef.current,
          cols: term.cols,
          rows: term.rows,
        },
        (bytes, parsed) => { if (!disposed) term.write(bytes, parsed) },
        ({ code }) => {
          term.write(
            `\r\n\x1b[38;5;244m[proceso terminado: ${code ?? 'sin codigo'}]\x1b[0m\r\n`,
          )
          onExitRef.current?.(code)
        },
      )

      if (disposed) {
        void closePty(id)
        return
      }

      registrar(panelIdRef.current, { term, ptyId: id })
      void resizePty(id, term.cols, term.rows).catch(() => {})
      term.focus()
    }

    start().catch((err) => {
      term.write(`\r\n\x1b[31mCould not open shell: ${String(err)}\x1b[0m\r\n`)
    })

    const observer = new ResizeObserver(() => {
      try {
        fit.fit()
      } catch {
        // el contenedor puede medir 0 mientras se anima; el proximo tick corrige
      }
    })
    observer.observe(host)

    return () => {
      disposed = true
      olvidar(panelIdRef.current)
      observer.disconnect()
      descartables.forEach((d) => d.dispose())
      if (ptyId) void closePty(ptyId)
      webglRef.current?.dispose()
      webglRef.current = null
      term.dispose()
      termRef.current = null
      fitRef.current = null
      buscadorRef.current = null
    }
    // Sin dependencias a proposito: este efecto abre el shell una sola vez por
    // panel. La config la aplica el efecto de abajo sobre la terminal ya viva.
  }, [])

  // Updating visual motion never recreates a terminal or its PTY.
  useEffect(() => {
    if (termRef.current) termRef.current.options.smoothScrollDuration = scrollDuration
  }, [scrollDuration])

  // Config en caliente sobre la terminal viva. Recrearla mataria el shell y
  // perderias el scrollback cada vez que tocas un color.
  useEffect(() => {
    const term = termRef.current
    if (!term) return

    term.options.fontFamily = conSimbolos(config.font.family)
    term.options.fontSize = config.font.size
    term.options.lineHeight = config.font.line_height
    term.options.letterSpacing = config.font.letter_spacing
    term.options.cursorBlink = config.cursor.blink
    term.options.cursorStyle = estiloDeCursor(config.cursor.style)
    term.options.scrollback = config.terminal.scrollback
    term.options.theme = construirTema(config)

    // Cambiar la fuente cambia el tamano de celda: sin refit quedan filas y
    // columnas fantasma y el shell escribe en el lugar equivocado.
    try {
      fitRef.current?.fit()
    } catch {
      // el contenedor todavia no tiene tamano util
    }
  }, [config])

  // Una pestaña oculta mide cero, asi que xterm quedo con el tamaño viejo.
  // Al volver hay que remedir antes de escribir o el shell dibuja en columnas
  // que no existen.
  useEffect(() => {
    if (!activo) return
    marcarActivo(panelId)
    const term = termRef.current
    if (!term) return

    const id = window.setTimeout(() => {
      try {
        fitRef.current?.fit()
      } catch {
        // todavia sin tamaño util
      }
      term.focus()
    }, 0)
    return () => window.clearTimeout(id)
  }, [activo, panelId])

  // Un contexto de WebGL, con su atlas de glifos, se paga en memoria aunque el
  // panel este escondido. Las pestanas inactivas quedan montadas a proposito
  // ---desmontarlas mataria su shell---, asi que con varias abiertas se
  // acumulaba un contexto por panel para uno solo visible. Soltarlo no toca ni
  // el PTY ni el scrollback: xterm sigue dibujando con el renderer del DOM
  // hasta que el panel vuelve al frente.
  useEffect(() => {
    const term = termRef.current
    if (!term) return

    const soltar = () => {
      webglRef.current?.dispose()
      webglRef.current = null
    }

    if (!config.terminal.gpu) {
      soltar()
      return
    }

    if (activo) {
      if (!webglRef.current) webglRef.current = cargarWebgl(term)
      return
    }

    const id = window.setTimeout(soltar, DESCARGA_WEBGL_MS)
    return () => window.clearTimeout(id)
  }, [activo, config.terminal.gpu])

  // Solo el panel activo abre la busqueda. El pedido llega por evento del DOM
  // desde el atajo global, que no tiene forma de alcanzar esta instancia.
  useEffect(() => {
    if (!activo) return
    const abrir = () => setBusqueda(true)
    window.addEventListener(EVENTO_BUSCAR, abrir)
    return () => window.removeEventListener(EVENTO_BUSCAR, abrir)
  }, [activo])

  const copiar = () => {
    const seleccion = termRef.current?.getSelection()
    if (seleccion) void navigator.clipboard.writeText(seleccion)
  }

  const pegar = () => {
    void navigator.clipboard.readText().then((texto) => {
      if (texto) termRef.current?.paste(texto)
      termRef.current?.focus()
    })
  }

  // Un clic en cualquier parte del panel devuelve el foco al shell. Sin esto,
  // hacer clic en la zona vacia de abajo dejaba la terminal sin foco y parecia
  // que no respondia al teclado.
  return (
    <>
      <div
        className="terminal-host"
        ref={hostRef}
        onMouseDown={() => termRef.current?.focus()}
        onContextMenu={(e) => {
          e.preventDefault()
          setMenu({ x: e.clientX, y: e.clientY })
        }}
      />

      {busqueda && (
        <BarraBusqueda
          buscador={buscadorRef.current}
          onCerrar={() => {
            setBusqueda(false)
            termRef.current?.focus()
          }}
        />
      )}

      {menu && (
        <MenuPanel
          x={menu.x}
          y={menu.y}
          puedeCerrar={puedeCerrarPanel}
          onDividir={(direccion) => onDividir?.(direccion)}
          onCopiar={copiar}
          onPegar={pegar}
          onCerrarPanel={() => onCerrarPanel?.()}
          onCerrar={() => setMenu(null)}
        />
      )}
    </>
  )
}
