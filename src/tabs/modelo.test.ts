import { describe, expect, it } from 'vitest'
import {
  ajustarProporcion,
  cerrarPanel,
  crearPestana,
  dividir,
  hojas,
  idDeDivision,
  vecino,
  type Division,
} from './modelo'

describe('arbol de paneles', () => {
  it('una pestaña nueva es una sola hoja activa', () => {
    const pestana = crearPestana()
    expect(pestana.raiz.tipo).toBe('hoja')
    expect(hojas(pestana.raiz)).toHaveLength(1)
    expect(pestana.activo).toBe(hojas(pestana.raiz)[0].id)
  })

  it('dividir deja el panel original y agrega uno nuevo', () => {
    const pestana = crearPestana()
    const original = pestana.activo

    const { raiz, nuevo } = dividir(pestana.raiz, original, 'vertical')

    expect(raiz.tipo).toBe('division')
    expect(hojas(raiz).map((h) => h.id)).toEqual([original, nuevo])
    expect((raiz as Division).proporcion).toBe(0.5)
  })

  it('el panel nuevo hereda el perfil del que se dividio', () => {
    const pestana = crearPestana({ shell: 'pwsh.exe' })
    const { raiz, nuevo } = dividir(pestana.raiz, pestana.activo, 'horizontal')

    const creado = hojas(raiz).find((h) => h.id === nuevo)
    expect(creado?.perfil?.shell).toBe('pwsh.exe')
  })

  it('divide en profundidad sin tocar la otra rama', () => {
    const pestana = crearPestana()
    const primero = pestana.activo
    const paso1 = dividir(pestana.raiz, primero, 'vertical')
    const paso2 = dividir(paso1.raiz, paso1.nuevo, 'horizontal')

    expect(hojas(paso2.raiz)).toHaveLength(3)
    // El primero sigue siendo el lado A de la division de arriba.
    expect(hojas((paso2.raiz as Division).a)[0].id).toBe(primero)
  })

  it('dividir un id inexistente no cambia nada', () => {
    const pestana = crearPestana()
    const { raiz, nuevo } = dividir(pestana.raiz, 'no-existe', 'vertical')

    expect(nuevo).toBe('')
    expect(raiz).toBe(pestana.raiz)
  })

  // Sin esto quedarian divisiones con un solo hijo, y la pantalla mostraria un
  // panel ocupando la mitad y el resto vacio.
  it('al cerrar un lado, el hermano ocupa toda la division', () => {
    const pestana = crearPestana()
    const primero = pestana.activo
    const { raiz, nuevo } = dividir(pestana.raiz, primero, 'vertical')

    const resultado = cerrarPanel(raiz, nuevo)

    expect(resultado?.tipo).toBe('hoja')
    expect(hojas(resultado!).map((h) => h.id)).toEqual([primero])
  })

  it('cerrar el ultimo panel devuelve null', () => {
    const pestana = crearPestana()
    expect(cerrarPanel(pestana.raiz, pestana.activo)).toBeNull()
  })

  it('cerrar en un arbol anidado conserva el resto', () => {
    const pestana = crearPestana()
    const paso1 = dividir(pestana.raiz, pestana.activo, 'vertical')
    const paso2 = dividir(paso1.raiz, paso1.nuevo, 'horizontal')

    const resultado = cerrarPanel(paso2.raiz, paso2.nuevo)

    expect(hojas(resultado!)).toHaveLength(2)
    expect(hojas(resultado!).map((h) => h.id)).toContain(pestana.activo)
  })

  it('la proporcion se limita para que ningun panel desaparezca', () => {
    const pestana = crearPestana()
    const { raiz } = dividir(pestana.raiz, pestana.activo, 'vertical')
    const id = idDeDivision(raiz as Division)

    expect((ajustarProporcion(raiz, id, 0.42) as Division).proporcion).toBeCloseTo(0.42)
    expect((ajustarProporcion(raiz, id, 0) as Division).proporcion).toBe(0.1)
    expect((ajustarProporcion(raiz, id, 5) as Division).proporcion).toBe(0.9)
  })

  it('el recorrido entre paneles da la vuelta', () => {
    const pestana = crearPestana()
    const primero = pestana.activo
    const { raiz, nuevo } = dividir(pestana.raiz, primero, 'vertical')

    expect(vecino(raiz, primero, 1)).toBe(nuevo)
    expect(vecino(raiz, nuevo, 1)).toBe(primero)
    expect(vecino(raiz, primero, -1)).toBe(nuevo)
  })
})
