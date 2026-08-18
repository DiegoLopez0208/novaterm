import { atajo } from '../acciones/registro'

interface Props {
  x: number
  y: number
  puedeCerrar: boolean
  onDividir: (direccion: 'vertical' | 'horizontal') => void
  onCopiar: () => void
  onPegar: () => void
  onCerrarPanel: () => void
  onCerrar: () => void
}

/// Menu de clic derecho sobre la terminal. Los atajos van escritos al lado: el
/// menu sirve para descubrirlos, no para reemplazarlos.
export function MenuPanel({
  x,
  y,
  puedeCerrar,
  onDividir,
  onCopiar,
  onPegar,
  onCerrarPanel,
  onCerrar,
}: Props) {
  const item = (etiqueta: string, atajo: string, accion: () => void) => (
    <li>
      <button
        onMouseDown={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onCerrar()
          accion()
        }}
      >
        <span>{etiqueta}</span>
        <kbd>{atajo}</kbd>
      </button>
    </li>
  )

  return (
    <>
      <div
        className="menu-fondo"
        onMouseDown={onCerrar}
        onContextMenu={(e) => e.preventDefault()}
      />
      <ul
        className="menu-panel"
        role="menu"
        // Se ancla donde se hizo clic, con un tope para que no se salga por el
        // borde de la ventana.
        style={{
          left: Math.min(x, window.innerWidth - 210),
          top: Math.min(y, window.innerHeight - 190),
        }}
      >
        {item('Copiar', atajo('terminal.copiar'), onCopiar)}
        {item('Pegar', atajo('terminal.pegar'), onPegar)}
        <li className="separador-menu" />
        {item('Dividir a la derecha', atajo('panel.dividir-vertical'), () =>
          onDividir('vertical'),
        )}
        {item('Dividir abajo', atajo('panel.dividir-horizontal'), () =>
          onDividir('horizontal'),
        )}
        {puedeCerrar && (
          <>
            <li className="separador-menu" />
            {item('Cerrar panel', atajo('panel.cerrar'), onCerrarPanel)}
          </>
        )}
      </ul>
    </>
  )
}
