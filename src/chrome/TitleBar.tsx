import { getCurrentWindow } from '@tauri-apps/api/window'
import { atajo } from '../acciones/registro'
import {
  Ajustes,
  CerrarPanel,
  Cerrar,
  DividirAbajo,
  DividirDerecha,
  Marca,
  Maximizar,
  Minimizar,
} from './Iconos'
import type { NovaConfig } from '../config/configBridge'

interface Props {
  title: string
  colors: NovaConfig['colors']
  paneles: number
  onSettings: () => void
  onDividir: (direccion: 'vertical' | 'horizontal') => void
  onCerrarPanel: () => void
}

const ventana = getCurrentWindow()

const NOMBRES: Record<string, string> = {
  powershell: 'PowerShell',
  pwsh: 'PowerShell 7',
  cmd: 'CMD',
  wsl: 'WSL',
  bash: 'bash',
  zsh: 'zsh',
  ssh: 'ssh',
}

/// El shell manda como titulo la ruta completa del ejecutable, que ocupa media
/// barra y no dice nada. Nos quedamos con el nombre del programa.
function limpiarTitulo(bruto: string): string {
  const ultimo = bruto.split(/[\\/]/).pop() ?? bruto
  const sinExtension = ultimo.replace(/\.exe$/i, '')
  return NOMBRES[sinExtension.toLowerCase()] ?? sinExtension
}

export function TitleBar({
  title,
  colors,
  paneles,
  onSettings,
  onDividir,
  onCerrarPanel,
}: Props) {
  // La paleta del tema activo. Es decoracion y es dato: si cambias los
  // colores, esto cambia con ellos. Van los doce cromaticos y no los dieciseis:
  // negro y blanco abren un hueco gris en el medio y cortan el ritmo.
  const ansi = [
    colors.normal.red,
    colors.normal.yellow,
    colors.normal.green,
    colors.normal.cyan,
    colors.normal.blue,
    colors.normal.magenta,
    colors.bright.red,
    colors.bright.yellow,
    colors.bright.green,
    colors.bright.cyan,
    colors.bright.blue,
    colors.bright.magenta,
  ]

  return (
    <header className="barra">
      <div className="barra-fila" data-tauri-drag-region>
        <Marca />
        <span className="marca-texto" data-tauri-drag-region>
          NovaTerm
        </span>
        <span className="punto" data-tauri-drag-region>
          ·
        </span>
        <span className="proceso" data-tauri-drag-region title={title}>
          {limpiarTitulo(title)}
        </span>

        <span className="empuje" data-tauri-drag-region />

        {/* Los splits estaban solo en atajos y no habia forma de descubrirlos.
            Ahora son botones, y el atajo va en el tooltip para aprenderlo. */}
        <button
          className="accion"
          onClick={() => onDividir('vertical')}
          title={`Dividir a la derecha — ${atajo('panel.dividir-vertical')}`}
          aria-label="Dividir a la derecha"
        >
          <DividirDerecha />
        </button>

        <button
          className="accion"
          onClick={() => onDividir('horizontal')}
          title={`Dividir abajo — ${atajo('panel.dividir-horizontal')}`}
          aria-label="Dividir abajo"
        >
          <DividirAbajo />
        </button>

        {paneles > 1 && (
          <button
            className="accion"
            onClick={onCerrarPanel}
            title={`Cerrar panel — ${atajo('panel.cerrar')}`}
            aria-label="Cerrar panel"
          >
            <CerrarPanel />
          </button>
        )}

        <span className="division-barra" />

        <button className="accion" onClick={onSettings} title={`Ajustes — ${atajo('app.ajustes')}`}>
          <Ajustes />
        </button>

        <div className="ventana-controles">
          <button onClick={() => ventana.minimize()} title="Minimizar" aria-label="Minimizar">
            <Minimizar tam={11} />
          </button>
          <button
            onClick={() => ventana.toggleMaximize()}
            title="Maximizar"
            aria-label="Maximizar"
          >
            <Maximizar tam={11} />
          </button>
          <button
            className="cerrar"
            onClick={() => ventana.close()}
            title="Cerrar"
            aria-label="Cerrar"
          >
            <Cerrar tam={11} />
          </button>
        </div>
      </div>

      <button
        className="tira"
        onClick={onSettings}
        title="Paleta del tema — abrir ajustes"
        aria-label="Paleta del tema"
      >
        {ansi.map((color, i) => (
          <i key={i} style={{ background: color }} />
        ))}
      </button>
    </header>
  )
}
