import { describe, expect, it } from 'vitest'
import { crearManejador, decidir, type TeclaDePortapapeles } from './portapapeles'

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

describe('el manejador de teclas', () => {
  const armar = (texto = 'hola', haySeleccion = false) => {
    const pegado: string[] = []
    const copiado: string[] = []
    let deseleccionado = 0

    const term = {
      hasSelection: () => haySeleccion,
      getSelection: () => (haySeleccion ? 'seleccionado' : ''),
      clearSelection: () => {
        deseleccionado += 1
      },
      paste: (t: string) => {
        pegado.push(t)
      },
    }

    const portapapeles = {
      writeText: async (t: string) => {
        copiado.push(t)
      },
      readText: async () => texto,
    }

    return { manejador: crearManejador(term, portapapeles), pegado, copiado, ver: () => deseleccionado }
  }

  const evento = (t: string, mods: Partial<KeyboardEvent> = {}) => {
    let cancelado = 0
    return {
      evento: {
        type: 'keydown',
        key: t,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        preventDefault: () => {
          cancelado += 1
        },
        ...mods,
      } as unknown as KeyboardEvent,
      cancelado: () => cancelado,
    }
  }

  /// La regresion que motivo el test: devolver `false` corta el manejo de xterm
  /// pero no la accion por defecto del navegador. Ctrl+V es un pegado nativo, y
  /// sin `preventDefault` el WebView disparaba ademas un evento `paste` sobre la
  /// textarea de xterm: el texto entraba dos veces.
  it('cancela la accion por defecto al pegar, o el navegador pega de nuevo', () => {
    const { manejador } = armar()
    const { evento: e, cancelado } = evento('v', { ctrlKey: true })

    expect(manejador(e)).toBe(false)
    expect(cancelado()).toBe(1)
  })

  it('tambien la cancela en los otros dos combos de pegado', () => {
    for (const mods of [{ ctrlKey: true, shiftKey: true }, { shiftKey: true }]) {
      const { manejador } = armar()
      const { evento: e, cancelado } = evento(mods.ctrlKey ? 'v' : 'Insert', mods)
      manejador(e)
      expect(cancelado()).toBe(1)
    }
  })

  /// El copy nativo corre despues de `clearSelection`, asi que sin cancelarlo
  /// podia sobrescribir el portapapeles con nada.
  it('cancela la accion por defecto al copiar', () => {
    const { manejador } = armar('hola', true)
    const { evento: e, cancelado } = evento('c', { ctrlKey: true })

    expect(manejador(e)).toBe(false)
    expect(cancelado()).toBe(1)
  })

  /// La contracara: lo que va al shell tiene que llegar entero. Cancelar aca
  /// romperia la interrupcion de procesos.
  it('no toca la accion por defecto de las teclas que van al shell', () => {
    const { manejador } = armar()
    const { evento: e, cancelado } = evento('c', { ctrlKey: true })

    expect(manejador(e)).toBe(true)
    expect(cancelado()).toBe(0)
  })

  it('pega una sola vez lo que hay en el portapapeles', async () => {
    const { manejador, pegado } = armar('texto pegado')
    manejador(evento('v', { ctrlKey: true }).evento)

    await Promise.resolve()
    expect(pegado).toEqual(['texto pegado'])
  })

  it('copia la seleccion y la suelta', async () => {
    const { manejador, copiado, ver } = armar('hola', true)
    manejador(evento('c', { ctrlKey: true }).evento)

    await Promise.resolve()
    expect(copiado).toEqual(['seleccionado'])
    expect(ver()).toBe(1)
  })

  /// Un keyup con el mismo combo no puede volver a pegar.
  it('ignora todo lo que no sea keydown', () => {
    const { manejador, pegado } = armar()
    const { evento: e, cancelado } = evento('v', { ctrlKey: true, type: 'keyup' } as Partial<KeyboardEvent>)

    expect(manejador(e)).toBe(true)
    expect(cancelado()).toBe(0)
    expect(pegado).toEqual([])
  })
})
