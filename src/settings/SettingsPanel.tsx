import { useMemo, useState, type ReactNode } from 'react'
import { Cerrar } from '../chrome/Iconos'
import type { NovaConfig, Palette } from '../config/configBridge'
import { fuentesDisponibles, TEMAS } from './presets'
import { SeccionSSH } from './SeccionSSH'
import { SeccionPerfiles } from './SeccionPerfiles'

type Seccion = 'apariencia' | 'terminal' | 'colores' | 'perfiles' | 'ssh'

interface Props {
  config: NovaConfig
  onChange: (config: NovaConfig) => void
  onClose: () => void
  onCambioSSH: () => void
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
  apariencia: 'Apariencia',
  terminal: 'Terminal',
  colores: 'Colores',
  perfiles: 'Perfiles',
  ssh: 'SSH',
}

export function SettingsPanel({ config, onChange, onClose, onCambioSSH }: Props) {
  const [seccion, setSeccion] = useState<Seccion>('apariencia')
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
      <aside className="settings" role="dialog" aria-label="Configuración">
        <header className="settings-head">
          <strong>Configuración</strong>
          <button className="icono" onClick={onClose} aria-label="Cerrar">
            <Cerrar tam={12} />
          </button>
        </header>

        <nav className="settings-tabs">
          {(Object.keys(TITULOS) as Seccion[]).map((s) => (
            <button
              key={s}
              className={s === seccion ? 'activa' : ''}
              onClick={() => setSeccion(s)}
            >
              {TITULOS[s]}
            </button>
          ))}
        </nav>

        <div className="settings-cuerpo">
          {seccion === 'apariencia' && (
            <>
              <p className="grupo">Tipografía</p>
              <Campo etiqueta="Fuente">
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
                    <option value={config.font.family}>Personalizada</option>
                  )}
                </select>
              </Campo>

              <Deslizador
                etiqueta="Tamaño"
                valor={config.font.size}
                min={8}
                max={28}
                paso={0.5}
                sufijo="px"
                onChange={(v) => set('font', { ...config.font, size: v })}
              />

              <Deslizador
                etiqueta="Alto de línea"
                valor={config.font.line_height}
                min={0.8}
                max={2}
                paso={0.05}
                onChange={(v) => set('font', { ...config.font, line_height: v })}
              />

              <Deslizador
                etiqueta="Espaciado"
                valor={config.font.letter_spacing}
                min={-2}
                max={4}
                paso={0.1}
                sufijo="px"
                onChange={(v) => set('font', { ...config.font, letter_spacing: v })}
              />

              <div className="separador" />
              <p className="grupo">Ventana</p>

              <Deslizador
                etiqueta="Opacidad del fondo"
                valor={config.window.opacity}
                min={0.2}
                max={1}
                paso={0.01}
                formato={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => set('window', { ...config.window, opacity: v })}
              />

              <Interruptor
                etiqueta="Desenfoque de fondo"
                nota="se aplica al reiniciar"
                valor={config.window.blur}
                onChange={(v) => set('window', { ...config.window, blur: v })}
              />

              <Deslizador
                etiqueta="Margen interno"
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
                  <option value="bar">Barra</option>
                  <option value="block">Bloque</option>
                  <option value="underline">Subrayado</option>
                </select>
              </Campo>

              <Interruptor
                etiqueta="Cursor parpadeante"
                valor={config.cursor.blink}
                onChange={(v) => set('cursor', { ...config.cursor, blink: v })}
              />

              <div className="separador" />
              <p className="grupo">Búfer</p>

              <Deslizador
                etiqueta="Historial"
                valor={config.terminal.scrollback}
                min={500}
                max={100000}
                paso={500}
                formato={(v) => `${v.toLocaleString('es')} líneas`}
                onChange={(v) =>
                  set('terminal', { ...config.terminal, scrollback: Math.round(v) })
                }
              />

              <Interruptor
                etiqueta="Copiar al seleccionar"
                valor={config.terminal.copy_on_select}
                onChange={(v) => set('terminal', { ...config.terminal, copy_on_select: v })}
              />

              <Interruptor
                etiqueta="Ligaduras"
                valor={config.font.ligatures}
                onChange={(v) => set('font', { ...config.font, ligatures: v })}
              />

              {/* Estas tres vivian solo en el config.toml, aunque el README
                  prometia que todo se cambia desde aca. */}
              <Interruptor
                etiqueta="Dibujar con la GPU"
                valor={config.terminal.gpu}
                onChange={(v) => set('terminal', { ...config.terminal, gpu: v })}
              />

              <Interruptor
                etiqueta="Bienvenida al abrir un panel"
                valor={config.ui.welcome}
                onChange={(v) => set('ui', { ...config.ui, welcome: v })}
              />

              <Interruptor
                etiqueta="Barra de pestañas"
                valor={config.ui.tab_bar}
                onChange={(v) => set('ui', { ...config.ui, tab_bar: v })}
              />

              <Interruptor
                etiqueta="Barra de estado"
                valor={config.ui.status_bar}
                onChange={(v) => set('ui', { ...config.ui, status_bar: v })}
              />
            </>
          )}

          {seccion === 'perfiles' && <SeccionPerfiles config={config} onChange={onChange} />}

          {seccion === 'ssh' && <SeccionSSH onCambio={onCambioSSH} />}

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
                etiqueta="Fondo"
                valor={config.colors.background}
                onChange={(v) => set('colors', { ...config.colors, background: v })}
              />
              <Color
                etiqueta="Texto"
                valor={config.colors.foreground}
                onChange={(v) => set('colors', { ...config.colors, foreground: v })}
              />
              <Color
                etiqueta="Cursor"
                valor={config.colors.cursor}
                onChange={(v) => set('colors', { ...config.colors, cursor: v })}
              />

              <div className="separador" />
              <p className="grupo">Normales</p>
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

              <p className="grupo">Brillantes</p>
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
