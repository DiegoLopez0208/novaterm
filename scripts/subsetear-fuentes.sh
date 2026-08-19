#!/usr/bin/env bash
# Recorta Nova Mono a los glifos que una terminal usa de verdad.
#
# El build de Iosevka trae 7.559 glifos con cmap (38.343 contando variantes):
# CJK, silabarios, matematica de dominio, banderas. Cada variante pesaba ~850 KB
# y las cuatro se cargaban y rasterizaban enteras en el webview. Recortadas
# quedan en ~100 KB sin perder un solo glifo que la terminal dibuje.
#
# Los originales viven en fuentes/originales/ y no se distribuyen. Volve a
# correr esto si actualizas la fuente:
#
#   bash scripts/subsetear-fuentes.sh
#
# Lo que se conserva y por que:
#   - calt sobrevive al recorte, y es la feature con la que Iosevka arma las
#     ligaduras de programacion (=>, !=, ->). App.tsx pone
#     `font-variant-ligatures: contextual`, que es justamente calt.
#   - Los ~1.000 glifos sin cmap del resultado son esas ligaduras: pyftsubset
#     los arrastra siguiendo el GSUB.
#   - Se pierden cv01-cv99, ss01-ss20 y dlig, las variantes estilisticas de
#     Iosevka. Ninguna se puede activar desde NovaTerm: xterm no expone
#     font-feature-settings.
set -euo pipefail

cd "$(dirname "$0")/.."

# Si cambias esta lista, actualiza tambien el unicode-range de src/index.css.
RANGOS='U+0000-00FF,U+0100-024F,U+02B0-02FF,U+0300-036F,U+0370-03FF,U+1E00-1EFF,U+2000-206F,U+2070-209F,U+20A0-20BF,U+2100-214F,U+2150-218F,U+2190-21FF,U+2200-22FF,U+2300-23FF,U+2400-243F,U+2500-257F,U+2580-259F,U+25A0-25FF,U+2600-26FF,U+2700-27BF,U+27C0-27EF,U+2900-297F,U+2B00-2BFF,U+FE00-FE0F,U+FFFD'

for variante in Regular Bold Italic BoldItalic; do
  origen="fuentes/originales/NovaMono-$variante.woff2"
  destino="src/assets/fonts/NovaMono-$variante.woff2"

  uv run --with 'fonttools[woff]' pyftsubset "$origen" \
    --output-file="$destino" \
    --flavor=woff2 \
    --unicodes="$RANGOS"

  antes=$(stat -c %s "$origen")
  despues=$(stat -c %s "$destino")
  printf '%-12s %7d KB -> %4d KB\n' "$variante" $((antes / 1024)) $((despues / 1024))
done
