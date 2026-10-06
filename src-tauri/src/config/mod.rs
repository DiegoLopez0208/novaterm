mod defaults;
mod watcher;

#[cfg(test)]
mod tests;

pub use watcher::watch_config;

use std::path::{Path, PathBuf};
use std::sync::RwLock;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Config {
    pub window: WindowConfig,
    pub font: FontConfig,
    pub cursor: CursorConfig,
    pub terminal: TerminalConfig,
    pub shell: ShellConfig,
    pub ui: UiConfig,
    pub colors: Colors,
    /// Perfiles propios. Se suman a los que detecta la app; reusar un id pisa
    /// al detectado.
    #[serde(default)]
    pub profiles: Vec<crate::profiles::Profile>,
    #[serde(default)]
    pub llm: LlmConfig,
    #[serde(default)]
    pub plugins: PluginsConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct LlmConfig {
    pub provider: crate::llm::Proveedor,
    /// Vacio significa "el que el proveedor traiga por defecto".
    pub model: String,
    /// Tope de tokens por plugin y por dia. Es lo unico que separa un plugin con
    /// un bucle mal escrito de una factura desagradable.
    pub tokens_por_dia: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct PluginsConfig {
    /// Permisos que el usuario aprobo, por id de plugin. Un permiso que no este
    /// aca se rechaza aunque el manifiesto lo declare: instalar no es aprobar.
    pub concedidos: std::collections::HashMap<String, Vec<crate::plugins::Permiso>>,
    /// Plugins a los que se les dejo de pedir confirmacion por cada escritura en
    /// la terminal. Se marca a mano y por plugin.
    pub de_confianza: Vec<String>,
    /// De donde salen los plugins del catalogo.
    pub registro: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct WindowConfig {
    /// Opacidad del fondo de la terminal, 0.0 a 1.0. No toca el texto: si se
    /// bajara la opacidad de la ventana entera, las letras se volverian
    /// ilegibles junto con el fondo.
    pub opacity: f32,
    pub blur: bool,
    pub padding: u32,
    pub decorations: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct FontConfig {
    pub family: String,
    pub size: f32,
    pub line_height: f32,
    pub letter_spacing: f32,
    pub ligatures: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct CursorConfig {
    /// block, beam o underline.
    pub style: String,
    pub blink: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct TerminalConfig {
    pub scrollback: u32,
    /// History scroll animation duration; zero disables it.
    pub smooth_scroll_ms: u32,
    pub copy_on_select: bool,
    /// Dibujar con la GPU (WebGL). Apagalo si tu driver hace cosas raras:
    /// el renderer del DOM siempre funciona, pero gasta mas CPU.
    pub gpu: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct ShellConfig {
    pub default_profile: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct UiConfig {
    pub tab_bar: bool,
    pub status_bar: bool,
    pub animations: bool,
    /// La pantalla de bienvenida que dibuja cada panel nuevo.
    pub welcome: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Colors {
    pub background: String,
    pub foreground: String,
    pub cursor: String,
    pub selection: String,
    pub normal: Palette,
    pub bright: Palette,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Palette {
    pub black: String,
    pub red: String,
    pub green: String,
    pub yellow: String,
    pub blue: String,
    pub magenta: String,
    pub cyan: String,
    pub white: String,
}

/// Guarda la config en memoria y la relee del disco. El archivo es la fuente de
/// verdad: la GUI de settings escribe ahi y todo el mundo se entera por el
/// mismo camino que si lo hubieras editado a mano.
pub struct ConfigStore {
    path: PathBuf,
    current: RwLock<Config>,
}

impl ConfigStore {
    pub fn load() -> Self {
        let path = config_path();
        let current = read_or_create(&path);
        Self {
            path,
            current: RwLock::new(current),
        }
    }

    /// Store apuntando a una ruta concreta, para tests y para un futuro flag
    /// `--config`.
    pub fn en(path: PathBuf) -> Self {
        let current = read_or_create(&path);
        Self {
            path,
            current: RwLock::new(current),
        }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn current(&self) -> Config {
        self.current.read().map(|c| c.clone()).unwrap_or_default()
    }

    /// Relee el archivo. Si tiene un error de sintaxis devuelve el error y deja
    /// la config anterior en pie: perder los colores por una coma de mas seria
    /// peor que ignorar el cambio.
    pub fn reload(&self) -> Result<Config, String> {
        let texto = std::fs::read_to_string(&self.path).map_err(|e| e.to_string())?;
        let parsed: Config = toml::from_str(sin_bom(&texto)).map_err(|e| e.to_string())?;
        if let Ok(mut guard) = self.current.write() {
            *guard = parsed.clone();
        }
        Ok(parsed)
    }

    pub fn save(&self, config: &Config) -> Result<(), String> {
        let texto = toml::to_string_pretty(config).map_err(|e| e.to_string())?;
        if let Some(dir) = self.path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        std::fs::write(&self.path, texto).map_err(|e| e.to_string())?;
        if let Ok(mut guard) = self.current.write() {
            *guard = config.clone();
        }
        Ok(())
    }
}

pub fn config_path() -> PathBuf {
    // En Windows el lugar natural es el perfil del usuario, pero si ya existe
    // ~/.novaterm respetamos ese: quien lo creo a mano espera que se use.
    if let Some(home) = dirs::home_dir() {
        let clasico = home.join(".novaterm").join("config.toml");
        if clasico.exists() {
            return clasico;
        }
    }
    if cfg!(windows) {
        if let Some(dir) = dirs::config_dir() {
            return dir.join("novaterm").join("config.toml");
        }
    }
    dirs::home_dir()
        .unwrap_or_default()
        .join(".novaterm")
        .join("config.toml")
}

/// Varios editores de Windows (y `Set-Content -Encoding utf8`) guardan con BOM.
/// El parser de TOML lo toma como basura antes de la primera clave y falla, con
/// lo cual la config del usuario se perderia entera por un caracter invisible.
fn sin_bom(texto: &str) -> &str {
    texto.strip_prefix('\u{feff}').unwrap_or(texto)
}

fn read_or_create(path: &Path) -> Config {
    match std::fs::read_to_string(path) {
        Ok(texto) => toml::from_str(sin_bom(&texto)).unwrap_or_else(|err| {
            log::warn!("config.toml invalido ({err}); se usan los valores por defecto");
            Config::default()
        }),
        Err(_) => {
            let config = Config::default();
            if let Some(dir) = path.parent() {
                let _ = std::fs::create_dir_all(dir);
            }
            if let Ok(texto) = toml::to_string_pretty(&config) {
                let _ = std::fs::write(path, texto);
            }
            config
        }
    }
}
