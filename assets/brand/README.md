# NovaTerm mark

The current proposal uses a geometric **N** followed by a terminal cursor.
Filled paths share a 512-unit grid; the mark has no font dependency. The desktop
icon uses charcoal `#15191d`, warm white `#eaece5` and green `#a5ce8d`. Inside the
application the mark follows the active theme's text and accent colors.

`geometric.svg` is the editable proposal source. `retro.svg` and `industrial.svg`
are alternative directions, compared at 16, 24, 32 and 64 px in `proposals.png`.
The previous mark remains available in Git history before this branch.

Generate previews with `node scripts/preview-brand.mjs`. To regenerate the
desktop and mobile icon formats from the primary asset:

```sh
npm run tauri icon -- assets/logo.svg --output src-tauri/icons --ios-color '#15191d'
```

The favicon and startup image use `public/favicon.svg`; the header mark is in
`src/chrome/Iconos.tsx`. `assets/logo.svg` and `assets/logo-small.svg` use the
same geometry so small icons retain the same identity. All artwork is MIT
licensed under the repository license and is drawn directly in SVG.
