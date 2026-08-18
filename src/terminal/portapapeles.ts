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
