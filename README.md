# NovaTerm

Terminal emulator para Windows, Linux y macOS. Corre shells de verdad
(PowerShell, CMD, WSL, Git Bash, SSH) sobre un PTY nativo; la app se ocupa de la
ventana, el renderizado, las pestañas, los paneles y los temas.

Tauri 2 + Rust en el backend, React + xterm.js en el frontend.

## Atajos

| Atajo | Acción |
| --- | --- |
| `Ctrl+C` / `Ctrl+V` | Copiar / pegar |
| `Ctrl+Shift+P` | Paleta de comandos |
| `Ctrl+Shift+F` | Buscar en la terminal |
| `Ctrl+,` | Configuración |
| `Ctrl+Shift+T` | Nueva pestaña |
| `Ctrl+Shift+W` | Cerrar pestaña |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Siguiente / anterior pestaña |
| `Ctrl+Alt+1`…`9` | Ir a la pestaña n |
| `Ctrl+Shift+D` | Dividir a la derecha |
| `Ctrl+Shift+E` | Dividir abajo |
| `Ctrl+Shift+X` | Cerrar panel |
| `Ctrl+Shift+←` / `→` | Cambiar de panel |
| `Ctrl++` / `Ctrl+-` / `Ctrl+0` | Agrandar / achicar / restablecer la letra |
| `Ctrl+rueda` | Agrandar y achicar la letra |
| `F11` | Pantalla completa |

Doble clic en una pestaña la renombra. Clic del medio la cierra.

No hace falta acordarse de nada: los botones de dividir están arriba a la
derecha, y **clic derecho sobre la terminal** abre el menú con copiar, pegar,
dividir y cerrar panel, cada uno con su atajo al lado.

### Copiar y pegar

Es el comportamiento de Windows Terminal, y por lo tanto el que ya tenés en los
dedos: **`Ctrl+C` copia solo si hay algo seleccionado**; sin selección sigue
siendo la interrupción del proceso, que es lo único que no se puede romper en
una terminal. `Ctrl+V` pega.

`Ctrl+Shift+C` y `Ctrl+Shift+V` también funcionan, siempre, para el que viene de
una terminal de Linux, igual que `Ctrl+Insert` y `Shift+Insert`.

El pegado pasa por el pegado entre corchetes cuando el programa lo pide, así que
pegar veinte líneas en `vim` no las autoindenta una arriba de la otra.

Los atajos salen todos de una sola tabla (`src/acciones/registro.ts`): lo que
dice el tooltip, lo que muestra el menú contextual y lo que hace la tecla no
pueden desincronizarse porque son el mismo dato.

## Fuentes

La app trae su propia monoespaciada, **Nova Mono**, empaquetada: es un build
propio de [Iosevka](https://github.com/be5invis/Iosevka) (SIL OFL 1.1, sin
Reserved Font Name), con `0` punteado, `*` bajo y las ligaduras de programación.
Es la fuente por defecto y está disponible siempre, sin instalar nada.

Los glifos de Nerd Font —Powerline, Starship, devicons— los aporta **Símbolos
Nova**, que se agrega al final de *cualquier* cadena de fuentes que elijas. Es
decir: podés usar Consolas o la que tengas instalada y los prompts se siguen
viendo bien, sin parchear la fuente.

El resto de la lista de `Ctrl+,` → Fuente son las del sistema, y solo aparecen
las que estén realmente instaladas (se mide el ancho de un glifo con canvas;
`document.fonts.check()` devuelve `true` hasta para una fuente inexistente).

Las ligaduras se prenden y apagan desde el mismo panel.

## Bienvenida

Cada panel nuevo abre con la marca en bloques, las specs del equipo y los cuatro
atajos que hacen falta para no quedarse trabado. Es lo mismo que hace fastfetch
en el `.bashrc` de media Linux, pero lo dibuja la terminal: no depende de tener
nada instalado ni de tocar el perfil del shell.

Se apaga con `ui.welcome = false` en el config, o desde `Ctrl+,` → Terminal.

En un panel angosto —una ventana partida en cuatro— la marca se esconde sola y
quedan solo los datos: la decisión la toma el ancho en columnas, no una opción.

Los colores están puestos por **índice de la paleta**, no escritos en RGB, así
que cambiar de tema recolorea también la bienvenida que ya estaba en pantalla.
Con el color escrito, la terminal no tendría cómo saber que aquel azul de hace
un rato *era* el acento, y quedaría con los colores viejos para siempre.

## Perfiles

`Ctrl+,` → Perfiles. Arriba están los tuyos y abajo los que la app encuentra
sola (PowerShell, CMD, Git Bash, las distros de WSL). Cada uno es una entrada
del menú `+` de la barra de pestañas y de la paleta de comandos.

Un perfil propio sirve para cualquier cosa que abra una terminal: una distro de
WSL que la detección no ve, un shell de otra máquina, un entorno con variables
propias. Ejemplo típico:

- **Nombre:** `Ubuntu`
- **Comando:** `wsl.exe`
- **Argumentos:** `-d` y `Ubuntu`, **uno por línea**

Los argumentos van de a uno por renglón y no separados por espacios porque nunca
se arma una línea de comando pegando texto: cada argumento viaja entero hasta
`CreateProcess`, así que una ruta con espacios no se parte al medio.

Si un perfil propio usa el mismo id que uno detectado, gana el propio. Es la
forma de pisar, por ejemplo, con qué argumentos abre PowerShell.

