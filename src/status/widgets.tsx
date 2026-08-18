import type { ReactNode } from 'react'

export interface Stats {
  cpu: number
  ram_usada: number
  ram_total: number
}

export interface ContextoWidget {
  shell: string
  cwd: string | null
  paneles: number
  stats: Stats | null
}

export interface Widget {
  id: string
  /// Cada cuanto refrescar, en ms. Sin esto el widget solo se redibuja cuando
  /// cambia algo del contexto.
  intervalo?: number
  render: (ctx: ContextoWidget) => ReactNode
}

const GB = 1024 ** 3

function formatearBytes(bytes: number): string {
  return `${(bytes / GB).toFixed(1)} GB`
}

/// Registro de widgets. Agregar uno nuevo es sumar una entrada aca: la barra no
/// sabe que widgets existen, solo los recorre.
export const WIDGETS: Widget[] = [
  {
    id: 'shell',
    render: ({ shell }) => shell,
  },
  {
    id: 'cwd',
    // El shell reporta el directorio por OSC 7. Los prompts que no lo emiten
    // simplemente no muestran nada, en vez de mostrar algo desactualizado.
    render: ({ cwd }) => cwd,
  },
  {
    id: 'paneles',
    render: ({ paneles }) => (paneles > 1 ? `${paneles} paneles` : null),
  },
  {
    id: 'cpu',
    intervalo: 2000,
    render: ({ stats }) => (stats ? `CPU ${Math.round(stats.cpu)}%` : null),
  },
  {
    id: 'ram',
    intervalo: 2000,
    render: ({ stats }) =>
      stats
        ? `RAM ${formatearBytes(stats.ram_usada)} / ${formatearBytes(stats.ram_total)}`
        : null,
  },
  {
    id: 'hora',
    intervalo: 1000,
    // hour12 explicito: el formato regional mete "p. m." y descoloca la barra
    // cada doce horas.
    render: () =>
      new Date().toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }),
  },
]
