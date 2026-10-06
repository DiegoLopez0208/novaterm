import { useMemo, useState, type ReactNode } from 'react'
import { Cerrar } from '../chrome/Iconos'
import type { NovaConfig, Palette } from '../config/configBridge'
import { fuentesDisponibles, TEMAS } from './presets'
import { SeccionSSH } from './SeccionSSH'
import { ProfilesSection } from './ProfilesSection'
import { PluginsSection } from './PluginsSection'
import { useDialogFocus } from '../chrome/useDialogFocus'

type Seccion = 'apariencia' | 'terminal' | 'colores' | 'perfiles' | 'ssh' | 'plugins'

interface Props {
  config: NovaConfig
  onChange: (config: NovaConfig) => void
  onClose: () => void
  onCambioSSH: () => void
  initialSection?: Seccion
}

const CLAVES_PALETA: (keyof Palette)[] = [
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
]

const TITULOS: Record<Seccion, string> = {
  apariencia: 'Appearance',
  terminal: 'Terminal',
  colores: 'Colors',
  perfiles: 'Profiles',
  ssh: 'SSH',
  plugins: 'Plugins & AI',
}

export function SettingsPanel({ config, onChange, onClose, onCambioSSH, initialSection = 'apariencia' }: Props) {
  const [seccion, setSeccion] = useState<Seccion>(initialSection)
  const dialog = useDialogFocus<HTMLElement>(onClose)
  // Solo las que estan instaladas de verdad: elegir una que falta no cambiaria
  // nada en pantalla y pareceria un bug.
  const fuentes = useMemo(fuentesDisponibles, [])

  // Cada control manda el objeto entero ya modificado: la config es chica y asi
  // no hace falta un reducer con una accion por campo.
  const set = <K extends keyof NovaConfig>(clave: K, valor: NovaConfig[K]) =>
    onChange({ ...config, [clave]: valor })

  return (
    <>
      <div className="settings-fondo" onClick={onClose} />
      <aside className="settings" role="dialog" aria-modal="true" aria-label="Settings" ref={dialog} tabIndex={-1}>
        <header className="settings-head">
          <strong>Settings</strong>
          <button className="icono" onClick={onClose} aria-label="Close">
            <Cerrar tam={12} />
          </button>
        </header>

        <nav className="settings-tabs">
          {(Object.keys(TITULOS) as Seccion[]).map((s) => (
            <button
              key={s}
              className={s === seccion ? 'activa' : ''}
              aria-pressed={s === seccion}
              onClick={() => setSeccion(s)}
            >
              {TITULOS[s]}
            </button>
          ))}
        </nav>

        <div className="settings-cuerpo">
          <div className="settings-intro"><span className="eyebrow">PERSONALIZE NOVATERM</span><h2>{TITULOS[seccion]}</h2><p>Changes are saved automatically.</p></div>
          {seccion === 'apariencia' && (
            <>
              <p className="grupo">Typography</p>
              <Campo etiqueta="Font">
                <select
                  value={config.font.family}
                  onChange={(e) => set('font', { ...config.font, family: e.target.value })}
                >
                  {fuentes.map((f) => (
                    <option key={f.valor} value={f.valor}>
                      {f.nombre}
                    </option>
                  ))}
                  {!fuentes.some((f) => f.valor === config.font.family) && (
                    <option value={config.font.family}>Custom</option>
                  )}
                </select>
              </Campo>

              <Deslizador
                etiqueta="Size"
                valor={config.font.size}
                min={8}
                max={28}
                paso={0.5}
                sufijo="px"
                onChange={(v) => set('font', { ...config.font, size: v })}
              />

              <Deslizador
                etiqueta="Line height"
                valor={config.font.line_height}
                min={0.8}
                max={2}
                paso={0.05}
                onChange={(v) => set('font', { ...config.font, line_height: v })}
              />

              <Deslizador
                etiqueta="Letter spacing"
                valor={config.font.letter_spacing}
                min={-2}
                max={4}
                paso={0.1}
                sufijo="px"
                onChange={(v) => set('font', { ...config.font, letter_spacing: v })}
              />

              <div className="separador" />
              <p className="grupo">Window</p>

              <Deslizador
                etiqueta="Background opacity"
                valor={config.window.opacity}
                min={0.2}
                max={1}
                paso={0.01}
                formato={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => set('window', { ...config.window, opacity: v })}
              />

              <Interruptor
                etiqueta="Background blur"
                nota="Windows compositor acrylic"
                valor={config.window.blur}
                onChange={(v) => set('window', { ...config.window, blur: v })}
              />

              <Deslizador
                etiqueta="Padding"
                valor={config.window.padding}
                min={0}
                max={40}
                paso={1}
                sufijo="px"
                onChange={(v) => set('window', { ...config.window, padding: Math.round(v) })}
              />
            </>
          )}

          {seccion === 'terminal' && (
            <>
              <Campo etiqueta="Cursor">
                <select
                  value={config.cursor.style}
                  onChange={(e) => set('cursor', { ...config.cursor, style: e.target.value })}
                >
                  <option value="bar">Bar</option>
                  <option value="block">Block</option>
                  <option value="underline">Underline</option>
                </select>
              </Campo>

              <Interruptor
                etiqueta="Blinking cursor"
                valor={config.cursor.blink}
                onChange={(v) => set('cursor', { ...config.cursor, blink: v })}
              />

              <div className="separador" />
              <p className="grupo">Buffer</p>

              {/* El tope es por panel, no por ventana: con varias pestañas
                  divididas se multiplica. 100.000 lines per pane llevaban el
                  proceso a cifras absurdas sin que se notara de dónde salían. */}
              <Deslizador
                etiqueta="Scrollback"
                valor={config.terminal.scrollback}
                min={500}
                max={50000}
                paso={500}
                formato={(v) => `${v.toLocaleString('en')} lines per pane`}
                onChange={(v) =>
                  set('terminal', { ...config.terminal, scrollback: Math.round(v) })
                }
              />

              <Interruptor
                etiqueta="Copy on selection"
                valor={config.terminal.copy_on_select}
                onChange={(v) => set('terminal', { ...config.terminal, copy_on_select: v })}
              />

              <Deslizador
                etiqueta="Smooth history scrolling"
                valor={config.terminal.smooth_scroll_ms ?? 120}
                min={0}
                max={250}
                paso={10}
                formato={(v) => v === 0 ? 'Off' : `${v} ms`}
                onChange={(v) => set('terminal', { ...config.terminal, smooth_scroll_ms: Math.round(v) })}
              />
              <p className="nota">Shorter durations feel more responsive. System reduced-motion preferences take priority.</p>

              <Interruptor
                etiqueta="Animations"
                valor={config.ui.animations}
                onChange={(v) => set('ui', { ...config.ui, animations: v })}
              />

              <Interruptor
                etiqueta="Ligatures"
                valor={config.font.ligatures}
                onChange={(v) => set('font', { ...config.font, ligatures: v })}
              />

              {/* Estas tres vivian solo en el config.toml, aunque el README
                  prometia que todo se cambia desde aca. */}
              <Interruptor
                etiqueta="GPU rendering"
                valor={config.terminal.gpu}
                onChange={(v) => set('terminal', { ...config.terminal, gpu: v })}
              />

              <Interruptor
                etiqueta="Welcome on new pane"
                valor={config.ui.welcome}
                onChange={(v) => set('ui', { ...config.ui, welcome: v })}
              />

              <Interruptor
                etiqueta="Tab bar"
                valor={config.ui.tab_bar}
                onChange={(v) => set('ui', { ...config.ui, tab_bar: v })}
              />

              <Interruptor
                etiqueta="Status bar"
                valor={config.ui.status_bar}
                onChange={(v) => set('ui', { ...config.ui, status_bar: v })}
              />
            </>
          )}

          {seccion === 'perfiles' && <ProfilesSection config={config} onChange={onChange} />}

          {seccion === 'ssh' && <SeccionSSH onCambio={onCambioSSH} />}
          {seccion === 'plugins' && <PluginsSection config={config} onChange={onChange} />}

          {seccion === 'colores' && (
            <>
              <div className="temas">
                {TEMAS.map((tema) => (
                  <button
                    key={tema.nombre}
                    className="tema"
                    onClick={() => set('colors', tema.colores)}
                  >
                    <span className="muestra" style={{ background: tema.colores.background }}>
                      {[
                        tema.colores.normal.red,
                        tema.colores.normal.green,
                        tema.colores.normal.blue,
                        tema.colores.normal.magenta,
                      ].map((c) => (
                        <i key={c} style={{ background: c }} />
                      ))}
                    </span>
                    {tema.nombre}
                  </button>
                ))}
              </div>

              <div className="separador" />
              <p className="grupo">Base</p>

              <Color
                etiqueta="Background"
                valor={config.colors.background}
                onChange={(v) => set('colors', { ...config.colors, background: v })}
              />
              <Color
                etiqueta="Text"
                valor={config.colors.foreground}
                onChange={(v) => set('colors', { ...config.colors, foreground: v })}
              />
              <Color
                etiqueta="Cursor"
                valor={config.colors.cursor}
                onChange={(v) => set('colors', { ...config.colors, cursor: v })}
              />

              <div className="separador" />
              <p className="grupo">Normal</p>
              <div className="paleta-colores">
                {CLAVES_PALETA.map((clave) => (
                  <input
                    key={clave}
                    type="color"
                    title={clave}
                    value={config.colors.normal[clave]}
                    onChange={(e) =>
                      set('colors', {
                        ...config.colors,
                        normal: { ...config.colors.normal, [clave]: e.target.value },
                      })
                    }
                  />
                ))}
              </div>

              <p className="grupo">Bright</p>
              <div className="paleta-colores">
                {CLAVES_PALETA.map((clave) => (
                  <input
                    key={clave}
                    type="color"
                    title={clave}
                    value={config.colors.bright[clave]}
                    onChange={(e) =>
                      set('colors', {
                        ...config.colors,
                        bright: { ...config.colors.bright, [clave]: e.target.value },
                      })
                    }
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  )
}

function Campo({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <label className="campo">
      <span>{etiqueta}</span>
      {children}
    </label>
  )
}

function Deslizador({
  etiqueta,
  valor,
  min,
  max,
  paso,
  sufijo,
  formato,
  onChange,
}: {
  etiqueta: string
  valor: number
  min: number
  max: number
  paso: number
  sufijo?: string
  formato?: (v: number) => string
  onChange: (v: number) => void
}) {
  return (
    <label className="campo deslizador">
      <span>
        {etiqueta}
        <em>{formato ? formato(valor) : `${valor}${sufijo ?? ''}`}</em>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={paso}
        value={valor}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}

function Interruptor({
  etiqueta,
  nota,
  valor,
  onChange,
}: {
  etiqueta: string
  nota?: string
  valor: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="campo interruptor">
      <span>
        {etiqueta}
        {nota && <em>{nota}</em>}
      </span>
      <input type="checkbox" checked={valor} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

function Color({
  etiqueta,
  valor,
  onChange,
}: {
  etiqueta: string
  valor: string
  onChange: (v: string) => void
}) {
  return (
    <label className="campo color">
      <span>{etiqueta}</span>
      <input type="color" value={valor} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}
