import type { NovaConfig } from '../config/configBridge'

type Colores = NovaConfig['colors']

/// Cada entrada arrastra su propia cadena de respaldo: si la fuente elegida no
/// esta instalada, el webview cae a la siguiente en vez de dejar la terminal con
/// la fuente proporcional del sistema.
export const FUENTES: Fuente[] = [
  {
    // La fuente de la casa: va empaquetada con la app, asi que `prueba` vacia
    // la deja siempre disponible aunque no este instalada en el sistema.
    nombre: 'Nova Mono',
    valor: 'Nova Mono, Consolas, monospace',
    prueba: '',
  },
  {
    nombre: 'JetBrainsMono Nerd Font',
    valor: 'JetBrainsMono Nerd Font, JetBrains Mono, Consolas, monospace',
    prueba: 'JetBrainsMono Nerd Font',
  },
  {
    nombre: 'JetBrains Mono',
    valor: 'JetBrains Mono, Consolas, monospace',
    prueba: 'JetBrains Mono',
  },
  {
    nombre: 'Cascadia Code',
    valor: 'Cascadia Code, Cascadia Mono, Consolas, monospace',
    prueba: 'Cascadia Code',
  },
  {
    nombre: 'Cascadia Mono',
    valor: 'Cascadia Mono, Consolas, monospace',
    prueba: 'Cascadia Mono',
  },
  { nombre: 'Fira Code', valor: 'Fira Code, Consolas, monospace', prueba: 'Fira Code' },
  { nombre: 'Hack', valor: 'Hack, Consolas, monospace', prueba: 'Hack' },
  { nombre: 'Iosevka', valor: 'Iosevka, Consolas, monospace', prueba: 'Iosevka' },
  {
    nombre: 'Source Code Pro',
    valor: 'Source Code Pro, Consolas, monospace',
    prueba: 'Source Code Pro',
  },
  {
    nombre: 'IBM Plex Mono',
    valor: 'IBM Plex Mono, Consolas, monospace',
    prueba: 'IBM Plex Mono',
  },
  { nombre: 'Roboto Mono', valor: 'Roboto Mono, Consolas, monospace', prueba: 'Roboto Mono' },
  { nombre: 'Ubuntu Mono', valor: 'Ubuntu Mono, Consolas, monospace', prueba: 'Ubuntu Mono' },
  { nombre: 'Consolas', valor: 'Consolas, monospace', prueba: 'Consolas', siempre: true },
  {
    nombre: 'Courier New',
    valor: 'Courier New, monospace',
    prueba: 'Courier New',
    siempre: true,
  },
  {
    nombre: 'Lucida Console',
    valor: 'Lucida Console, monospace',
    prueba: 'Lucida Console',
    siempre: true,
  },
  { nombre: 'Monoespaciada del sistema', valor: 'ui-monospace, monospace', prueba: '' },
]

export interface Fuente {
  nombre: string
  valor: string
  prueba: string
  siempre?: boolean
}

/// Detecta si una fuente esta instalada midiendo texto.
///
/// `document.fonts.check()` no sirve para esto: devuelve `true` igual para una
/// fuente ausente, porque contesta si el texto se puede dibujar (con el
/// respaldo) y no si esa familia existe. Lo que si funciona es medir: se dibuja
/// la misma cadena con tres familias genericas y despues pidiendo la candidata
/// con esa generica de respaldo. Si el ancho cambia en alguna, la candidata
/// existe; si en las tres queda igual, nunca se uso.
function fuenteInstalada(nombre: string): boolean {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return true

  const muestra = 'mmmmmmmmmmlli0OWQ@'
  const genericas = ['monospace', 'sans-serif', 'serif']

  return genericas.some((generica) => {
    ctx.font = `72px ${generica}`
    const base = ctx.measureText(muestra).width
    ctx.font = `72px "${nombre}", ${generica}`
    return Math.abs(ctx.measureText(muestra).width - base) > 0.5
  })
}

/// Ofrecer una fuente que no esta instalada es una trampa: se elige, no cambia
/// nada en pantalla y parece un bug.
export function fuentesDisponibles(): Fuente[] {
  if (typeof document === 'undefined') return FUENTES
  return FUENTES.filter((f) => {
    // Sin nombre de prueba es la generica del sistema, que siempre esta.
    if (!f.prueba) return true
    // Las que vienen con Windows se dan por buenas: Consolas ademas es la
    // monoespaciada por defecto, asi que medirla da el mismo ancho que la
    // generica y el metodo la descartaria por error.
    if (f.siempre) return true
    try {
      return fuenteInstalada(f.prueba)
    } catch {
      return true
    }
  })
}

