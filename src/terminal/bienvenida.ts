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
  uptime: number
  gpu: string | null
  novaterm: string
}

// Keep the monogram small so the shell takes center stage.
const MARCA = ['███     ██', '██ ██   ██', '██  ██  ██', '██   ██ ██', '██     ███', '          ', '      ▄▄▄▄']
const ANCHO_MARCA = 10
const RESET = '\x1b[0m'
const NEGRITA = '\x1b[1m'
// Palette indices let printed text follow subsequent theme changes.
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

export function familiaVisible(cadena: string): string {
  return (cadena.split(',')[0] ?? cadena).trim().replace(/^['"]|['"]$/g, '')
}

// System strings must never insert terminal controls or additional lines.
function ajustar(texto: string, ancho: number): string {
  // eslint-disable-next-line no-control-regex -- remove untrusted terminal controls
  const limpio = texto.replace(/[\x00-\x1f\x7f-\x9f]/g, '')
  const caracteres = Array.from(limpio)
  if (caracteres.length <= ancho) return limpio
  return caracteres.slice(0, Math.max(0, ancho - 1)).join('') + (ancho > 0 ? '…' : '')
}

export function construirBienvenida(info: InfoSistema, config: NovaConfig, columnas: number): string {
  const ancho = Math.max(1, Math.floor(columnas))
  const margen = ancho >= 20 ? '  ' : ''
  const disponible = ancho - margen.length
  const conMarca = ancho >= 74
  const anchoDatos = disponible - (conMarca ? ANCHO_MARCA + 4 : 0)
  const campo = (clave: string, valor: string) => {
    const etiqueta = ajustar(clave.padEnd(8), anchoDatos)
    return `${TENUE}${etiqueta}${TINTA}${ajustar(valor, anchoDatos - etiqueta.length)}${RESET}`
  }
  const datos = [
    `${NEGRITA}${BLANCO}${ajustar('NovaTerm', anchoDatos)}${RESET}${ACENTO}${ajustar(`  v${info.novaterm}`, Math.max(0, anchoDatos - 8))}${RESET}`,
    `${ACENTO}${ajustar(`${info.usuario}@${info.host}`, anchoDatos)}${RESET}`,
    '',
    campo('OS', `${info.so} ${info.version}`.trim()),
    campo('CPU', `${info.cpu} (${info.nucleos})`),
    ...(info.gpu ? [campo('GPU', info.gpu)] : []),
    campo('Memory', `${gigas(info.ram_total)}  ·  up ${tiempoEncendido(info.uptime)}`),
    campo('Font', `${familiaVisible(config.font.family)} ${config.font.size}`),
  ]
  const lineas = ['']
  for (let i = 0; i < datos.length; i++) {
    const marca = conMarca
      ? `${i === 6 ? ACENTO : BLANCO}${MARCA[i] ?? ' '.repeat(ANCHO_MARCA)}${RESET}    `
      : ''
    lineas.push(`${margen}${marca}${datos[i]}`)
  }
  lineas.push('', `${margen}${TENUE}${'─'.repeat(Math.min(disponible, 88))}${RESET}`)

  // Flow shortcuts onto the next row instead of squeezing them into columns.
  const entradas = [
    [atajo('app.paleta'), 'Commands'],
    [atajo('app.ajustes'), 'Settings'],
    [atajo('terminal.buscar'), 'Search'],
    [atajo('panel.dividir-vertical'), 'Split'],
    ['Ctrl+wheel', 'Zoom'],
  ]
  let fila = ''
  let usados = 0
  for (const [tecla, nombre] of entradas) {
    const texto = ajustar(`${tecla} ${nombre}`, disponible)
    const separador = usados > 0 ? '   ·   ' : ''
    if (usados + separador.length + texto.length > disponible) {
      lineas.push(margen + fila + RESET)
      fila = ''
      usados = 0
    }
    const espacio = usados > 0 ? `${TENUE}   ·   ` : ''
    const combo = ajustar(tecla, disponible)
    fila += `${espacio}${ACENTO}${combo}${TINTA}${ajustar(` ${nombre}`, disponible - combo.length)}`
    usados += (usados > 0 ? 7 : 0) + texto.length
  }
  if (fila) lineas.push(margen + fila + RESET)
  lineas.push(`${margen}${TENUE}${ajustar('Welcome options in Settings → Appearance', disponible)}${RESET}`, '')
  // CRLF is required: a raw terminal's LF does not return to column zero.
  return lineas.join('\r\n') + '\r\n'
}
