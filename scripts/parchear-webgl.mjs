// Parche de @xterm/addon-webgl, aplicado por el postinstall.
//
// El renderer WebGL de xterm pinta un rectangulo de fondo por cada tramo de
// celdas cuya palabra `bg` no sea cero. Pero en xterm 6 esa palabra no guarda
// solo el color: tambien lleva los flags de estilo ITALIC, DIM, HAS_EXTENDED
// (subrayados y OSC 8), INVISIBLE y OVERLINE. Una celda en italica con fondo
// por defecto hace bg !== 0, dispara el rectangulo, y el rectangulo se pinta
// con `theme.background` --- que en NovaTerm es 'rgba(0, 0, 0, 0)' porque el
// fondo lo pinta el contenedor (ver construirTema en src/terminal/TerminalView.tsx).
// El addon toma el RGB de ese color (0,0,0) pero fuerza el alpha a 1, asi que
// sale una caja NEGRA OPACA del alto exacto de la celda: el "bordeado negro",
// que ademas tapa la transparencia de la ventana.
//
// El arreglo es mirar el color-mode (CM_MASK = 0x3000000) en vez de la palabra
// entera. Asi el rectangulo se emite solo cuando el fondo tiene un color de
// verdad; el caso de video inverso sigue cubierto por la segunda mitad de la
// guarda, que usa la palabra `fg`.
//
// De paso, el canvas se crea con premultipliedAlpha implicito en true mientras
// el blend es blendFunc(SRC_ALPHA, ONE_MINUS_SRC_ALPHA), que es la formula de
// alpha directo. Ese desajuste deja un halo oscuro en los bordes antialiaseados
// de los glifos sobre fondo transparente.
//
// Se parchea el bundle en vez de usar patch-package porque el archivo es una
// sola linea de ~700 KB: el .patch resultante pesaba 495 KB y era inrevisable.

import { readFileSync, writeFileSync } from 'node:fs'

const RUTA = 'node_modules/@xterm/addon-webgl/lib/addon-webgl.js'
const VERSION_ESPERADA = '0.19.0'

/** @type {{ nombre: string, de: string, a: string, veces: number }[]} */
const CAMBIOS = [
  {
    nombre: 'guarda de color-mode en updateBackgrounds',
    de: '(0!==a||h&&0!==l)',
    a: '(0!==(50331648&a)||h&&0!==l)',
    veces: 2,
  },
  {
    nombre: 'premultipliedAlpha del contexto WebGL2',
    de: '{antialias:!1,depth:!1,preserveDrawingBuffer:v}',
    a: '{antialias:!1,depth:!1,premultipliedAlpha:!1,preserveDrawingBuffer:v}',
    veces: 1,
  },
]

function contar(texto, aguja) {
  return texto.split(aguja).length - 1
}

const version = JSON.parse(
  readFileSync('node_modules/@xterm/addon-webgl/package.json', 'utf8'),
).version

if (version !== VERSION_ESPERADA) {
  throw new Error(
    `parchear-webgl: @xterm/addon-webgl es ${version} y el parche fue escrito para ` +
      `${VERSION_ESPERADA}. Revisar si el bug sigue vivo antes de mover el pin en package.json.`,
  )
}

let fuente = readFileSync(RUTA, 'utf8')
const hechos = []

for (const cambio of CAMBIOS) {
  const pendientes = contar(fuente, cambio.de)
  const yaAplicados = contar(fuente, cambio.a)

  if (pendientes === 0 && yaAplicados >= cambio.veces) continue // idempotente

  if (pendientes !== cambio.veces) {
    throw new Error(
      `parchear-webgl: "${cambio.nombre}" aparece ${pendientes} veces y se esperaban ` +
        `${cambio.veces}. El bundle cambio; no se aplica nada.`,
    )
  }

  fuente = fuente.split(cambio.de).join(cambio.a)
  hechos.push(`${cambio.nombre} (${cambio.veces})`)
}

if (hechos.length === 0) {
  console.log('parchear-webgl: ya estaba aplicado')
} else {
  writeFileSync(RUTA, fuente)
  console.log(`parchear-webgl: ${hechos.join(', ')}`)
}
