import { describe, expect, it } from 'vitest'
import {
  COMBOS,
  coincide,
  construirAcciones,
  filtrar,
  formatearAtajo,
  puntuar,
  type Accion,
  type Combo,
  type Contexto,
} from './registro'

const accion = (id: string, titulo: string, grupo = 'Grupo'): Accion => ({
  id,
  titulo,
  grupo,
  ejecutar: () => {},
})

describe('busqueda difusa', () => {
  it('sin texto no filtra nada', () => {
    expect(puntuar('Nueva pestaña', '')).toBe(0)
  })

  it('acepta letras salteadas en orden', () => {
    expect(puntuar('Nueva pestaña', 'nup')).not.toBeNull()
    expect(puntuar('Nueva pestaña', 'npt')).not.toBeNull()
  })

  it('rechaza letras en desorden', () => {
    expect(puntuar('Nueva pestaña', 'pnu')).toBeNull()
    expect(puntuar('Nueva pestaña', 'xyz')).toBeNull()
  })

  it('no distingue mayusculas', () => {
    expect(puntuar('Nueva Pestaña', 'NUEVA')).not.toBeNull()
  })

  // Lo que hace util a una paleta: escribir tres letras y que lo que buscabas
  // quede primero.
  it('premia las coincidencias mas juntas', () => {
    const pegado = puntuar('dividir', 'div')!
    const disperso = puntuar('desactivar el visor', 'div')!
    expect(pegado).toBeLessThan(disperso)
  })

  it('ordena los resultados por cercania', () => {
    const acciones = [
      accion('a', 'Recargar configuración'),
      accion('b', 'Dividir a la derecha'),
      accion('c', 'Duplicar pestaña'),
    ]

    const resultado = filtrar(acciones, 'div')

    expect(resultado[0].id).toBe('b')
  })

  it('busca tambien por el grupo', () => {
    const acciones = [accion('a', 'Cerrar', 'Paneles'), accion('b', 'Cerrar', 'Pestañas')]

    const resultado = filtrar(acciones, 'panel')

    expect(resultado[0].id).toBe('a')
  })

  it('devuelve vacio cuando nada coincide', () => {
    expect(filtrar([accion('a', 'Nueva pestaña')], 'zzzz')).toEqual([])
  })
})

/// La combinacion estaba escrita en cuatro lugares —el handler global, la
/// paleta, los tooltips y el menu contextual— y ya se habian desincronizado.
/// Ahora sale toda de COMBOS, y esto es lo que evita que vuelva a pasar.
describe('tabla de atajos', () => {
  const entradas = Object.entries(COMBOS) as [string, Combo][]

  it('no hay dos acciones con el mismo atajo', () => {
    const huellas = entradas.map(([, combo]) =>
      [...combo.teclas].sort().join('|') +
      `:${combo.ctrl ?? false}:${combo.shift ?? false}:${combo.alt ?? false}`,
    )

    expect(new Set(huellas).size).toBe(huellas.length)
  })

  it('todo combo se puede mostrar como texto', () => {
    for (const [id, combo] of entradas) {
      expect(formatearAtajo(combo), id).toMatch(/\S/)
    }
  })

  it('el texto del atajo dice los modificadores que exige', () => {
    expect(formatearAtajo(COMBOS['pestana.nueva'])).toBe('Ctrl+Shift+T')
    expect(formatearAtajo(COMBOS['app.ajustes'])).toBe('Ctrl+,')
    expect(formatearAtajo(COMBOS['panel.anterior'])).toBe('Ctrl+Shift+←')
    expect(formatearAtajo(COMBOS['app.pantalla-completa'])).toBe('f11')
  })
})

const tecla = (key: string, mods: Partial<KeyboardEvent> = {}) =>
  ({ key, ctrlKey: false, shiftKey: false, altKey: false, ...mods }) as KeyboardEvent

/// Un contexto con todos los callbacks vacios: lo que se prueba aca son los
/// atajos y los titulos, no lo que hace cada accion.
const contextoDePrueba = (): Contexto => ({
  perfiles: [],
  config: { font: { size: 14 } } as unknown as Contexto['config'],
  nuevaPestana: () => {},
  duplicar: () => {},
  cerrarPestana: () => {},
  irAPestana: () => {},
  moverPestana: () => {},
  dividir: () => {},
  cerrarPanel: () => {},
  moverPanel: () => {},
  abrirAjustes: () => {},
  alternarPaleta: () => {},
  buscar: () => {},
  pantallaCompleta: () => {},
  zoom: () => {},
  aplicarConfig: () => {},
  recargarConfig: () => {},
  redetectarShells: () => {},
})

describe('coincidencia de atajos', () => {
  it('exige el modificador que pide el combo', () => {
    expect(coincide(COMBOS['pestana.nueva'], tecla('T', { ctrlKey: true, shiftKey: true }))).toBe(
      true,
    )
    expect(coincide(COMBOS['pestana.nueva'], tecla('t', { ctrlKey: true }))).toBe(false)
  })

  /// Sin exigir la ausencia, Ctrl+Shift+Tab dispararia tambien "pestaña
  /// siguiente" y las dos acciones se pisarian.
  it('exige la ausencia del modificador que no pide', () => {
    expect(coincide(COMBOS['pestana.siguiente'], tecla('Tab', { ctrlKey: true }))).toBe(true)
    expect(
      coincide(COMBOS['pestana.siguiente'], tecla('Tab', { ctrlKey: true, shiftKey: true })),
    ).toBe(false)
    expect(coincide(COMBOS['pestana.anterior'], tecla('Tab', { ctrlKey: true, shiftKey: true }))).toBe(
      true,
    )
  })

  /// En el teclado ingles el `+` es Shift+`=` y en el latino esta suelto.
  it('el zoom acepta las dos distribuciones', () => {
    expect(coincide(COMBOS['fuente.aumentar'], tecla('+', { ctrlKey: true }))).toBe(true)
    expect(coincide(COMBOS['fuente.aumentar'], tecla('=', { ctrlKey: true, shiftKey: true }))).toBe(
      true,
    )
  })

  /// AltGr llega como Ctrl+Alt en los teclados latinos: si un atajo de Ctrl se
  /// disparara con Alt puesto, escribir `@` o `#` activaria acciones.
  it('un atajo de Ctrl no se dispara con AltGr', () => {
    expect(coincide(COMBOS['app.ajustes'], tecla(',', { ctrlKey: true, altKey: true }))).toBe(false)
  })

  /// Copiar y pegar los resuelve xterm dentro del panel, que es el unico que
  /// sabe si hay seleccion. Si estuvieran tambien en la lista de acciones, el
  /// handler global se comeria el Ctrl+C y el proceso no se podria interrumpir.
  it('copiar y pegar no son acciones del handler global', () => {
    const acciones = construirAcciones(contextoDePrueba())

    const ctrlC = tecla('c', { ctrlKey: true })
    const ctrlV = tecla('v', { ctrlKey: true })

    expect(acciones.find((a) => a.combo && coincide(a.combo, ctrlC))).toBeUndefined()
    expect(acciones.find((a) => a.combo && coincide(a.combo, ctrlV))).toBeUndefined()
  })

  it('toda accion con atajo se puede ejecutar y mostrar', () => {
    for (const accion of construirAcciones(contextoDePrueba())) {
      expect(typeof accion.ejecutar, accion.id).toBe('function')
      if (accion.combo) expect(formatearAtajo(accion.combo), accion.id).toMatch(/\S/)
    }
  })
})
