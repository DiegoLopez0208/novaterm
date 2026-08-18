import type { NovaConfig } from '../config/configBridge'
import { atajo } from '../acciones/registro'

export interface InfoSistema {
  host: string
  usuario: string
  so: string
  version: string
  cpu: string
  nucleos: number
  ram_total: number
  gpu: string | null
  uptime: number
  novaterm: string
}

/// La N de NovaTerm en bloques, con la diagonal aparte para poder pintarla con
/// el color de acento igual que en el icono de la app.
///
/// Se genera en vez de escribirse a mano por un motivo concreto: la celda de
/// una terminal mide mas o menos el doble de alto que de ancho, asi que una
/// diagonal que avanza una columna por fila se ve casi vertical y la N sale
/// parada y angosta. Aca la diagonal avanza `(ancho - montantes) / (alto - 1)`
/// columnas por fila, que en pixeles da los ~40 grados que uno espera.
const ANCHO_MARCA = 14
const ALTO_MARCA = 7
const GROSOR = 2

function dibujarMarca(): string[] {
  const filas: string[] = []

  for (let y = 0; y < ALTO_MARCA; y++) {
    const celdas = new Array<string>(ANCHO_MARCA).fill(' ')

    for (let x = 0; x < GROSOR; x++) {
      celdas[x] = '#'
      celdas[ANCHO_MARCA - 1 - x] = '#'
    }

    // En la ultima fila la diagonal cae justo sobre el montante derecho y lo
    // pisa. Es a proposito: asi el trazo aterriza en el pie de la N, igual que
    // en el icono. Frenarlo antes dejaba dos filas identicas al final.
    const inicio = Math.round(GROSOR + (y * (ANCHO_MARCA - 2 * GROSOR)) / (ALTO_MARCA - 1))
    for (let x = inicio; x < Math.min(inicio + GROSOR, ANCHO_MARCA); x++) celdas[x] = '%'

    filas.push(celdas.join(''))
  }

  return filas
}

const MARCA = dibujarMarca()

/// Debajo de esto no entra la marca al lado de los datos, asi que el panel
/// muestra la version corta. Un split en cuatro no tiene que escupir un mural.
const COLUMNAS_MINIMAS = 74

const RESET = '\x1b[0m'
const NEGRITA = '\x1b[1m'

/// Colores por **indice** de la paleta ANSI, no en RGB.
///
/// Esto es lo que hace que la bienvenida siga al tema. Con el color escrito
/// (`38;2;r;g;b`) el texto ya impreso se queda con los colores de cuando se
/// dibujo, y cambiar de tema no lo toca: la terminal no puede saber que ese
/// azul de hace un rato "era" el color de acento. Con el indice, xterm
/// redibuja todo el scrollback con la paleta nueva.
///
/// Cada indice apunta a la misma entrada del tema que se usaba antes: 34 es
/// `normal.blue`, 90 es `bright.black`, 97 es `bright.white`, y 39 es el color
/// de texto por defecto.
const ACENTO = '\x1b[34m'
const TINTA = '\x1b[39m'
const TENUE = '\x1b[90m'
const BLANCO = '\x1b[97m'

