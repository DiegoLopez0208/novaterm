import { describe, expect, it } from 'vitest'
import { decidir, type TeclaDePortapapeles } from './portapapeles'

const tecla = (t: string, mods: Partial<TeclaDePortapapeles> = {}): TeclaDePortapapeles => ({
  tecla: t,
  ctrl: false,
  shift: false,
  alt: false,
  ...mods,
})

const CON_SELECCION = true
const SIN_SELECCION = false

describe('copiar y pegar al estilo de Windows', () => {
  /// Lo unico que no se puede romper: sin esto no hay forma de cortar un
  /// proceso y la terminal deja de servir.
  it('Ctrl+C sin seleccion va al shell, que es la interrupcion', () => {
    expect(decidir(tecla('c', { ctrl: true }), SIN_SELECCION)).toBe('al-shell')
  })

  it('Ctrl+C con seleccion copia', () => {
    expect(decidir(tecla('c', { ctrl: true }), CON_SELECCION)).toBe('copiar')
  })

  it('Ctrl+V pega', () => {
    expect(decidir(tecla('v', { ctrl: true }), SIN_SELECCION)).toBe('pegar')
  })

  it('Ctrl+Shift+C y Ctrl+Shift+V siguen andando', () => {
    expect(decidir(tecla('c', { ctrl: true, shift: true }), SIN_SELECCION)).toBe('copiar')
    expect(decidir(tecla('v', { ctrl: true, shift: true }), SIN_SELECCION)).toBe('pegar')
  })

  it('Ctrl+Insert copia y Shift+Insert pega', () => {
    expect(decidir(tecla('Insert', { ctrl: true }), CON_SELECCION)).toBe('copiar')
    expect(decidir(tecla('Insert', { shift: true }), SIN_SELECCION)).toBe('pegar')
  })

  /// AltGr llega como Ctrl+Alt en los teclados latinos. Si no se lo excluyera,
  /// escribir un caracter de la tercera fila se comeria la tecla.
  it('AltGr no dispara nada', () => {
    expect(decidir(tecla('c', { ctrl: true, alt: true }), CON_SELECCION)).toBe('al-shell')
    expect(decidir(tecla('v', { ctrl: true, alt: true }), SIN_SELECCION)).toBe('al-shell')
  })

  it('las teclas de siempre no se tocan', () => {
    expect(decidir(tecla('a'), SIN_SELECCION)).toBe('al-shell')
    expect(decidir(tecla('c'), CON_SELECCION)).toBe('al-shell')
    // Ctrl+D es el fin de archivo, Ctrl+Z suspende, Ctrl+L limpia.
    expect(decidir(tecla('d', { ctrl: true }), CON_SELECCION)).toBe('al-shell')
    expect(decidir(tecla('z', { ctrl: true }), CON_SELECCION)).toBe('al-shell')
    expect(decidir(tecla('l', { ctrl: true }), CON_SELECCION)).toBe('al-shell')
  })

  it('no importa como venga la mayuscula', () => {
    expect(decidir(tecla('C', { ctrl: true, shift: true }), SIN_SELECCION)).toBe('copiar')
  })
})
