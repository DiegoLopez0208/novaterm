import { useCallback, useRef } from 'react'
import { TerminalView } from '../terminal/TerminalView'
import type { Panel } from '../tabs/modelo'
import type { NovaConfig } from '../config/configBridge'
import { disposicion, porcentaje, type SeparadorUbicado } from './layout'

interface Props {
  panel: Panel
  activo: string
  config: NovaConfig
  visible: boolean
  onActivar: (id: string) => void
  onTitulo: (titulo: string) => void
  onCwd: (cwd: string) => void
  onAjustar: (idDivision: string, proporcion: number) => void
  onCerrar: (id: string) => void
  onDividir: (direccion: 'vertical' | 'horizontal') => void
  onCerrarPanel: () => void
}

export function PaneTree({
  panel,
  activo,
  config,
  visible,
  onActivar,
  onTitulo,
  onCwd,
  onAjustar,
  onCerrar,
  onDividir,
  onCerrarPanel,
}: Props) {
  const contenedor = useRef<HTMLDivElement>(null)
  const { paneles, separadores } = disposicion(panel)

  return (
    // Con un solo panel no hay nada que distinguir: la marca del panel activo
    // seria un recuadro dibujado contra las letras y nada mas.
    <div
      className={`lienzo-paneles${paneles.length > 1 ? ' divididos' : ''}`}
      ref={contenedor}
    >
      {paneles.map((ubicado) => {
        const esActivo = ubicado.id === activo
        return (
          // La key es el id del panel y el nodo nunca cambia de padre: asi la
          // terminal sobrevive a que se divida cualquier otro panel.
          <div
            key={ubicado.id}
            className={`panel${esActivo ? ' activo' : ''}`}
            style={{
              left: porcentaje(ubicado.rect.x),
              top: porcentaje(ubicado.rect.y),
              width: porcentaje(ubicado.rect.w),
              height: porcentaje(ubicado.rect.h),
            }}
            onMouseDown={() => onActivar(ubicado.id)}
          >
            <TerminalView
              config={config}
              profile={ubicado.perfil}
              activo={esActivo && visible}
              puedeCerrarPanel={paneles.length > 1}
              onTitle={esActivo ? onTitulo : undefined}
              onCwd={esActivo ? onCwd : undefined}
              onExit={() => onCerrar(ubicado.id)}
              onDividir={onDividir}
              onCerrarPanel={onCerrarPanel}
            />
          </div>
        )
      })}

      {separadores.map((separador) => (
        <Separador
          key={separador.id}
          separador={separador}
          contenedor={contenedor}
          onAjustar={onAjustar}
        />
      ))}
    </div>
  )
}

function Separador({
  separador,
  contenedor,
  onAjustar,
}: {
  separador: SeparadorUbicado
  contenedor: React.RefObject<HTMLDivElement | null>
  onAjustar: (id: string, proporcion: number) => void
}) {
  const vertical = separador.direccion === 'vertical'

  // El arrastre se sigue a nivel de ventana: escuchando solo sobre el separador,
  // mover rapido el mouse lo deja atras y el resize se corta a mitad de camino.
  const empezarArrastre = useCallback(
    (evento: React.MouseEvent) => {
      evento.preventDefault()
      evento.stopPropagation()
      const caja = contenedor.current?.getBoundingClientRect()
      if (!caja) return

      const origen = vertical ? separador.area.x : separador.area.y
      const tramo = vertical ? separador.area.w : separador.area.h
      const inicio = vertical ? caja.left : caja.top
      const total = vertical ? caja.width : caja.height

      const mover = (e: MouseEvent) => {
        const absoluto = ((vertical ? e.clientX : e.clientY) - inicio) / total
        onAjustar(separador.id, (absoluto - origen) / (tramo || 1))
      }
      const soltar = () => {
        window.removeEventListener('mousemove', mover)
        window.removeEventListener('mouseup', soltar)
        document.body.classList.remove('redimensionando')
      }

      document.body.classList.add('redimensionando')
      window.addEventListener('mousemove', mover)
      window.addEventListener('mouseup', soltar)
    },
    [contenedor, onAjustar, separador, vertical],
  )

  return (
    <div
      className={`separador-panel ${separador.direccion}`}
      style={{
        left: porcentaje(separador.rect.x),
        top: porcentaje(separador.rect.y),
        width: vertical ? undefined : porcentaje(separador.rect.w),
        height: vertical ? porcentaje(separador.rect.h) : undefined,
      }}
      onMouseDown={empezarArrastre}
      role="separator"
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
    />
  )
}