El botón **Volver a detectar** vuelve a mirar el disco y a preguntarle a WSL qué
distros hay, sin reiniciar: sirve si instalaste algo con NovaTerm abierto.

## Formato de la salida

Se respeta todo lo que mande el programa: los 16 colores ANSI, la paleta de 256,
**color de 24 bits**, negrita, itálica, subrayado e inverso. Los prompts con
Starship, Oh My Posh o Powerline se ven como corresponde, incluidos los glifos
de Nerd Font.

## Rendimiento

La terminal dibuja con la GPU (WebGL). Sobre una animación —un spinner de
`Working...`, una barra de progreso— gasta **menos de la mitad** de CPU que
dibujando con el DOM: medido en 10 segundos de spinner, 1,8 s contra 4,7 s de
procesador. Si tu driver hace algo raro, `terminal.gpu = false` vuelve al
renderer del DOM, que funciona siempre.

La salida del PTY se agrupa antes de cruzar al webview. ConPTY entrega pedazos
chicos y cada uno era un evento con su JSON y su base64; ahora se junta lo que
llegue hasta el primer respiro (3 ms) o hasta llenar 64 KB.

Con la ventana atrás o minimizada se frenan los sondeos de la barra de estado y
los widgets de plugins: en reposo la app pasó de 500 ms a **31 ms** de CPU cada
20 segundos. Al volver el foco se refresca en el acto.

La ventana aparece en **medio segundo** desde el doble clic. Arranca oculta para
no mostrar un rectángulo transparente vacío mientras carga el webview, y el
backend le pasa la configuración ya leída **antes** de que cargue el documento:
el primer dibujo no espera ningún ida y vuelta, así que no hay salto de fuente
ni de colores. Si el frontend se rompiera antes de avisar que está listo, la
ventana se muestra igual a los 3 segundos en vez de quedar de proceso fantasma.

## Configuración

Todo se puede cambiar desde el panel (`Ctrl+,`). Los ajustes se guardan en:

- Windows: `%APPDATA%\novaterm\config.toml`
- Linux y macOS: `~/.novaterm/config.toml`

El archivo se relee solo al guardarlo, sin reiniciar y sin perder las sesiones
abiertas. Si queda con un error de sintaxis, se mantiene la configuración
anterior y aparece un aviso.

## Transparencia

`window.opacity` controla el fondo de la terminal; el texto queda opaco. Con
`window.blur = true` se agrega el desenfoque del sistema detrás de la ventana.

El desenfoque se aplica al crear la ventana, así que ese cambio pide reiniciar;
la opacidad se ve al instante.

## Plugins

Un plugin es una carpeta con un `plugin.toml` dentro de `~/.novaterm/plugins/`.

No ejecutan código propio: declaran lo que aportan y la app lo interpreta. Es
deliberado — cargar JavaScript de terceros en el webview le daría a cualquier
plugin acceso a todas las sesiones abiertas. Con manifiestos declarativos, lo
máximo que puede hacer un plugin es correr el comando que declara, con los
argumentos separados y sin shell de por medio.

```toml
# ~/.novaterm/plugins/git-status/plugin.toml
name = "Git"
version = "1.0.0"
description = "Muestra la rama actual en la barra de estado"

[[widgets]]
id = "git-rama"
command = "git"
args = ["branch", "--show-current"]
intervalo_ms = 4000
prefijo = "git:"
usar_cwd = true

[[profiles]]
id = "servidor"
name = "Servidor"
command = "ssh"
args = ["root@192.168.1.50"]
```

- `[[widgets]]` agrega un módulo a la barra de estado. Si el comando falla (no
  está instalado, o el directorio no es un repo), el widget se esconde en vez de
  mostrar el error.
- `[[profiles]]` agrega una entrada al menú de nueva pestaña.
- `usar_cwd` corre el comando en el directorio de la terminal, que se conoce si
  el shell lo reporta por OSC 7 (Starship y Oh My Posh lo hacen).

Un plugin con el manifiesto roto se saltea con un aviso en el log; no impide que
la terminal arranque.

## Conexiones SSH

Se administran desde `Ctrl+,` → SSH, y quedan en `~/.novaterm/ssh.toml`. Cada
una aparece como perfil en el menú `+` y en la paleta de comandos.

```toml
[[conexiones]]
id = "production"
nombre = "Production"
host = "192.168.1.50"
usuario = "root"
puerto = 22
identidad = "C:\\Users\\vos\\.ssh\\id_ed25519"
```

**No hay campo de contraseña y no es un olvido.** Guardarla en un archivo la deja
legible para cualquier cosa que corra como vos, y cifrarla con una clave que vive
en la misma máquina solo lo disimula. Usá clave pública; si el servidor pide
contraseña igual, la pide `ssh` dentro de la terminal, que es un PTY de verdad y
sabe leerla sin mostrarla.

## Desarrollo

```bash
npm install
npm run tauri dev     # ventana con recarga en caliente
npm run tauri build   # instalador y ejecutable en src-tauri/target/release
```

Tests:

```bash
cd src-tauri && cargo test --lib   # backend: PTY, config, perfiles, plugins, SSH
npm test                           # frontend: modelo de paneles, layout, paleta
```

Los tests del PTY abren shells de verdad y comprueban que respondan, así que
tardan unos segundos y no son puramente unitarios: es a propósito, son los que
detectan que la terminal dejó de funcionar.
