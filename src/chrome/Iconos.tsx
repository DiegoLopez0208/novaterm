import type { ReactNode } from 'react'

/// Todos los iconos de la interfaz, en un solo lugar y con una sola regla de
/// dibujo: grilla de 16, trazo 1.3, `currentColor`, sin relleno salvo que la
/// forma lo pida. Antes convivian SVG dibujados a mano en la barra de titulo
/// con caracteres de texto sueltos (×, +, ⌄, │) en las pestañas, los ajustes y
/// la barra de estado: esos caracteres los dibuja la fuente activa, asi que
/// cambian de peso y de alineacion cada vez que se cambia de familia.

interface Props {
  /// En pixeles. El default es el tamaño de la barra de titulo.
  tam?: number
}

function Svg({ tam = 13, children }: Props & { children: ReactNode }) {
  return (
    <svg viewBox="0 0 16 16" width={tam} height={tam} aria-hidden="true">
      {children}
    </svg>
  )
}

const trazo = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.3,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export function DividirDerecha({ tam }: Props) {
  return (
    <Svg tam={tam}>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" {...trazo} />
      <path d="M8 2.5v11" {...trazo} />
    </Svg>
  )
}

export function DividirAbajo({ tam }: Props) {
  return (
    <Svg tam={tam}>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" {...trazo} />
      <path d="M1.5 8h13" {...trazo} />
    </Svg>
  )
}

export function CerrarPanel({ tam }: Props) {
  return (
    <Svg tam={tam}>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" {...trazo} />
      <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" {...trazo} />
    </Svg>
  )
}

/// Deslizadores y no engranaje: a 13 px los dientes se empastan y queda un sol.
/// Ademas es lo que el panel realmente tiene.
export function Ajustes({ tam }: Props) {
  return (
    <Svg tam={tam}>
      <path d="M2 5h5M11 5h3M2 11h9M13.5 11h.5" {...trazo} />
      <path d="M9 3.4v3.2M12.4 9.4v3.2" {...trazo} />
    </Svg>
  )
}

/// Una pieza suelta que encaja: es el catalogo de plugins. El enchufe, que es
/// la otra metafora habitual, a 13 px se lee como un tomacorriente y no como
/// algo que se agrega.
export function Plugins({ tam }: Props) {
  return (
    <Svg tam={tam}>
      <path
        d="M6.2 2.8h3.6v1.6a1.3 1.3 0 1 0 2.6 0V2.8h1.4v3.4h-1.6a1.3 1.3 0 1 0 0 2.6h1.6v3.4H2.2V2.8h4z"
        {...trazo}
      />
    </Svg>
  )
}

export function Cerrar({ tam }: Props) {
  return (
    <Svg tam={tam}>
      <path d="M4 4l8 8M12 4l-8 8" {...trazo} />
    </Svg>
  )
}

export function Mas({ tam }: Props) {
  return (
    <Svg tam={tam}>
      <path d="M8 3.5v9M3.5 8h9" {...trazo} />
    </Svg>
  )
}

export function ChevronAbajo({ tam }: Props) {
  return (
    <Svg tam={tam}>
      <path d="M4 6.5l4 4 4-4" {...trazo} />
    </Svg>
  )
}

export function Minimizar({ tam }: Props) {
  return (
    <Svg tam={tam}>
      <path d="M3.5 8h9" {...trazo} />
    </Svg>
  )
}

export function Maximizar({ tam }: Props) {
  return (
    <Svg tam={tam}>
      <rect x="3.5" y="3.5" width="9" height="9" rx="1" {...trazo} />
    </Svg>
  )
}

/// La marca: la misma N del icono de la app, reducida a trazo para que funcione
/// a 14 px y herede el color del chrome.
export function Marca({ tam = 14 }: Props) {
  return (
    <svg className="marca" viewBox="0 0 512 512" width={tam} height={tam} aria-hidden="true">
      <path d="M112 368V112h64l144 156V112h64v256h-64L176 212v156Z" fill="currentColor" />
      <path d="M304 408h80v32h-80Z" fill="var(--acento, currentColor)" />
    </svg>
  )
}

/// El backend manda un `icon` por perfil ("powershell", "cmd", "linux",
/// "bash", "ssh") que hasta ahora el frontend recibia y descartaba.
export function IconoPerfil({ nombre, tam = 12 }: Props & { nombre: string }) {
  switch (nombre) {
    case 'powershell':
      return (
        <Svg tam={tam}>
          <path d="M3.5 4l4 4-4 4M8.5 12h4" {...trazo} />
        </Svg>
      )
    case 'cmd':
      return (
        <Svg tam={tam}>
          <rect x="1.5" y="3" width="13" height="10" rx="1.5" {...trazo} />
          <path d="M4.5 6.5l2 1.5-2 1.5M8 10h3.5" {...trazo} />
        </Svg>
      )
    case 'linux':
      return (
        <Svg tam={tam}>
          <path
            d="M8 2.2c2 0 2.6 1.7 2.6 3.4 0 1.6 2 3.4 2 5.2 0 1.5-1.9 3-4.6 3s-4.6-1.5-4.6-3c0-1.8 2-3.6 2-5.2 0-1.7.6-3.4 2.6-3.4z"
            {...trazo}
          />
          <path d="M6.9 6.1h.01M9.1 6.1h.01" {...trazo} />
        </Svg>
      )
    case 'bash':
      return (
        <Svg tam={tam}>
          <path d="M3 4l3.5 4L3 12M8 12h5" {...trazo} />
        </Svg>
      )
    case 'ssh':
      return (
        <Svg tam={tam}>
          <circle cx="5.5" cy="8" r="2.6" {...trazo} />
          <path d="M8.1 8h6M12 8v2.4M13.6 8v1.6" {...trazo} />
        </Svg>
      )
    default:
      return (
        <Svg tam={tam}>
          <rect x="1.5" y="3" width="13" height="10" rx="1.5" {...trazo} />
        </Svg>
      )
  }
}
