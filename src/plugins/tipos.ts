/// Espejo de los tipos de Rust. Los nombres coinciden con los del manifiesto y
/// con los que serializa serde, asi que un cambio de un lado rompe el `tsc` del
/// otro en vez de fallar en tiempo de ejecucion.

export type Permiso =
  | 'terminal.read'
  | 'terminal.write'
  | 'ui.panel'
  | 'llm.complete'
  | 'commands'

/// Lo que se le muestra al usuario en la pantalla de consentimiento. Dice la
/// consecuencia, no el nombre tecnico: nadie evalua un permiso llamado
/// "terminal.write".
export const DESCRIPCION_PERMISO: Record<Permiso, string> = {
  'terminal.read': 'Leer lo que aparece en tu terminal, incluido el historial',
  'terminal.write': 'Escribir comandos en tu terminal y ejecutarlos',
  'ui.panel': 'Mostrar su propio panel dentro de NovaTerm',
  'llm.complete': 'Consultar al modelo de IA con tu clave',
  commands: 'Agregar entradas a la paleta de comandos',
}

/// Los que no se conceden sin mirar. Se marcan aparte en la interfaz.
export function esDelicado(permiso: Permiso): boolean {
  return permiso === 'terminal.write' || permiso === 'terminal.read'
}

export interface ComandoPlugin {
  id: string
  title: string
  default_key?: string | null
}

export interface WidgetPlugin {
  id: string
  command: string
  args: string[]
  intervalo_ms: number
  prefijo: string
  usar_cwd: boolean
}

export interface Plugin {
  id: string
  name: string
  version: string
  description: string
  widgets: WidgetPlugin[]
  profiles: unknown[]
  /// Sin `entry` el plugin es declarativo: aporta widgets y perfiles, no corre
  /// codigo y no puede pedir permisos.
  entry?: string | null
  permissions: Permiso[]
  commands: ComandoPlugin[]
  carpeta: string
}

export interface VersionPlugin {
  version: string
  url: string
  sha256: string
  firma: string
}

/// Ficha del catalogo remoto.
export interface Ficha {
  id: string
  name: string
  description: string
  permissions: Permiso[]
  clave_publica: string
  versions: VersionPlugin[]
}

export type Proveedor = 'anthropic' | 'openai' | 'deepseek'

export interface EstadoLlm {
  provider: Proveedor
  model: string
  tokens_por_dia: number
  hay_clave: boolean
  /// Tokens gastados hoy, por id de plugin.
  gastado: Record<string, number>
}

export interface MensajeLlm {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface RespuestaLlm {
  text: string
  tokens: number
  restante: number
}

// --- protocolo del sandbox --------------------------------------------------

/// Lo que un plugin manda al broker. `id` lo elige el plugin y solo sirve para
/// que pueda emparejar la respuesta; el broker nunca lo interpreta.
export interface PedidoRpc {
  nova: 1
  id: number
  metodo: string
  datos?: unknown
}

export interface RespuestaRpc {
  nova: 1
  id: number
  ok: boolean
  datos?: unknown
  error?: string
}

export function esPedidoRpc(valor: unknown): valor is PedidoRpc {
  if (typeof valor !== 'object' || valor === null) return false
  const p = valor as Partial<PedidoRpc>
  return p.nova === 1 && typeof p.id === 'number' && typeof p.metodo === 'string'
}
