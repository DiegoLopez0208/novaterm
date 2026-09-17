import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useConfig } from './config/useConfig'
import { conSimbolos, reloadConfig, withAlpha } from './config/configBridge'
import { TitleBar } from './chrome/TitleBar'
import { TabBar, nombreCorto } from './tabs/TabBar'
import { PaneTree } from './panes/PaneTree'
import { StatusBar } from './status/StatusBar'
import { useTabs } from './tabs/useTabs'
import { coincide, construirAcciones, EVENTO_BUSCAR } from './acciones/registro'
import { hojas } from './tabs/modelo'
import { instalarBroker } from './plugins/host'
import type { Plugin } from './plugins/tipos'

// Ninguno de los dos se ve al arrancar, y juntos arrastran los presets de temas
// y el editor de SSH. Fuera del bundle inicial son menos JS que parsear antes
// del primer prompt.
const SettingsPanel = lazy(() =>
  import('./settings/SettingsPanel').then((m) => ({ default: m.SettingsPanel })),
)
const CommandPalette = lazy(() =>
  import('./palette/CommandPalette').then((m) => ({ default: m.CommandPalette })),
)
// El catalogo trae el cliente del registro y la pantalla de consentimiento, y no
// se ve hasta que alguien lo pide. El panel de plugin, igual: sin plugins con
// panel, el iframe y su puente no tienen por que estar en el bundle inicial.
const MarketplacePanel = lazy(() =>
  import('./marketplace/MarketplacePanel').then((m) => ({ default: m.MarketplacePanel })),
)
const PanelPlugin = lazy(() =>
  import('./plugins/PanelPlugin').then((m) => ({ default: m.PanelPlugin })),
)

/// El mismo valor que `defaults.rs`. Es a donde vuelve Ctrl+0.
const TAMANO_BASE = 14
const TAMANO_MINIMO = 6
const TAMANO_MAXIMO = 40

export interface Profile {
  id: string
  name: string
  command: string
  args: string[]
  icon: string
  detectado: boolean
}

