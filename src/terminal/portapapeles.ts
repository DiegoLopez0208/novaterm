/// Que hacer con una tecla que llega a la terminal.
///
/// - `copiar` / `pegar`: lo resuelve la app y la tecla **no** sigue viaje.
/// - `al-shell`: la tecla pasa a xterm tal cual. Es lo que tiene que devolver
///   `Ctrl+C` sin seleccion, o la terminal deja de poder interrumpir procesos.
export type Decision = 'copiar' | 'pegar' | 'al-shell'

export interface TeclaDePortapapeles {
  tecla: string
  ctrl: boolean
  shift: boolean
  alt: boolean
}

/// El comportamiento de Windows Terminal, PowerShell y CMD modernos, que es lo
/// que un usuario de Windows ya tiene en los dedos.
///
/// Vive aparte del componente porque es la regla que no se puede romper: si
/// `Ctrl+C` sin seleccion dejara de llegar al shell, no habria forma de cortar
/// un proceso y la terminal seria inservible. Aca se puede probar sin montar
/// nada.
export function decidir(evento: TeclaDePortapapeles, haySeleccion: boolean): Decision {
  // AltGr en los teclados latinos y europeos llega como Ctrl+Alt: sin esta
  // guardia, AltGr+C se comeria el caracter en vez de escribirlo.
  if (evento.alt) return 'al-shell'

  const tecla = evento.tecla.toLowerCase()
  const { ctrl, shift } = evento

  // Los de toda la vida en Linux: copian y pegan siempre, haya o no seleccion.
  if (ctrl && shift && tecla === 'c') return 'copiar'
  if (ctrl && shift && tecla === 'v') return 'pegar'

  // Los de Windows de siempre, anteriores incluso a Windows Terminal.
  if (ctrl && !shift && tecla === 'insert') return 'copiar'
  if (!ctrl && shift && tecla === 'insert') return 'pegar'

  if (ctrl && !shift && tecla === 'v') return 'pegar'

  // El unico caso que depende del estado: con algo seleccionado Ctrl+C copia, y
  // sin nada seleccionado es la interrupcion del proceso.
  if (ctrl && !shift && tecla === 'c') return haySeleccion ? 'copiar' : 'al-shell'

  return 'al-shell'
}

/// Lo que el manejador necesita de xterm. Es un subconjunto de `Terminal` para
/// que el test no tenga que montar una terminal de verdad.
export interface TerminalDePortapapeles {
  hasSelection(): boolean
  getSelection(): string
  clearSelection(): void
  paste(texto: string): void
}

/// El portapapeles del navegador, aparte por la misma razon.
export interface Portapapeles {
  writeText(texto: string): Promise<void>
  readText(): Promise<string>
}

/// Arma el manejador que se le pasa a `attachCustomKeyEventHandler`.
///
/// Vive aca y no dentro del componente porque el bug que arregla no se ve
/// mirando el codigo: devolver `false` le dice a xterm que no procese la tecla,
/// pero **no** cancela la accion por defecto del navegador. Ctrl+V,
/// Ctrl+Shift+V y Shift+Insert son pegados nativos, asi que el WebView disparaba
/// ademas un evento `paste` sobre la textarea de xterm y el texto entraba dos
/// veces. Del lado del copiado era peor: el copy nativo corria despues de
/// `clearSelection` y podia dejar el portapapeles vacio.
export function crearManejador(
  term: TerminalDePortapapeles,
  portapapeles: Portapapeles = navigator.clipboard,
): (evento: KeyboardEvent) => boolean {
  return (evento) => {
    if (evento.type !== 'keydown') return true

    const decision = decidir(
      {
        tecla: evento.key,
        ctrl: evento.ctrlKey,
        shift: evento.shiftKey,
        alt: evento.altKey,
      },
      term.hasSelection(),
    )

    // Ninguna tecla que resolvamos nosotros puede seguir hasta el navegador.
    if (decision !== 'al-shell') evento.preventDefault()

    if (decision === 'copiar') {
      const seleccion = term.getSelection()
      if (seleccion) {
        void portapapeles.writeText(seleccion)
        // Windows Terminal deselecciona al copiar. Sin esto, el Ctrl+C
        // siguiente vuelve a copiar en vez de interrumpir el proceso.
        term.clearSelection()
      }
      return false
    }

    if (decision === 'pegar') {
      void portapapeles.readText().then((texto) => {
        // term.paste y no writePty: si el programa activo pidio pegado entre
        // corchetes, xterm envuelve el texto y vim deja de autoindentar cada
        // linea pegada.
        if (texto) term.paste(texto)
      })
      return false
    }

    // Devolver true deja pasar la tecla. Es lo que hace que Ctrl+C sin
    // seleccion siga interrumpiendo el proceso.
    return true
  }
}
