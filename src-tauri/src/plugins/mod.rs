pub mod instalar;
mod widget;
pub use widget::ejecutar_widget;

#[cfg(test)]
mod tests;

#[cfg(test)]
mod tests_instalar;

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::profiles::Profile;

/// Un plugin es una carpeta con un `plugin.toml`.
///
/// Hay dos formas. La declarativa ---la original--- no ejecuta codigo: dice que
/// widgets y perfiles aporta, y la app los interpreta. Lo peor que puede hacer
/// es correr el comando que declara, con argumentos separados y sin shell.
///
/// La segunda trae `entry`, un archivo de JavaScript propio. Ese codigo **no**
/// corre en el webview de la app: corre dentro de un iframe con `sandbox` y sin
/// `allow-same-origin`, o sea con origen nulo, sin API de Tauri, sin storage y
/// sin red propia. Lo unico que puede hacer es mandar mensajes a un broker del
/// lado de la app, que valida cada pedido contra los permisos que el manifiesto
/// declaro y que el usuario aprobo al instalar. Sin ese diseno, un plugin
/// tendria acceso a todas las sesiones abiertas y a la clave del LLM.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Plugin {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub version: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub widgets: Vec<WidgetPlugin>,
    #[serde(default)]
    pub profiles: Vec<Profile>,
    /// Archivo de JavaScript, relativo a la carpeta del plugin. Un plugin sin
    /// `entry` es declarativo y no puede pedir permisos.
    #[serde(default)]
    pub entry: Option<String>,
    #[serde(default)]
    pub permissions: Vec<Permiso>,
    #[serde(default)]
    pub commands: Vec<ComandoPlugin>,
    /// Ruta absoluta de la carpeta. La completa `descubrir`, no el manifiesto:
    /// el frontend la necesita para cargar el `entry`.
    #[serde(default, skip_deserializing)]
    pub carpeta: String,
}

/// Lo que un plugin puede pedir. Cerrado a proposito: un permiso que no este en
/// esta lista no se puede inventar desde un manifiesto, y `Deserialize` rechaza
/// el manifiesto entero si aparece uno desconocido.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Permiso {
    /// Leer lo que hay en pantalla y en el scrollback del panel activo.
    #[serde(rename = "terminal.read")]
    TerminalLeer,
    /// Escribir en la sesion activa. Es ejecutar comandos en tu shell, asi que
    /// el broker pide confirmacion por cada escritura salvo que el plugin este
    /// marcado como de confianza.
    #[serde(rename = "terminal.write")]
    TerminalEscribir,
    /// Dibujar en su propio panel lateral.
    #[serde(rename = "ui.panel")]
    UiPanel,
    /// Pedirle una respuesta al modelo. La clave nunca sale de Rust.
    #[serde(rename = "llm.complete")]
    LlmCompletar,
    /// Registrar entradas en la paleta de comandos.
    #[serde(rename = "commands")]
    Comandos,
}

impl Permiso {
    /// Texto para la pantalla de consentimiento. Tiene que decir la consecuencia,
    /// no el nombre tecnico: nadie evalua un permiso llamado "terminal.write".
    pub fn descripcion(self) -> &'static str {
        match self {
            Permiso::TerminalLeer => "Leer lo que aparece en tu terminal, incluido el historial",
            Permiso::TerminalEscribir => "Escribir comandos en tu terminal y ejecutarlos",
            Permiso::UiPanel => "Mostrar su propio panel dentro de NovaTerm",
            Permiso::LlmCompletar => "Consultar al modelo de IA con tu clave",
            Permiso::Comandos => "Agregar entradas a la paleta de comandos",
        }
    }

    /// Los que no se conceden sin mirar. El registro ademas los manda a revision
    /// manual antes de publicar.
    pub fn es_delicado(self) -> bool {
        matches!(self, Permiso::TerminalEscribir | Permiso::TerminalLeer)
    }
}

/// Una entrada que el plugin agrega a la paleta de comandos.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComandoPlugin {
    pub id: String,
    pub title: String,
    /// Atajo sugerido. El usuario puede cambiarlo; si choca con uno propio de
    /// NovaTerm, gana el de NovaTerm.
    #[serde(default)]
    pub default_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WidgetPlugin {
    pub id: String,
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default = "intervalo_por_defecto", alias = "interval_ms")]
    pub intervalo_ms: u64,
    /// Texto que se antepone a la salida, por ejemplo "git:".
    #[serde(default, alias = "prefix")]
    pub prefijo: String,
    /// Se ejecuta dentro del directorio actual de la terminal, si se conoce.
    #[serde(default, alias = "use_cwd")]
    pub usar_cwd: bool,
}

fn intervalo_por_defecto() -> u64 {
    5000
}

pub fn directorio_plugins() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_default()
        .join(".novaterm")
        .join("plugins")
}

