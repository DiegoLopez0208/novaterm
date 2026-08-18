import { idDeDivision, type Panel, type Perfil } from '../tabs/modelo'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface PanelUbicado {
  id: string
  perfil?: Perfil
  rect: Rect
}

export interface SeparadorUbicado {
  id: string
  direccion: 'vertical' | 'horizontal'
  rect: Rect
  /** Area de la division a la que pertenece. Al arrastrar, la proporcion es
   *  relativa a este tramo y no al contenedor entero: en divisiones anidadas
   *  son cosas distintas. */
  area: Rect
}

export interface Disposicion {
  paneles: PanelUbicado[]
  separadores: SeparadorUbicado[]
}

const COMPLETO: Rect = { x: 0, y: 0, w: 1, h: 1 }

/// Aplana el arbol a rectangulos en fracciones del contenedor.
///
/// El motivo de aplanar: si los paneles se renderizaran anidados, al dividir
/// uno React lo veria cambiar de padre y lo volveria a montar, matando el PTY
/// que ya tenia adentro. Posicionados en una lista plana, cada terminal se
/// queda donde esta y solo le cambian las coordenadas.
export function disposicion(raiz: Panel, rect: Rect = COMPLETO): Disposicion {
  if (raiz.tipo === 'hoja') {
    return { paneles: [{ id: raiz.id, perfil: raiz.perfil, rect }], separadores: [] }
  }

  const vertical = raiz.direccion === 'vertical'
  const primero = raiz.proporcion

  const rectA: Rect = vertical
    ? { ...rect, w: rect.w * primero }
    : { ...rect, h: rect.h * primero }

  const rectB: Rect = vertical
    ? { ...rect, x: rect.x + rect.w * primero, w: rect.w * (1 - primero) }
    : { ...rect, y: rect.y + rect.h * primero, h: rect.h * (1 - primero) }

  const separador: SeparadorUbicado = {
    id: idDeDivision(raiz),
    direccion: raiz.direccion,
    rect: vertical
      ? { x: rect.x + rect.w * primero, y: rect.y, w: 0, h: rect.h }
      : { x: rect.x, y: rect.y + rect.h * primero, w: rect.w, h: 0 },
    area: rect,
  }

  const a = disposicion(raiz.a, rectA)
  const b = disposicion(raiz.b, rectB)

  return {
    paneles: [...a.paneles, ...b.paneles],
    separadores: [separador, ...a.separadores, ...b.separadores],
  }
}

export function porcentaje(valor: number): string {
  return `${valor * 100}%`
}
