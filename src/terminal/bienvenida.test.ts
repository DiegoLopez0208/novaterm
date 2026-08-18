import { describe, expect, it } from 'vitest'
import { construirBienvenida, familiaVisible, type InfoSistema } from './bienvenida'
import type { NovaConfig } from '../config/configBridge'

const info: InfoSistema = {
  host: 'EQUIPO',
  usuario: 'diego',
  so: 'Windows',
  version: '11',
  cpu: 'CPU de prueba',
  nucleos: 8,
  ram_total: 16 * 1024 ** 3,
  gpu: 'GPU de prueba',
  uptime: 3 * 86400 + 4 * 3600,
  novaterm: '0.1.0',
}

const config = {
  font: { family: "'Nova Mono', Consolas, monospace", size: 14 },
  ui: { welcome: true },
  colors: {
    foreground: '#d8dee9',
    normal: { blue: '#84a0c6' },
    bright: { black: '#6b7089', white: '#d2d4de' },
  },
} as unknown as NovaConfig

/// Cuenta lo que de verdad ocupa en pantalla: los escapes de color no miden.
// eslint-disable-next-line no-control-regex -- es justamente lo que hay que sacar
const anchoVisible = (linea: string) => linea.replace(/\u001b\[[0-9;]*m/g, '').length

describe('bienvenida', () => {
  it('muestra las specs y la version', () => {
    const salida = construirBienvenida(info, config, 120)

    expect(salida).toContain('diego')
    expect(salida).toContain('EQUIPO')
    expect(salida).toContain('CPU de prueba (8)')
    expect(salida).toContain('GPU de prueba')
    expect(salida).toContain('16.0 GB')
    expect(salida).toContain('3 d 4 h')
    expect(salida).toContain('0.1.0')
  })

  /// Sin `\r` la terminal en modo crudo deja cada renglon donde termino el
  /// anterior y la marca sale escalonada por la pantalla.
  it('termina cada linea con retorno de carro', () => {
    const salida = construirBienvenida(info, config, 120)

    expect(salida.includes('\n')).toBe(true)
    for (const [i, c] of [...salida].entries()) {
      if (c === '\n') expect(salida[i - 1]).toBe('\r')
    }
  })

  it('con la ventana ancha dibuja la marca al lado de los datos', () => {
    const salida = construirBienvenida(info, config, 120)

    expect(salida).toContain('█')
    // La primera fila de la marca y el titulo comparten linea.
    const conMarca = salida.split('\r\n').filter((l) => l.includes('█'))
    expect(conMarca[0]).toContain('diego')
  })

  /// Un panel angosto (una ventana partida en cuatro) no tiene que escupir un
  /// mural: se cae a la lista sola.
  it('con la ventana angosta esconde la marca', () => {
    const salida = construirBienvenida(info, config, 50)

    expect(salida).not.toContain('█')
    expect(salida).toContain('CPU de prueba (8)')
  })

  it('ninguna linea se pasa del ancho del panel', () => {
    for (const columnas of [50, 74, 100, 120]) {
      for (const linea of construirBienvenida(info, config, columnas).split('\r\n')) {
        expect(anchoVisible(linea), `${columnas} columnas: ${linea}`).toBeLessThanOrEqual(columnas)
      }
    }
  })

  it('sin GPU no deja la etiqueta vacia', () => {
    const salida = construirBienvenida({ ...info, gpu: null }, config, 120)

    expect(salida).not.toContain('GPU')
  })

  /// El texto ya impreso no se puede "recolorear": si los codigos llevaran el
  /// color escrito, cambiar de tema dejaria la bienvenida con los colores
  /// viejos para siempre. Con indices de la paleta, xterm redibuja el
  /// scrollback con el tema nuevo.
  it('usa indices de la paleta y no colores en RGB', () => {
    const salida = construirBienvenida(info, config, 120)

    // 38;2;r;g;b lleva el color escrito; 34 es el indice de la paleta.
    expect(salida).not.toContain('\u001b[38;2;')
    expect(salida).not.toContain('\u001b[48;2;')
    expect(salida).toContain('\u001b[34m')
    expect(salida).toContain('\u001b[90m')
  })

  it('de la cadena de fuentes muestra solo la que se ve', () => {
    expect(familiaVisible("'Nova Mono', Consolas, monospace")).toBe('Nova Mono')
    expect(familiaVisible('Consolas')).toBe('Consolas')
  })
})