/// Recorre las carpetas y devuelve los manifiestos validos. Un plugin roto se
/// saltea con un aviso en el log: no puede impedir que arranque la terminal.
pub fn descubrir(raiz: &Path) -> Vec<Plugin> {
    let Ok(entradas) = std::fs::read_dir(raiz) else {
        return Vec::new();
    };

    let mut plugins = Vec::new();
    for entrada in entradas.flatten() {
        let manifiesto = entrada.path().join("plugin.toml");
        if !manifiesto.exists() {
            continue;
        }
        match leer_manifiesto(&manifiesto) {
            Ok(plugin) => plugins.push(plugin),
            Err(err) => log::warn!("plugin invalido en {}: {err}", manifiesto.display()),
        }
    }
    plugins.sort_by(|a, b| a.id.cmp(&b.id));
    plugins
}

pub fn leer_manifiesto(ruta: &Path) -> Result<Plugin, String> {
    let texto = std::fs::read_to_string(ruta).map_err(|e| e.to_string())?;
    let sin_bom = texto.strip_prefix('\u{feff}').unwrap_or(&texto);
    let mut plugin: Plugin = toml::from_str(sin_bom).map_err(|e| e.to_string())?;

    if plugin.id.trim().is_empty() {
        // Sin id explicito vale el nombre de la carpeta, que es unico por
        // definicion.
        plugin.id = ruta
            .parent()
            .and_then(|p| p.file_name())
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
    }
    if plugin.id.trim().is_empty() {
        return Err("el plugin no tiene id ni carpeta con nombre".into());
    }
    if plugin.name.trim().is_empty() {
        plugin.name = plugin.id.clone();
    }

    for widget in &plugin.widgets {
        if widget.command.trim().is_empty() {
            return Err(format!("el widget '{}' no declara comando", widget.id));
        }
    }

    let carpeta = ruta
        .parent()
        .ok_or_else(|| "el manifiesto no esta dentro de una carpeta".to_string())?;
    plugin.carpeta = carpeta.to_string_lossy().to_string();

    if let Some(entry) = &plugin.entry {
        validar_entry(carpeta, entry)?;
    } else if !plugin.permissions.is_empty() {
        // Un plugin declarativo no ejecuta nada, asi que no hay a quien
        // concederle un permiso. Pedirlos sin `entry` es un manifiesto mal
        // armado, y aceptarlo en silencio dejaria al usuario aprobando accesos
        // que nadie va a usar.
        return Err("hay permisos declarados pero no hay 'entry' que los use".into());
    }

    if plugin.entry.is_none() && !plugin.commands.is_empty() {
        return Err("hay comandos declarados pero no hay 'entry' que los atienda".into());
    }

    for comando in &plugin.commands {
        if comando.id.trim().is_empty() || comando.title.trim().is_empty() {
            return Err("cada comando necesita id y title".into());
        }
    }

    Ok(plugin)
}

/// El `entry` tiene que ser un archivo .js dentro de la carpeta del plugin.
///
/// La comprobacion es contra la ruta ya canonicalizada, no contra el texto: un
/// manifiesto podria escribir `../../otra/cosa.js`, o apuntar a un enlace
/// simbolico que salga de la carpeta, y comparar strings no lo detecta.
fn validar_entry(carpeta: &Path, entry: &str) -> Result<(), String> {
    if entry.trim().is_empty() {
        return Err("'entry' esta vacio".into());
    }
    if !entry.ends_with(".js") {
        return Err("'entry' tiene que ser un archivo .js".into());
    }

    let destino = carpeta.join(entry);
    let real = destino
        .canonicalize()
        .map_err(|e| format!("no se puede leer '{entry}': {e}"))?;
    let raiz = carpeta
        .canonicalize()
        .map_err(|e| format!("no se puede leer la carpeta del plugin: {e}"))?;

    if !real.starts_with(&raiz) {
        return Err(format!("'{entry}' apunta afuera de la carpeta del plugin"));
    }
    if !real.is_file() {
        return Err(format!("'{entry}' no es un archivo"));
    }
    Ok(())
}

/// El codigo del `entry`, para que el frontend lo meta en el iframe.
///
/// Lo lee Rust y no el webview: el webview no tiene acceso al sistema de
/// archivos, y darselo para esto abriria un agujero mucho mas grande que el
/// problema que resuelve.
pub fn leer_entry(plugin: &Plugin) -> Result<String, String> {
    let entry = plugin
        .entry
        .as_ref()
        .ok_or_else(|| format!("el plugin '{}' no tiene entry", plugin.id))?;
    let carpeta = Path::new(&plugin.carpeta);
    validar_entry(carpeta, entry)?;
    std::fs::read_to_string(carpeta.join(entry)).map_err(|e| e.to_string())
}
