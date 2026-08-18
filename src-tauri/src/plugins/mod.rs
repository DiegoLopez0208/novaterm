#[cfg(test)]
mod tests;

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::profiles::Profile;

/// Un plugin es una carpeta con un `plugin.toml`. No ejecuta codigo propio:
/// declara que aporta, y la app lo interpreta.
///
/// Es a proposito. Cargar JavaScript de terceros dentro del webview le daria a
/// cualquier plugin acceso a todas las sesiones abiertas; con manifiestos
/// declarativos, lo peor que puede hacer un plugin es correr el comando que
/// declara, con argumentos separados y sin shell de por medio.
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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WidgetPlugin {
    pub id: String,
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default = "intervalo_por_defecto")]
    pub intervalo_ms: u64,
    /// Texto que se antepone a la salida, por ejemplo "git:".
    #[serde(default)]
    pub prefijo: String,
    /// Se ejecuta dentro del directorio actual de la terminal, si se conoce.
    #[serde(default)]
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

    Ok(plugin)
}

/// Ejecuta el comando de un widget y devuelve su salida en una linea.
///
/// El comando y los argumentos van separados hasta CreateProcess: no hay shell
/// de por medio, asi que un manifiesto no puede encadenar comandos con `&&` ni
/// expandir comodines.
pub fn ejecutar_widget(widget: &WidgetPlugin, cwd: Option<&str>) -> Result<String, String> {
    let mut comando = std::process::Command::new(&widget.command);
    comando.args(&widget.args);

    if widget.usar_cwd {
        if let Some(dir) = cwd.filter(|d| Path::new(d).is_dir()) {
            comando.current_dir(dir);
        }
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW: sin esto, cada refresco del widget parpadea una
        // consola negra encima de la terminal.
        comando.creation_flags(0x0800_0000);
    }

    let salida = comando.output().map_err(|e| e.to_string())?;
    if !salida.status.success() {
        return Err(format!("salio con {}", salida.status));
    }

    let texto = String::from_utf8_lossy(&salida.stdout)
        .lines()
        .next()
        .unwrap_or("")
        .trim()
        .to_string();

    Ok(if texto.is_empty() {
        String::new()
    } else {
        format!("{}{}", widget.prefijo, texto)
    })
}