export const TEMAS: { nombre: string; colores: Colores }[] = [
  {
    nombre: 'Iceberg',
    colores: {
      background: '#0d0f18',
      foreground: '#d8dee9',
      cursor: '#ffffff',
      selection: '#2b3245',
      normal: {
        black: '#161821',
        red: '#e27878',
        green: '#b4be82',
        yellow: '#e2a478',
        blue: '#84a0c6',
        magenta: '#a093c7',
        cyan: '#89b8c2',
        white: '#c6c8d1',
      },
      bright: {
        black: '#6b7089',
        red: '#e98989',
        green: '#c0ca8e',
        yellow: '#e9b189',
        blue: '#91acd1',
        magenta: '#ada0d3',
        cyan: '#95c4ce',
        white: '#d2d4de',
      },
    },
  },
  {
    nombre: 'Rosa',
    colores: {
      background: '#1a1017',
      foreground: '#f2d9e6',
      cursor: '#ff8ac4',
      selection: '#5c2a45',
      normal: {
        black: '#2a1a24',
        red: '#ff6d8f',
        green: '#a5d6a7',
        yellow: '#ffc9a0',
        blue: '#c792ea',
        magenta: '#ff8ac4',
        cyan: '#8fd3d8',
        white: '#e8cddb',
      },
      bright: {
        black: '#6b4c5e',
        red: '#ff8fab',
        green: '#bde0be',
        yellow: '#ffd9bd',
        blue: '#d5aef2',
        magenta: '#ffa8d4',
        cyan: '#a8e0e4',
        white: '#fdeef5',
      },
    },
  },
  {
    nombre: 'Rosé Pine',
    colores: {
      background: '#191724',
      foreground: '#e0def4',
      cursor: '#e0def4',
      selection: '#403d52',
      normal: {
        black: '#26233a',
        red: '#eb6f92',
        green: '#31748f',
        yellow: '#f6c177',
        blue: '#9ccfd8',
        magenta: '#c4a7e7',
        cyan: '#ebbcba',
        white: '#e0def4',
      },
      bright: {
        black: '#6e6a86',
        red: '#f08bab',
        green: '#3f8fae',
        yellow: '#ffd49b',
        blue: '#b6e3ea',
        magenta: '#d7c0f2',
        cyan: '#f3d0cf',
        white: '#f5f3ff',
      },
    },
  },
  {
    nombre: 'Verde',
    colores: {
      background: '#0c1410',
      foreground: '#cfe8d4',
      cursor: '#7ee787',
      selection: '#2b4a35',
      normal: {
        black: '#16221a',
        red: '#e88b8b',
        green: '#7ee787',
        yellow: '#d8c98a',
        blue: '#7fc4a8',
        magenta: '#b39ddb',
        cyan: '#79d3c0',
        white: '#c2d8c7',
      },
      bright: {
        black: '#5c7a66',
        red: '#f0a3a3',
        green: '#9bf0a2',
        yellow: '#e6dba6',
        blue: '#9dd7c0',
        magenta: '#c9b8e8',
        cyan: '#96e3d3',
        white: '#e2f0e6',
      },
    },
  },
  {
    nombre: 'Everforest',
    colores: {
      background: '#2d353b',
      foreground: '#d3c6aa',
      cursor: '#d3c6aa',
      selection: '#475258',
      normal: {
        black: '#343f44',
        red: '#e67e80',
        green: '#a7c080',
        yellow: '#dbbc7f',
        blue: '#7fbbb3',
        magenta: '#d699b6',
        cyan: '#83c092',
        white: '#d3c6aa',
      },
      bright: {
        black: '#868d80',
        red: '#f28f91',
        green: '#b8d194',
        yellow: '#ebcd92',
        blue: '#93cbc3',
        magenta: '#e6accb',
        cyan: '#96d1a4',
        white: '#e6dcc4',
      },
    },
  },
  {
    nombre: 'Catppuccin Mocha',
    colores: {
      background: '#1e1e2e',
      foreground: '#cdd6f4',
      cursor: '#f5e0dc',
      selection: '#585b70',
      normal: {
        black: '#45475a',
        red: '#f38ba8',
        green: '#a6e3a1',
        yellow: '#f9e2af',
        blue: '#89b4fa',
        magenta: '#f5c2e7',
        cyan: '#94e2d5',
        white: '#bac2de',
      },
      bright: {
        black: '#585b70',
        red: '#f38ba8',
        green: '#a6e3a1',
        yellow: '#f9e2af',
        blue: '#89b4fa',
        magenta: '#f5c2e7',
        cyan: '#94e2d5',
        white: '#a6adc8',
      },
    },
  },
  {
    nombre: 'Dracula',
    colores: {
      background: '#282a36',
      foreground: '#f8f8f2',
      cursor: '#f8f8f2',
      selection: '#44475a',
      normal: {
        black: '#21222c',
        red: '#ff5555',
        green: '#50fa7b',
        yellow: '#f1fa8c',
        blue: '#bd93f9',
        magenta: '#ff79c6',
        cyan: '#8be9fd',
        white: '#f8f8f2',
      },
      bright: {
        black: '#6272a4',
        red: '#ff6e6e',
        green: '#69ff94',
        yellow: '#ffffa5',
        blue: '#d6acff',
        magenta: '#ff92df',
        cyan: '#a4ffff',
        white: '#ffffff',
      },
    },
  },
  {
    nombre: 'Tokyo Night',
    colores: {
      background: '#1a1b26',
      foreground: '#c0caf5',
      cursor: '#c0caf5',
      selection: '#33467c',
      normal: {
        black: '#15161e',
        red: '#f7768e',
        green: '#9ece6a',
        yellow: '#e0af68',
        blue: '#7aa2f7',
        magenta: '#bb9af7',
        cyan: '#7dcfff',
        white: '#a9b1d6',
      },
      bright: {
        black: '#414868',
        red: '#f7768e',
        green: '#9ece6a',
        yellow: '#e0af68',
        blue: '#7aa2f7',
        magenta: '#bb9af7',
        cyan: '#7dcfff',
        white: '#c0caf5',
      },
    },
  },
  {
    nombre: 'Kanagawa',
    colores: {
      background: '#1f1f28',
      foreground: '#dcd7ba',
      cursor: '#c8c093',
      selection: '#2d4f67',
      normal: {
        black: '#16161d',
        red: '#c34043',
        green: '#76946a',
        yellow: '#c0a36e',
        blue: '#7e9cd8',
        magenta: '#957fb8',
        cyan: '#6a9589',
        white: '#c8c093',
      },
      bright: {
        black: '#727169',
        red: '#e82424',
        green: '#98bb6c',
        yellow: '#e6c384',
        blue: '#7fb4ca',
        magenta: '#938aa9',
        cyan: '#7aa89f',
        white: '#dcd7ba',
      },
    },
  },
  {
    nombre: 'Gruvbox',
    colores: {
      background: '#282828',
      foreground: '#ebdbb2',
      cursor: '#ebdbb2',
      selection: '#504945',
      normal: {
        black: '#282828',
        red: '#cc241d',
        green: '#98971a',
        yellow: '#d79921',
        blue: '#458588',
        magenta: '#b16286',
        cyan: '#689d6a',
        white: '#a89984',
      },
      bright: {
        black: '#928374',
        red: '#fb4934',
        green: '#b8bb26',
        yellow: '#fabd2f',
        blue: '#83a598',
        magenta: '#d3869b',
        cyan: '#8ec07c',
        white: '#ebdbb2',
      },
    },
  },
  {
    nombre: 'Nord',
    colores: {
      background: '#2e3440',
      foreground: '#d8dee9',
      cursor: '#d8dee9',
      selection: '#434c5e',
      normal: {
        black: '#3b4252',
        red: '#bf616a',
        green: '#a3be8c',
        yellow: '#ebcb8b',
        blue: '#81a1c1',
        magenta: '#b48ead',
        cyan: '#88c0d0',
        white: '#e5e9f0',
      },
      bright: {
        black: '#4c566a',
        red: '#bf616a',
        green: '#a3be8c',
        yellow: '#ebcb8b',
        blue: '#81a1c1',
        magenta: '#b48ead',
        cyan: '#8fbcbb',
        white: '#eceff4',
      },
    },
  },
  {
    nombre: 'Solarized',
    colores: {
      background: '#002b36',
      foreground: '#93a1a1',
      cursor: '#93a1a1',
      selection: '#073642',
      normal: {
        black: '#073642',
        red: '#dc322f',
        green: '#859900',
        yellow: '#b58900',
        blue: '#268bd2',
        magenta: '#d33682',
        cyan: '#2aa198',
        white: '#eee8d5',
      },
      bright: {
        black: '#586e75',
        red: '#cb4b16',
        green: '#6c9a00',
        yellow: '#cfa000',
        blue: '#4aa3e0',
        magenta: '#6c71c4',
        cyan: '#35b5ab',
        white: '#fdf6e3',
      },
    },
  },
  {
    nombre: 'Ámbar',
    colores: {
      background: '#151008',
      foreground: '#f0d8a8',
      cursor: '#ffb454',
      selection: '#4a3a1c',
      normal: {
        black: '#241d10',
        red: '#e06c4f',
        green: '#c2c04a',
        yellow: '#ffb454',
        blue: '#c9a227',
        magenta: '#d98e48',
        cyan: '#c5b358',
        white: '#e0cfa0',
      },
      bright: {
        black: '#7a6a48',
        red: '#f08a6a',
        green: '#d8d66a',
        yellow: '#ffc97a',
        blue: '#e0bc55',
        magenta: '#f0a868',
        cyan: '#dccb78',
        white: '#f7ecd0',
      },
    },
  },
  {
    nombre: 'Negro puro',
    colores: {
      background: '#000000',
      foreground: '#e5e5e5',
      cursor: '#ffffff',
      selection: '#333333',
      normal: {
        black: '#1c1c1c',
        red: '#ff5f5f',
        green: '#5fff87',
        yellow: '#ffd75f',
        blue: '#5fafff',
        magenta: '#d75fff',
        cyan: '#5fffff',
        white: '#bcbcbc',
      },
      bright: {
        black: '#585858',
        red: '#ff8787',
        green: '#87ffaf',
        yellow: '#ffdf87',
        blue: '#87d7ff',
        magenta: '#df87ff',
        cyan: '#87ffff',
        white: '#ffffff',
      },
    },
  },
]
