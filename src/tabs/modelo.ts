import type { SpawnOptions } from '../terminal/ptyBridge'

export type Perfil = Pick<SpawnOptions, 'shell' | 'args' | 'cwd'>

export interface Hoja {
  tipo: 'hoja'
  id: string
  perfil?: Perfil
}

export interface Division {
  tipo: 'division'
  /** vertical = los paneles quedan lado a lado, partidos por una linea vertical. */
  direccion: 'vertical' | 'horizontal'
  proporcion: number
  a: Panel
  b: Panel
}

export type Panel = Hoja | Division

export interface Pestana {
  id: string
  titulo: string
  /** Nombre puesto a mano. Si existe, gana sobre el que reporta el shell. */
  alias?: string
  raiz: Panel
  activo: string
}

let contador = 0
const nuevoId = (prefijo: string) => `${prefijo}${++contador}`

export function crearPestana(perfil?: Perfil, titulo = 'shell'): Pestana {
  const hoja: Hoja = { tipo: 'hoja', id: nuevoId('panel'), perfil }
  return {
    id: nuevoId('tab'),
    titulo,
    raiz: hoja,
    activo: hoja.id,
  }
}

export function hojas(panel: Panel): Hoja[] {
  return panel.tipo === 'hoja' ? [panel] : [...hojas(panel.a), ...hojas(panel.b)]
}

export function buscarHoja(panel: Panel, id: string): Hoja | null {
  if (panel.tipo === 'hoja') return panel.id === id ? panel : null
  return buscarHoja(panel.a, id) ?? buscarHoja(panel.b, id)
}

/// Divide la hoja indicada en dos y deja el contenido existente en el primer
/// lado. Devuelve el arbol nuevo y el id del panel recien creado.
export function dividir(
  panel: Panel,
  id: string,
  direccion: Division['direccion'],
  perfil?: Perfil,
): { raiz: Panel; nuevo: string } {
  if (panel.tipo === 'hoja') {
    if (panel.id !== id) return { raiz: panel, nuevo: '' }
    const b: Hoja = { tipo: 'hoja', id: nuevoId('panel'), perfil: perfil ?? panel.perfil }
    return {
      raiz: { tipo: 'division', direccion, proporcion: 0.5, a: panel, b },
      nuevo: b.id,
    }
  }

  const izquierda = dividir(panel.a, id, direccion, perfil)
  if (izquierda.nuevo) {
    return { raiz: { ...panel, a: izquierda.raiz }, nuevo: izquierda.nuevo }
  }
  const derecha = dividir(panel.b, id, direccion, perfil)
  if (derecha.nuevo) {
    return { raiz: { ...panel, b: derecha.raiz }, nuevo: derecha.nuevo }
  }
  return { raiz: panel, nuevo: '' }
}

/// Saca un panel del arbol. Al cerrar un lado de una division, el hermano ocupa
/// el lugar de la division entera: si no, quedarian nodos con un solo hijo.
export function cerrarPanel(panel: Panel, id: string): Panel | null {
  if (panel.tipo === 'hoja') return panel.id === id ? null : panel

  const a = cerrarPanel(panel.a, id)
  const b = cerrarPanel(panel.b, id)
  if (a === null) return b
  if (b === null) return a
  if (a === panel.a && b === panel.b) return panel
  return { ...panel, a, b }
}

/// Una division no tiene id propio; se la identifica por su primer descendiente,
/// que es estable mientras la division exista.
export function idDeDivision(division: Division): string {
  return `div:${hojas(division.a)[0]?.id ?? ''}`
}

export function ajustarProporcion(panel: Panel, id: string, proporcion: number): Panel {
  if (panel.tipo === 'hoja') return panel
  if (idDeDivision(panel) === id) {
    // Los topes evitan que un panel quede en cero y ya no se pueda recuperar
    // arrastrando.
    return { ...panel, proporcion: Math.min(0.9, Math.max(0.1, proporcion)) }
  }
  return {
    ...panel,
    a: ajustarProporcion(panel.a, id, proporcion),
    b: ajustarProporcion(panel.b, id, proporcion),
  }
}

/// Siguiente panel en orden de lectura, para moverse con el teclado.
export function vecino(raiz: Panel, actual: string, paso: 1 | -1): string {
  const lista = hojas(raiz)
  if (lista.length === 0) return actual
  const indice = lista.findIndex((h) => h.id === actual)
  if (indice === -1) return lista[0].id
  const siguiente = (indice + paso + lista.length) % lista.length
  return lista[siguiente].id
}
