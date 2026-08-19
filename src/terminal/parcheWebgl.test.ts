/// <reference types="node" />
// La referencia va aca y no en tsconfig.app.json: este es el unico archivo del
// frontend que toca el sistema de archivos, y meter los tipos de Node en la
// config de la app dejaria pasar un `process` o un `Buffer` en codigo que corre
// en el webview.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/// El renderer WebGL de xterm se parchea a mano en postinstall
/// (scripts/parchear-webgl.mjs) porque pinta un rectangulo negro opaco detras de
/// todo texto con negrita, cursiva, tenue, subrayado o tachado.
///
/// Estos tests existen por un error concreto: el parche se aplico durante dias
/// solo a `lib/addon-webgl.js`, que es el campo `main` del paquete. Vite resuelve
/// por `module`, o sea `lib/addon-webgl.mjs`, que quedaba intacto. El bug seguia
/// vivo en la app con el parche "aplicado" y sin ninguna senal de que faltara.
///
/// Por eso lo que se verifica no es "el archivo tal esta parcheado" sino "todos
/// los archivos que el paquete ofrece como entrada estan parcheados".
const PAQUETE = 'node_modules/@xterm/addon-webgl'

const paquete = JSON.parse(readFileSync(`${PAQUETE}/package.json`, 'utf8'))

describe('el parche del renderer WebGL', () => {
  it('cubre todas las entradas que declara el paquete', () => {
    const entradas = [paquete.main, paquete.module].filter(Boolean)
    expect(entradas.length).toBeGreaterThan(1)

    for (const entrada of entradas) {
      const codigo = readFileSync(`${PAQUETE}/${entrada}`, 'utf8')

      // La guarda de color-mode: sin ella un flag de estilo en la palabra `bg`
      // ya emite rectangulo.
      expect(codigo, `${entrada} sin la guarda de color-mode`).toContain('50331648')

      // El alpha del rectangulo no puede quedar hardcodeado en 1: con fondo por
      // defecto el color es rgba(0,0,0,0) y saldria negro opaco.
      expect(codigo, `${entrada} con el alpha del rectangulo forzado a 1`).not.toMatch(
        /[A-Za-z_$][\w$]*=1,this\._addRectangle\(/,
      )
    }
  })

  it('sigue apuntando a la version para la que se escribio', () => {
    // El parche toca codigo minificado. Si el paquete sube de version hay que
    // revisar a mano si el bug sigue vivo antes de mover el pin.
    expect(paquete.version).toBe('0.19.0')
  })
})
