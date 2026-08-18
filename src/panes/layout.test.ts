import { describe, expect, it } from 'vitest'
import { crearPestana, dividir, type Division } from '../tabs/modelo'
import { disposicion } from './layout'

describe('disposicion de paneles', () => {
  it('un solo panel ocupa todo', () => {
    const pestana = crearPestana()
    const { paneles, separadores } = disposicion(pestana.raiz)

    expect(paneles).toHaveLength(1)
    expect(paneles[0].rect).toEqual({ x: 0, y: 0, w: 1, h: 1 })
    expect(separadores).toHaveLength(0)
  })

  it('una division vertical parte el ancho', () => {
    const pestana = crearPestana()
    const { raiz } = dividir(pestana.raiz, pestana.activo, 'vertical')
    const { paneles, separadores } = disposicion(raiz)

    expect(paneles[0].rect).toEqual({ x: 0, y: 0, w: 0.5, h: 1 })
    expect(paneles[1].rect).toEqual({ x: 0.5, y: 0, w: 0.5, h: 1 })
    expect(separadores[0].rect.x).toBe(0.5)
    expect(separadores[0].direccion).toBe('vertical')
  })

  it('una division horizontal parte el alto', () => {
    const pestana = crearPestana()
    const { raiz } = dividir(pestana.raiz, pestana.activo, 'horizontal')
    const { paneles } = disposicion(raiz)

    expect(paneles[0].rect).toEqual({ x: 0, y: 0, w: 1, h: 0.5 })
    expect(paneles[1].rect).toEqual({ x: 0, y: 0.5, w: 1, h: 0.5 })
  })

  it('las divisiones anidadas se calculan dentro del padre', () => {
    const pestana = crearPestana()
    const paso1 = dividir(pestana.raiz, pestana.activo, 'vertical')
    const paso2 = dividir(paso1.raiz, paso1.nuevo, 'horizontal')
    const { paneles, separadores } = disposicion(paso2.raiz)

    expect(paneles).toHaveLength(3)
    // El de la izquierda no se entera de lo que pasa a la derecha.
    expect(paneles[0].rect).toEqual({ x: 0, y: 0, w: 0.5, h: 1 })
    // Los dos de la derecha comparten la mitad derecha, uno arriba del otro.
    expect(paneles[1].rect).toEqual({ x: 0.5, y: 0, w: 0.5, h: 0.5 })
    expect(paneles[2].rect).toEqual({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 })
    expect(separadores).toHaveLength(2)
  })

  // Los rectangulos tienen que cubrir el area entera: un hueco seria una franja
  // transparente por la que se veria el fondo.
  it('los paneles cubren todo el area sin superponerse', () => {
    const pestana = crearPestana()
    const paso1 = dividir(pestana.raiz, pestana.activo, 'vertical')
    const paso2 = dividir(paso1.raiz, paso1.nuevo, 'horizontal')
    const paso3 = dividir(paso2.raiz, paso2.nuevo, 'vertical')

    const { paneles } = disposicion(paso3.raiz)
    const area = paneles.reduce((suma, p) => suma + p.rect.w * p.rect.h, 0)

    expect(area).toBeCloseTo(1, 6)
  })

  it('respeta una proporcion desbalanceada', () => {
    const pestana = crearPestana()
    const { raiz } = dividir(pestana.raiz, pestana.activo, 'vertical')
    const conProporcion: Division = { ...(raiz as Division), proporcion: 0.25 }

    const { paneles } = disposicion(conProporcion)

    expect(paneles[0].rect.w).toBeCloseTo(0.25)
    expect(paneles[1].rect.x).toBeCloseTo(0.25)
    expect(paneles[1].rect.w).toBeCloseTo(0.75)
  })
})