function gigas(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

function tiempoEncendido(segundos: number): string {
  const dias = Math.floor(segundos / 86400)
  const horas = Math.floor((segundos % 86400) / 3600)
  const minutos = Math.floor((segundos % 3600) / 60)
  if (dias > 0) return `${dias} d ${horas} h`
  if (horas > 0) return `${horas} h ${minutos} min`
  return `${minutos} min`
}

/// La primera familia de la cadena, que es la que se ve. Mostrar las cinco de
/// respaldo ocuparia toda la linea y no diria nada.
export function familiaVisible(cadena: string): string {
  return (cadena.split(',')[0] ?? cadena).trim().replace(/^['"]|['"]$/g, '')
}

export function construirBienvenida(
  info: InfoSistema,
  config: NovaConfig,
  columnas: number,
): string {
  const datos: [string, string][] = [
    ['SO', `${info.so} ${info.version}`.trim()],
    ['CPU', `${info.cpu} (${info.nucleos})`],
    ...(info.gpu ? ([['GPU', info.gpu]] as [string, string][]) : []),
    ['RAM', gigas(info.ram_total)],
    ['Encendida', tiempoEncendido(info.uptime)],
    ['Fuente', `${familiaVisible(config.font.family)} ${config.font.size}`],
    ['NovaTerm', info.novaterm],
  ]

  const titulo = `${info.usuario}@${info.host}`
  const ancho = Math.max(titulo.length, ...datos.map(([k, v]) => k.length + 2 + v.length))

  const derecha = [
    `${NEGRITA}${ACENTO}${info.usuario}${TENUE}@${ACENTO}${info.host}${RESET}`,
    `${TENUE}${'─'.repeat(Math.min(ancho, Math.max(columnas - ANCHO_MARCA - 6, 10)))}${RESET}`,
    ...datos.map(([clave, valor]) => `${ACENTO}${clave.padEnd(10)}${TINTA}${valor}${RESET}`),
  ]

  const lineas: string[] = ['']

  if (columnas >= COLUMNAS_MINIMAS) {
    // La marca y los datos van lado a lado, y la columna mas larga manda: si la
    // marca tiene mas filas que datos (o al reves) el resto se rellena vacio.
    const filas = Math.max(MARCA.length, derecha.length)
    for (let i = 0; i < filas; i++) {
      const arte = MARCA[i]
        ? MARCA[i]
            .split('')
            .map((celda) => {
              if (celda === '#') return `${BLANCO}█`
              if (celda === '%') return `${ACENTO}█`
              return ' '
            })
            .join('')
        : ' '.repeat(ANCHO_MARCA)
      lineas.push(`  ${arte}${RESET}   ${derecha[i] ?? ''}`)
    }
  } else {
    lineas.push(...derecha.map((linea) => `  ${linea}`))
  }

  lineas.push('')
  lineas.push(...tutorial(columnas))
  lineas.push('')

  // \r\n y no \n: la terminal esta en modo crudo y un \n solo baja de linea sin
  // volver al margen, asi que cada renglon arrancaria donde termino el anterior.
  return lineas.join('\r\n') + '\r\n'
}

function tutorial(columnas: number): string[] {
  const entradas: [string, string][] = [
    [atajo('app.ajustes'), 'ajustes'],
    [atajo('app.paleta'), 'todo lo que se puede hacer'],
    [atajo('terminal.buscar'), 'buscar'],
    [atajo('panel.dividir-vertical'), 'dividir'],
    ['Ctrl+rueda', 'tamaño de la letra'],
  ]

  const anchoAtajo = Math.max(...entradas.map(([a]) => a.length))
  const anchoTexto = Math.max(...entradas.map(([, q]) => q.length))
  const porFila = Math.max(1, Math.floor((columnas - 4) / (anchoAtajo + anchoTexto + 4)))

  const grupos: [string, string][][] = []
  for (let i = 0; i < entradas.length; i += porFila) {
    grupos.push(entradas.slice(i, i + porFila))
  }

  // Cada columna se mide sola. Con un ancho unico para todas, la columna del
  // texto corto arrastraba el hueco de la mas larga y quedaba un vacio de
  // veinte espacios en el medio.
  const anchoDeColumna = (j: number) => Math.max(...grupos.map((g) => (g[j] ? g[j][1].length : 0)))

  // La explicacion va en TINTA y no en TENUE. `bright.black` es el gris que la
  // paleta reserva para texto apagado, y con un tema oscuro de verdad
  // (`#6b4c5e` sobre `#1a1017`) el contraste queda abajo de 2:1: los atajos se
  // leian, pero para que servia cada uno era una mancha. El acento ya distingue
  // la tecla del texto; no hace falta apagar el texto ademas.
  const filas = grupos.map(
    (grupo) =>
      '  ' +
      grupo
        .map(([combo, que], j) => {
          // El relleno se calcula sobre el texto sin color: `padEnd` sobre la
          // cadena ya pintada contaria los escapes y desalinearia todo.
          const relleno = ' '.repeat(anchoDeColumna(j) - que.length + 3)
          return `${ACENTO}${combo.padEnd(anchoAtajo)}${TINTA} ${que}${RESET}${relleno}`
        })
        .join('')
        .trimEnd(),
  )

  filas.push(`  ${TINTA}se apaga con ${ACENTO}ui.welcome = false${TINTA} en el config${RESET}`)
  return filas
}