export default function App() {
  const [ajustes, setAjustes] = useState(false)
  const [mercado, setMercado] = useState(false)
  /// Cual plugin tiene el panel abierto. Uno solo por vez: son iframes, y tener
  /// varios vivos cuesta lo mismo que tener varias pestanas.
  const [panelAbierto, setPanelAbierto] = useState<string | null>(null)
  const [paleta, setPaleta] = useState(false)
  const [perfiles, setPerfiles] = useState<Profile[]>([])
  const [cwd, setCwd] = useState<string | null>(null)
  const { config, error, update } = useConfig()
  const tabs = useTabs()

  const recargarPerfiles = useCallback(() => {
    invoke<Profile[]>('profiles_list')
      .then(setPerfiles)
      .catch(() => setPerfiles([]))
  }, [])

  // `profiles_list` sale de la cache; esto es lo unico que vuelve a mirar el
  // disco y a preguntarle a WSL que distros hay.
  const redetectarShells = useCallback(() => {
    invoke<Profile[]>('profiles_refresh')
      .then(setPerfiles)
      .catch(() => {})
  }, [])

  useEffect(recargarPerfiles, [recargarPerfiles])

  // Un solo escucha de `message` para todos los plugins, montado una vez. Es la
  // frontera del sandbox: sin esto, los iframes hablan y nadie los atiende.
  useEffect(instalarBroker, [])

  // Los plugins con panel se cargan una vez y se refrescan al instalar o
  // desinstalar; `plugins_list` lanza un proceso por widget, no conviene
  // llamarlo en cada render.
  const [plugins, setPlugins] = useState<Plugin[]>([])
  const recargarPlugins = useCallback(() => {
    void invoke<Plugin[]>('plugins_list')
      .then(setPlugins)
      .catch(() => setPlugins([]))
  }, [])
  useEffect(recargarPlugins, [recargarPlugins])

  // El borde de la ventana lo dibuja el compositor, no el HTML, asi que hay que
  // avisarle cada vez que cambia el color de acento del tema.
  const acento = config?.colors.normal.blue
  useEffect(() => {
    if (acento) void invoke('window_border', { color: acento }).catch(() => {})
  }, [acento])

  // Mismo caso con el acrilico: lo pone el compositor de Windows, asi que el
  // interruptor de Ajustes tiene que avisarle en vez de esperar un reinicio.
  const desenfoque = config?.window.blur
  useEffect(() => {
    if (desenfoque === undefined) return
    void invoke('window_blur', { blur: desenfoque }).catch(() => {})
  }, [desenfoque])

  // Los perfiles propios salen del config que ya esta en memoria, no de
  // `profiles_list`. Ese comando lee el config del backend, que recien se
  // entera cuando el guardado sale del debounce: si el menu esperara por ahi,
  // un perfil agregado desde Ajustes tardaria medio segundo en aparecer, o no
  // aparecia hasta reiniciar.
  const perfilesVisibles = useMemo(() => {
    const propios = config?.profiles ?? []
    const ids = new Set(propios.map((p) => p.id))
    return [...propios, ...perfiles.filter((p) => !ids.has(p.id))]
  }, [config?.profiles, perfiles])

  /// `delta` en puntos; 0 vuelve al tamaño de fabrica.
  const zoom = useCallback(
    (delta: number) => {
      if (!config) return
      const bruto = delta === 0 ? TAMANO_BASE : config.font.size + delta
      const size = Math.min(TAMANO_MAXIMO, Math.max(TAMANO_MINIMO, bruto))
      if (size === config.font.size) return
      update({ ...config, font: { ...config.font, size } })
    },
    [config, update],
  )

  const acciones = useMemo(
    () =>
      config
        ? construirAcciones({
            perfiles: perfilesVisibles,
            config,
            nuevaPestana: tabs.nueva,
            duplicar: tabs.duplicar,
            cerrarPestana: () => tabs.cerrar(tabs.activa),
            irAPestana: (indice) => {
              const pestana = tabs.pestanas[indice]
              if (pestana) tabs.setActiva(pestana.id)
            },
            moverPestana: (delta) => tabs.mover(delta > 0 ? 1 : -1),
            dividir: tabs.dividir,
            cerrarPanel: tabs.cerrarPanelActivo,
            moverPanel: (delta) => tabs.moverPanel(delta > 0 ? 1 : -1),
            abrirAjustes: () => setAjustes((v) => !v),
            abrirPlugins: () => setMercado(true),
            alternarPaleta: () => setPaleta((v) => !v),
            buscar: () => window.dispatchEvent(new CustomEvent(EVENTO_BUSCAR)),
            pantallaCompleta: () => {
              const ventana = getCurrentWindow()
              void ventana
                .isFullscreen()
                .then((activa) => ventana.setFullscreen(!activa))
                .catch(() => {})
            },
            zoom,
            aplicarConfig: update,
            recargarConfig: () => void reloadConfig(),
            redetectarShells,
          })
        : [],
    [config, perfilesVisibles, tabs, update, zoom, redetectarShells],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Siempre con preventDefault: sin eso la tecla sigue viaje hasta xterm y
      // termina escrita en el shell.
      for (const accion of acciones) {
        if (accion.combo && coincide(accion.combo, e)) {
          e.preventDefault()
          e.stopPropagation()
          accion.ejecutar()
          return
        }
      }

      if (e.key === 'Escape') {
        if (paleta) setPaleta(false)
        else if (ajustes) setAjustes(false)
      }
    }

    // En captura: xterm escucha en su propio nodo y se quedaria con la tecla.
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [acciones, ajustes, paleta])

  // Ctrl+rueda cambia el tamaño de la letra, como en cualquier terminal y en el
  // navegador. Sin `passive: false` el preventDefault no corre y el webview
  // hace su propio zoom encima del nuestro.
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      zoom(e.deltaY < 0 ? 1 : -1)
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [zoom])

  // El splash del index.html se retira recien cuando hay algo que mostrar en su
  // lugar. La ventana ya se mostro desde main.tsx, con el cartel puesto.
  //
  // **No usar requestAnimationFrame aca.** WebView2 no dibuja cuadros mientras
  // la ventana esta oculta, asi que los callbacks de rAF pueden no correr nunca.
  // Los temporizadores si corren.
  const retirado = useRef(false)
  useEffect(() => {
    if (!config || retirado.current) return
    retirado.current = true

    const id = window.setTimeout(() => {
      const splash = document.getElementById('splash')
      if (!splash) return
      // El remove va atado a la transicion, con un plazo por si la transicion no
      // llega a dispararse: un splash que no se va tapa la app entera.
      const sacar = () => splash.remove()
      splash.addEventListener('transitionend', sacar, { once: true })
      window.setTimeout(sacar, 600)
      splash.classList.add('se-va')
    }, 0)
    return () => window.clearTimeout(id)
  }, [config])

  // En la app esto no llega a verse: Rust inyecta la config antes de que cargue
  // el documento, asi que ya esta en el primer render. Queda como red para
  // cuando el frontend corre suelto en el navegador (`npm run dev` sin Tauri),
  // donde hay que esperar el `config_get` que nunca va a responder.
  if (!config) return <div className="app" />

  // El chrome se pinta con la paleta de la terminal, no con colores propios. Es
  // lo que hace que la ventana se sienta una sola cosa.
  const tema = {
    '--fondo': config.colors.background,
    '--tinta': config.colors.foreground,
    '--tenue': config.colors.bright.black,
    '--acento': config.colors.normal.blue,
    '--linea': withAlpha(config.colors.foreground, 0.1),
    '--realce': withAlpha(config.colors.foreground, 0.07),
    '--chrome': withAlpha(config.colors.background, Math.min(1, config.window.opacity + 0.1)),
    // Una sola superficie translucida para toda la ventana. Antes el fondo lo
    // pintaba solo xterm, asi que el margen interno quedaba transparente y se
    // veia un recuadro flotando en vez de una terminal con aire adentro.
    '--lienzo': withAlpha(config.colors.background, config.window.opacity),
    // Sin barra de titulo nativa, Windows no siempre dibuja el borde de la
    // ventana, asi que lo pinta el propio contenido.
    '--borde': withAlpha(config.colors.normal.blue, 0.42),
    '--fuente': conSimbolos(config.font.family),
    '--ligaduras': config.font.ligatures ? 'contextual' : 'none',
    '--pad': `${config.window.padding}px`,
  } as CSSProperties

  // Un plugin solo puede montar su panel si declara `entry`, si trae el permiso
  // `ui.panel` en el manifiesto y si el usuario ademas se lo concedio. Las tres
  // condiciones: declarar no es pedir, y pedir no es tener.
  const conPanel =
    plugins.find(
      (p) =>
        p.id === panelAbierto &&
        p.entry &&
        p.permissions.includes('ui.panel') &&
        (config.plugins.concedidos[p.id] ?? []).includes('ui.panel'),
    ) ?? null

  const titulo = tabs.actual.alias ?? nombreCorto(tabs.actual.titulo)

  return (
    <div className="app" style={tema}>
      <TitleBar
        title={titulo}
        colors={config.colors}
        paneles={hojas(tabs.actual.raiz).length}
        onSettings={() => setAjustes((v) => !v)}
        onPlugins={() => setMercado(true)}
        onDividir={tabs.dividir}
        onCerrarPanel={tabs.cerrarPanelActivo}
      />

      {config.ui.tab_bar && (
        <TabBar
          pestanas={tabs.pestanas}
          activa={tabs.activa}
          perfiles={perfilesVisibles}
          onSeleccionar={tabs.setActiva}
          onCerrar={tabs.cerrar}
          onNueva={(perfil) =>
            tabs.nueva(perfil ? { shell: perfil.command, args: perfil.args } : undefined)
          }
          onRenombrar={tabs.renombrar}
        />
      )}

      {error && (
        <div className="aviso" role="alert">
          {error}
        </div>
      )}

      <main className="workspace">
        {/* Todas las pestañas quedan montadas: desmontar la que se oculta
            cerraria su PTY y perderias la sesion al volver. */}
        {tabs.pestanas.map((pestana) => (
          <div
            key={pestana.id}
            className={`lienzo${pestana.id === tabs.activa ? '' : ' oculto'}`}
          >
            <PaneTree
              panel={pestana.raiz}
              activo={pestana.activo}
              config={config}
              visible={pestana.id === tabs.activa}
              onActivar={tabs.activarPanel}
              onTitulo={(t) => tabs.tituloDesdeShell(pestana.id, t)}
              onCwd={setCwd}
              onAjustar={tabs.ajustar}
              onCerrar={() => tabs.cerrarPanelActivo()}
              onDividir={tabs.dividir}
              onCerrarPanel={tabs.cerrarPanelActivo}
            />
          </div>
        ))}
      </main>

      {config.ui.status_bar && (
        <StatusBar shell={titulo} cwd={cwd} paneles={hojas(tabs.actual.raiz).length} />
      )}

      {ajustes && (
        <Suspense fallback={null}>
          <SettingsPanel
            config={config}
            onChange={update}
            onClose={() => setAjustes(false)}
            onCambioSSH={recargarPerfiles}
          />
        </Suspense>
      )}

      {paleta && (
        <Suspense fallback={null}>
          <CommandPalette acciones={acciones} onCerrar={() => setPaleta(false)} />
        </Suspense>
      )}

      {mercado && (
        <Suspense fallback={null}>
          <MarketplacePanel
            onCerrar={() => {
              setMercado(false)
              recargarPlugins()
            }}
          />
        </Suspense>
      )}

      {conPanel && (
        <Suspense fallback={null}>
          <PanelPlugin
            plugin={conPanel}
            concedidos={config.plugins.concedidos[conPanel.id] ?? []}
            confianza={config.plugins.de_confianza.includes(conPanel.id)}
            onCerrar={() => setPanelAbierto(null)}
          />
        </Suspense>
      )}
    </div>
  )
}
