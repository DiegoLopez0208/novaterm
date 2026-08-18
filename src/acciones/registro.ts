import type { Perfil } from '../tabs/modelo'
import type { NovaConfig } from '../config/configBridge'
import { TEMAS } from '../settings/presets'

/// `true` exige el modificador, `false` (o ausente) exige que **no** este
/// puesto, y `'*'` lo ignora. Lo del medio importa: sin exigir la ausencia,
/// Ctrl+Shift+T tambien dispararia la accion de Ctrl+T.
type Modificador = boolean | '*'

export interface Combo {
  /// Valores de `KeyboardEvent.key` en minuscula. Varios cuando una misma
  /// accion llega por teclas distintas segun la distribucion: en el teclado
  /// latino el `+` esta sin Shift y en el ingles es Shift+`=`.
  teclas: readonly string[]
  ctrl?: Modificador
  shift?: Modificador
  alt?: Modificador
}

export interface Accion {
  id: string
  titulo: string
  grupo: string
  combo?: Combo
  /// Solo atajo: no se lista en la paleta de comandos.
  oculta?: boolean
  ejecutar: () => void
}

export interface Contexto {
  perfiles: { id: string; name: string; command: string; args: string[] }[]
  config: NovaConfig
  nuevaPestana: (perfil?: Perfil) => void
  duplicar: () => void
  cerrarPestana: () => void
  irAPestana: (indice: number) => void
  moverPestana: (delta: number) => void
  dividir: (direccion: 'vertical' | 'horizontal') => void
  cerrarPanel: () => void
  moverPanel: (delta: number) => void
  abrirAjustes: () => void
  abrirPlugins: () => void
  alternarPaleta: () => void
  buscar: () => void
  pantallaCompleta: () => void
  zoom: (delta: number) => void
  aplicarConfig: (config: NovaConfig) => void
  recargarConfig: () => void
  redetectarShells: () => void
}

const NOMBRE_DE_TECLA: Record<string, string> = {
  arrowleft: '←',
  arrowright: '→',
  arrowup: '↑',
  arrowdown: '↓',
  tab: 'Tab',
  insert: 'Insert',
  escape: 'Esc',
  '=': '+',
}

/// El texto que ve el usuario se deriva del combo, nunca se escribe a mano: es
/// lo unico que evita que el tooltip diga una cosa y la tecla haga otra.
export function formatearAtajo(combo: Combo): string {
  const partes: string[] = []
  if (combo.ctrl === true) partes.push('Ctrl')
  if (combo.alt === true) partes.push('Alt')
  if (combo.shift === true) partes.push('Shift')

  const tecla = combo.teclas[0]
  partes.push(NOMBRE_DE_TECLA[tecla] ?? (tecla.length === 1 ? tecla.toUpperCase() : tecla))
  return partes.join('+')
}

function cumple(esperado: Modificador | undefined, presionado: boolean): boolean {
  if (esperado === '*') return true
  return presionado === (esperado === true)
}

export function coincide(combo: Combo, evento: KeyboardEvent): boolean {
  return (
    combo.teclas.includes(evento.key.toLowerCase()) &&
    cumple(combo.ctrl, evento.ctrlKey) &&
    cumple(combo.shift, evento.shiftKey) &&
    cumple(combo.alt, evento.altKey)
  )
}

/// **La** tabla de atajos. Antes la combinacion estaba escrita en cuatro
/// lugares —el handler global, la paleta, los tooltips de la barra y el menu
/// contextual— y ya se habian desincronizado. Ahora todos leen de aca: el
/// handler por el combo, y las superficies visibles por `atajo(id)`.
export const COMBOS = {
  'pestana.nueva': { teclas: ['t'], ctrl: true, shift: true },
  'pestana.cerrar': { teclas: ['w'], ctrl: true, shift: true },
  'pestana.siguiente': { teclas: ['tab'], ctrl: true },
  'pestana.anterior': { teclas: ['tab'], ctrl: true, shift: true },
  'panel.dividir-vertical': { teclas: ['d'], ctrl: true, shift: true },
  'panel.dividir-horizontal': { teclas: ['e'], ctrl: true, shift: true },
  'panel.cerrar': { teclas: ['x'], ctrl: true, shift: true },
  'panel.siguiente': { teclas: ['arrowright'], ctrl: true, shift: true },
  'panel.anterior': { teclas: ['arrowleft'], ctrl: true, shift: true },
  'terminal.buscar': { teclas: ['f'], ctrl: true, shift: true },
  // Copiar y pegar no son acciones de esta lista: los resuelve xterm dentro de
  // cada panel, que es el unico que sabe si hay seleccion. El combo vive igual
  // aca para que el menu contextual muestre lo que de verdad hace la tecla.
  'terminal.copiar': { teclas: ['c'], ctrl: true },
  'terminal.pegar': { teclas: ['v'], ctrl: true },
  'app.paleta': { teclas: ['p'], ctrl: true, shift: true },
  'app.ajustes': { teclas: [','], ctrl: true },
  'app.pantalla-completa': { teclas: ['f11'] },
  // Shift indiferente: en el teclado ingles el `+` es Shift+`=` y en el latino
  // esta suelto. Se aceptan las dos teclas y las dos formas.
  'fuente.aumentar': { teclas: ['+', '='], ctrl: true, shift: '*' },
  // Solo '-': con Shift la tecla da '_', y Ctrl+_ es el deshacer de readline.
  'fuente.reducir': { teclas: ['-'], ctrl: true, shift: '*' },
  'fuente.restablecer': { teclas: ['0'], ctrl: true },
} as const satisfies Record<string, Combo>

