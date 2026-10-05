import { useEffect, useMemo, useRef, useState } from 'react'
import { filtrar, formatearAtajo, type Accion } from '../acciones/registro'

interface Props {
  acciones: Accion[]
  onCerrar: () => void
}

export function CommandPalette({ acciones, onCerrar }: Props) {
  const [busqueda, setBusqueda] = useState('')
  const [seleccion, setSeleccion] = useState(0)
  const listaRef = useRef<HTMLUListElement>(null)

  const resultados = useMemo(() => filtrar(acciones, busqueda), [acciones, busqueda])

  // Al cambiar la busqueda la seleccion vuelve arriba: si no, queda apuntando a
  // una fila que ya no es la que se ve.
  useEffect(() => setSeleccion(0), [busqueda])

  useEffect(() => {
    listaRef.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [seleccion])

  const ejecutar = (accion?: Accion) => {
    if (!accion) return
    onCerrar()
    accion.ejecutar()
  }

  return (
    <>
      <div className="paleta-fondo" onClick={onCerrar} />
      <div className="paleta" role="dialog" aria-label="Command palette">
        <input
          className="paleta-busqueda"
          autoFocus
          value={busqueda}
          placeholder="Search actions…"
          onChange={(e) => setBusqueda(e.target.value)}
          onKeyDown={(e) => {
            // La paleta se come sus teclas: si no, el atajo global las procesa
            // otra vez y la terminal recibe lo que se escribe aca.
            e.stopPropagation()
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setSeleccion((s) => Math.min(s + 1, resultados.length - 1))
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              setSeleccion((s) => Math.max(s - 1, 0))
            }
            if (e.key === 'Enter') {
              e.preventDefault()
              ejecutar(resultados[seleccion])
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              onCerrar()
            }
          }}
        />

        <ul className="paleta-lista" ref={listaRef} role="listbox">
          {resultados.map((accion, indice) => (
            <li
              key={accion.id}
              role="option"
              aria-selected={indice === seleccion}
              className={indice === seleccion ? 'seleccionada' : ''}
              onMouseEnter={() => setSeleccion(indice)}
              onMouseDown={(e) => {
                e.preventDefault()
                ejecutar(accion)
              }}
            >
              <span className="paleta-grupo">{accion.grupo}</span>
              <span className="paleta-titulo">{accion.titulo}</span>
              {accion.combo && <kbd>{formatearAtajo(accion.combo)}</kbd>}
            </li>
          ))}

          {resultados.length === 0 && (
            <li className="paleta-vacio">No actions match «{busqueda}»</li>
          )}
        </ul>
      </div>
    </>
  )
}
