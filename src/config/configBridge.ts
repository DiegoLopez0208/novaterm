import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

// Los nombres van en snake_case porque asi los serializa serde del lado Rust.
// Traducirlos aca solo agregaria una capa mas para mantener sincronizada.
export interface Palette {
  black: string
  red: string
  green: string
  yellow: string
  blue: string
  magenta: string
  cyan: string
  white: string
}

/// Un perfil que agrego el usuario. Es la misma forma que el `Profile` de
/// Rust, que tambien describe los que la app detecta sola.
export interface PerfilPropio {
  id: string
  name: string
  command: string
  args: string[]
  icon: string
  cwd: string | null
  detectado: boolean
}

export interface NovaConfig {
  window: {
    opacity: number
    blur: boolean
    padding: number
    decorations: boolean
  }
  font: {
    family: string
    size: number
    line_height: number
    letter_spacing: number
    ligatures: boolean
  }
  cursor: {
    style: string
    blink: boolean
  }
  terminal: {
    scrollback: number
    copy_on_select: boolean
    gpu: boolean
  }
  shell: {
    default_profile: string | null
  }
  ui: {
    tab_bar: boolean
    status_bar: boolean
    animations: boolean
    welcome: boolean
  }
  colors: {
    background: string
    foreground: string
    cursor: string
    selection: string
    normal: Palette
    bright: Palette
  }
  profiles: PerfilPropio[]
}

export function getConfig(): Promise<NovaConfig> {
  return invoke<NovaConfig>('config_get')
}

export function getConfigPath(): Promise<string> {
  return invoke<string>('config_path')
}

export function saveConfig(config: NovaConfig): Promise<void> {
  return invoke('config_save', { config })
}

export function reloadConfig(): Promise<NovaConfig> {
  return invoke<NovaConfig>('config_reload')
}

export function onConfigChanged(
  handler: (config: NovaConfig) => void,
): Promise<UnlistenFn> {
  return listen<NovaConfig>('config://changed', (event) => handler(event.payload))
}

export function onConfigError(handler: (message: string) => void): Promise<UnlistenFn> {
  return listen<{ message: string }>('config://error', (event) =>
    handler(event.payload.message),
  )
}

// El fondo de la terminal necesita alpha para que se vea el acrilico de la
// ventana. El resto de los colores van opacos: si el texto tambien fuera
// translucido no se leeria.
/// La fuente de simbolos va siempre al final de la cadena, elija el usuario lo
/// que elija: es lo que hace que un prompt de Starship se vea con cualquier
/// familia, incluidas las del sistema que nadie parcheo con Nerd Font.
export const FUENTE_SIMBOLOS = "'Simbolos Nova'"

export function conSimbolos(familia: string): string {
  if (familia.includes('Simbolos Nova')) return familia

  const partes = familia.split(',').map((p) => p.trim())
  // Antes de `monospace`, no despues: el generico del final atrapa cualquier
  // caracter y la fuente de simbolos no llegaria a verse nunca.
  if (partes.length > 1 && partes[partes.length - 1] === 'monospace') {
    partes.splice(partes.length - 1, 0, FUENTE_SIMBOLOS)
  } else {
    partes.push(FUENTE_SIMBOLOS)
  }
  return partes.join(', ')
}

export function withAlpha(hex: string, alpha: number): string {
  const limpio = hex.replace('#', '')
  const completo =
    limpio.length === 3
      ? limpio
          .split('')
          .map((c) => c + c)
          .join('')
      : limpio
  const r = parseInt(completo.slice(0, 2), 16)
  const g = parseInt(completo.slice(2, 4), 16)
  const b = parseInt(completo.slice(4, 6), 16)
  if ([r, g, b].some(Number.isNaN)) return hex
  const a = Math.min(1, Math.max(0, alpha))
  return `rgba(${r}, ${g}, ${b}, ${a})`
}