export type IdDeAtajo = keyof typeof COMBOS

/// Pedido de busqueda para el panel activo. Va por evento del DOM y no por
/// props: el unico que tiene la instancia de xterm sobre la que hay que buscar
/// es el `TerminalView` activo, y esta cuatro componentes mas abajo.
export const EVENTO_BUSCAR = 'nova:buscar'

/// El atajo listo para mostrar. Los tooltips y el menu contextual lo piden por
/// aca en vez de repetir la combinacion a mano.
export function atajo(id: IdDeAtajo): string {
  return formatearAtajo(COMBOS[id])
}

/// Una sola lista de acciones alimenta la paleta, y mañana los atajos
/// configurables y los menus. Si cada superficie armara la suya, terminarian
/// desincronizadas.
export function construirAcciones(ctx: Contexto): Accion[] {
  const acciones: Accion[] = [
    {
      id: 'pestana.nueva',
      titulo: 'Nueva pestaña',
      grupo: 'Pestañas',
      combo: COMBOS['pestana.nueva'],
      ejecutar: () => ctx.nuevaPestana(),
    },
    {
      id: 'plugins.abrir',
      titulo: 'Plugins: abrir el catálogo',
      grupo: 'Plugins',
      ejecutar: ctx.abrirPlugins,
    },
    {
      id: 'pestana.duplicar',
      titulo: 'Duplicar pestaña',
      grupo: 'Pestañas',
      ejecutar: ctx.duplicar,
    },
    {
      id: 'pestana.cerrar',
      titulo: 'Cerrar pestaña',
      grupo: 'Pestañas',
      combo: COMBOS['pestana.cerrar'],
      ejecutar: ctx.cerrarPestana,
    },
    {
      id: 'pestana.siguiente',
      titulo: 'Pestaña siguiente',
      grupo: 'Pestañas',
      combo: COMBOS['pestana.siguiente'],
      ejecutar: () => ctx.moverPestana(1),
    },
    {
      id: 'pestana.anterior',
      titulo: 'Pestaña anterior',
      grupo: 'Pestañas',
      combo: COMBOS['pestana.anterior'],
      ejecutar: () => ctx.moverPestana(-1),
    },
    {
      id: 'panel.dividir-vertical',
      titulo: 'Dividir a la derecha',
      grupo: 'Paneles',
      combo: COMBOS['panel.dividir-vertical'],
      ejecutar: () => ctx.dividir('vertical'),
    },
    {
      id: 'panel.dividir-horizontal',
      titulo: 'Dividir abajo',
      grupo: 'Paneles',
      combo: COMBOS['panel.dividir-horizontal'],
      ejecutar: () => ctx.dividir('horizontal'),
    },
    {
      id: 'panel.cerrar',
      titulo: 'Cerrar panel',
      grupo: 'Paneles',
      combo: COMBOS['panel.cerrar'],
      ejecutar: ctx.cerrarPanel,
    },
    {
      id: 'panel.siguiente',
      titulo: 'Panel siguiente',
      grupo: 'Paneles',
      combo: COMBOS['panel.siguiente'],
      ejecutar: () => ctx.moverPanel(1),
    },
    {
      id: 'panel.anterior',
      titulo: 'Panel anterior',
      grupo: 'Paneles',
      combo: COMBOS['panel.anterior'],
      ejecutar: () => ctx.moverPanel(-1),
    },
    {
      id: 'terminal.buscar',
      titulo: 'Buscar en la terminal',
      grupo: 'Terminal',
      combo: COMBOS['terminal.buscar'],
      ejecutar: ctx.buscar,
    },
    {
      id: 'app.paleta',
      titulo: 'Paleta de comandos',
      grupo: 'Aplicación',
      combo: COMBOS['app.paleta'],
      ejecutar: ctx.alternarPaleta,
    },
    {
      id: 'app.ajustes',
      titulo: 'Abrir configuración',
      grupo: 'Aplicación',
      combo: COMBOS['app.ajustes'],
      ejecutar: ctx.abrirAjustes,
    },
    {
      id: 'app.pantalla-completa',
      titulo: 'Pantalla completa',
      grupo: 'Aplicación',
      combo: COMBOS['app.pantalla-completa'],
      ejecutar: ctx.pantallaCompleta,
    },
    {
      id: 'app.recargar-config',
      titulo: 'Recargar configuración',
      grupo: 'Aplicación',
      ejecutar: ctx.recargarConfig,
    },
    {
      // La deteccion de shells ahora se cachea al arrancar porque corre
      // `wsl.exe`, que tarda. Si instalaste WSL o pwsh con la app abierta, esto
      // la rehace.
      id: 'app.redetectar-shells',
      titulo: 'Volver a detectar los shells',
      grupo: 'Aplicación',
      ejecutar: ctx.redetectarShells,
    },
    {
      id: 'fuente.aumentar',
      titulo: 'Agrandar la letra',
      grupo: 'Fuente',
      combo: COMBOS['fuente.aumentar'],
      ejecutar: () => ctx.zoom(1),
    },
    {
      id: 'fuente.reducir',
      titulo: 'Achicar la letra',
      grupo: 'Fuente',
      combo: COMBOS['fuente.reducir'],
      ejecutar: () => ctx.zoom(-1),
    },
    {
      id: 'fuente.restablecer',
      titulo: 'Tamaño de letra por defecto',
      grupo: 'Fuente',
      combo: COMBOS['fuente.restablecer'],
      ejecutar: () => ctx.zoom(0),
    },
  ]

  // Ctrl+Alt+1..9 salta a la pestaña n, como en Windows Terminal. Van ocultas:
  // nueve entradas mas en la paleta la volverian ilegible.
  for (let n = 1; n <= 9; n++) {
    acciones.push({
      id: `pestana.ir-${n}`,
      titulo: `Ir a la pestaña ${n}`,
      grupo: 'Pestañas',
      combo: { teclas: [String(n)], ctrl: true, alt: true },
      oculta: true,
      ejecutar: () => ctx.irAPestana(n - 1),
    })
  }

  for (const perfil of ctx.perfiles) {
    acciones.push({
      id: `perfil.${perfil.id}`,
      titulo: `Nueva pestaña: ${perfil.name}`,
      grupo: 'Perfiles',
      ejecutar: () => ctx.nuevaPestana({ shell: perfil.command, args: perfil.args }),
    })
  }

  for (const tema of TEMAS) {
    acciones.push({
      id: `tema.${tema.nombre}`,
      titulo: `Tema: ${tema.nombre}`,
      grupo: 'Temas',
      ejecutar: () => ctx.aplicarConfig({ ...ctx.config, colors: tema.colores }),
    })
  }

  return acciones
}

