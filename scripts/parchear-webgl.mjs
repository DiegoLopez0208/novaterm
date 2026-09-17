// Arregla los rectangulos negros del renderer WebGL de xterm.
//
// El sintoma: cualquier texto con negrita, cursiva, tenue, subrayado o tachado
// aparecia con una caja negra opaca detras, del alto de la celda y a veces
// hasta el borde derecho. Sobre una ventana translucida se veia como una franja
// negra. Se nota muchisimo con Claude Code, que usa cursiva y fondos de ancho
// completo.
//
// Son dos bugs encadenados en `RectangleRenderer`:
//
//  1. `updateBackgrounds` emite un rectangulo cuando la palabra `bg` no es cero,
//     sin mirar el color-mode (CM_MASK = 0x3000000 = 50331648). En xterm 6 esa
//     palabra tambien guarda flags de estilo (ITALIC, DIM, HAS_EXTENDED...), asi
//     que un tramo en cursiva con fondo por defecto ya dispara el rectangulo.
//
//  2. `_updateRectangle` arma el color y despues pisa el alpha con 1. Con fondo
//     por defecto el color es `colors.background.rgba`, que en NovaTerm vale
//     rgba(0,0,0,0): RGB negro con alpha cero. Forzado a alpha 1 queda negro
//     opaco. Al usar el alpha real, un fondo transparente no pinta nada.
//
//     Ojo con el caso de color RGB verdadero (`case 50331648`): arma el color
//     como `(palabra & 0xFFFFFF) << 8`, que deja el alpha en cero porque nunca
//     se usaba. Con el alpha real hay que completarlo a 255 o los fondos de 24
//     bits dejarian de pintarse.
//
// Se parchean los dos archivos del paquete. `main` es el CommonJS y `module` el
// ESM; Vite resuelve por `module`, asi que parchear solo uno deja el bug vivo en
// la app aunque el otro archivo se vea arreglado. Ese fue exactamente el error
// de la primera version de este script.
//
// Lo que NO se toca: `premultipliedAlpha` del contexto WebGL2. El contexto se
// crea con el default (premultiplicado) mientras el blend es
// blendFunc(SRC_ALPHA, ONE_MINUS_SRC_ALPHA), que es la formula de alpha directo.
// Sobre el papel ese desajuste deja un halo en los bordes de los glifos y
// ponerlo en false lo arregla. Medido, hace lo contrario: el texto sale lavado.
// Comparando la misma pantalla con y sin el cambio, la luminancia media baja de
// 43.4 a 37.2 y el texto tenue queda casi ilegible. Los rectangulos negros se
// arreglan con los dos cambios de arriba; este no hacia falta.

// Se parchea el bundle en vez de usar patch-package porque cada archivo es una
// sola linea de cientos de KB: el .patch resultante pesaba 495 KB y era
// inrevisable.

import { readFileSync, writeFileSync } from 'node:fs'

const VERSION_ESPERADA = '0.19.0'

/** @type {{ archivo: string, cambios: { nombre: string, de: string, a: string, veces: number }[] }[]} */
const OBJETIVOS = [
  {
    archivo: 'node_modules/@xterm/addon-webgl/lib/addon-webgl.mjs',
    cambios: [
      {
        nombre: 'guarda de color-mode en updateBackgrounds',
        de: '(u!==0||d&&c!==0)',
        a: '((u&50331648)!==0||d&&c!==0)',
        veces: 2,
      },
      {
        nombre: 'alpha del color RGB verdadero (fg y bg)',
        de: '<<8;break;case 0:default:xe=this._themeService.colors.',
        a: '<<8|255;break;case 0:default:xe=this._themeService.colors.',
        veces: 2,
      },
      {
        nombre: 'alpha real del rectangulo',
        de: 'Vn=1,this._addRectangle(',
        a: 'Vn=(xe&255)/255,this._addRectangle(',
        veces: 1,
      },
    ],
  },
  {
    archivo: 'node_modules/@xterm/addon-webgl/lib/addon-webgl.js',
    cambios: [
      {
        nombre: 'guarda de color-mode en updateBackgrounds',
        de: '(0!==a||h&&0!==l)',
        a: '(0!==(50331648&a)||h&&0!==l)',
        veces: 2,
      },
      {
        nombre: 'alpha del color RGB verdadero (fg y bg)',
        de: ')<<8;break;default:h=this._themeService.colors.',
        a: ')<<8|255;break;default:h=this._themeService.colors.',
        veces: 2,
      },
      {
        nombre: 'alpha real del rectangulo',
        de: 'g=1,this._addRectangle(',
        a: 'g=(h&255)/255,this._addRectangle(',
        veces: 1,
      },
    ],
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

for (const { archivo, cambios } of OBJETIVOS) {
  let texto = readFileSync(archivo, 'utf8')
  const hechos = []

  for (const { nombre, de, a, veces } of cambios) {
    const yaEsta = contar(texto, a)
    if (yaEsta === veces) continue

    const encontrados = contar(texto, de)
    if (encontrados !== veces) {
      throw new Error(
        `parchear-webgl: en ${archivo} se esperaban ${veces} ocurrencias de "${nombre}" ` +
          `y hay ${encontrados}. El bundle cambio: revisar el parche a mano.`,
      )
    }

    texto = texto.split(de).join(a)
    hechos.push(nombre)
  }

  if (hechos.length) {
    writeFileSync(archivo, texto)
    console.log(`parchear-webgl: ${archivo}`)
    for (const nombre of hechos) console.log(`  - ${nombre}`)
  } else {
    console.log(`parchear-webgl: ${archivo} ya estaba al dia`)
  }
}