/// Coincidencia difusa al estilo de las paletas de comandos: las letras de la
/// busqueda tienen que aparecer en orden, no necesariamente pegadas. Devuelve
/// null si no coincide, o un puntaje donde menos es mejor.
export function puntuar(texto: string, busqueda: string): number | null {
  if (!busqueda) return 0

  const objetivo = texto.toLowerCase()
  const termino = busqueda.toLowerCase()

  let posicion = 0
  let puntaje = 0
  let anterior = -1

  for (const letra of termino) {
    const encontrada = objetivo.indexOf(letra, posicion)
    if (encontrada === -1) return null
    // Penaliza los saltos: asi "Nueva pestaña" le gana a un titulo donde las
    // mismas letras aparecen desperdigadas.
    puntaje += anterior === -1 ? encontrada : encontrada - anterior - 1
    anterior = encontrada
    posicion = encontrada + 1
  }

  return puntaje
}

export function filtrar(acciones: Accion[], busqueda: string): Accion[] {
  return acciones
    .filter((accion) => !accion.oculta)
    .map((accion) => ({
      accion,
      puntaje: puntuar(`${accion.grupo} ${accion.titulo}`, busqueda),
    }))
    .filter((r): r is { accion: Accion; puntaje: number } => r.puntaje !== null)
    .sort((a, b) => a.puntaje - b.puntaje)
    .map((r) => r.accion)
}
