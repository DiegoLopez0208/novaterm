#[cfg(test)]
mod tests;

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::profiles::Profile;

/// Una conexion guardada.
///
/// **No hay campo de contraseña, y no es un olvido.** Guardarla en un archivo la
/// deja legible para cualquier cosa que corra como el usuario, y cifrarla con
/// una clave que tambien vive en la misma maquina solo lo disimula. Con clave
/// publica no hace falta ningun secreto de este lado; y si el servidor pide
/// contraseña igual, la pide `ssh` dentro de la terminal, que es un PTY de
/// verdad y sabe leerla sin mostrarla en pantalla.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Conexion {
    pub id: String,
    pub nombre: String,
    pub host: String,
    #[serde(default)]
    pub usuario: String,
    #[serde(default = "puerto_por_defecto")]
    pub puerto: u16,
    /// Ruta a la clave privada. Vacio = que ssh elija (agente o ~/.ssh/id_*).
    #[serde(default)]
    pub identidad: String,
}

fn puerto_por_defecto() -> u16 {
    22
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct Archivo {
    #[serde(default)]
    conexiones: Vec<Conexion>,
}

pub fn ruta_archivo() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_default()
        .join(".novaterm")
        .join("ssh.toml")
}

pub fn cargar(ruta: &Path) -> Vec<Conexion> {
    let Ok(texto) = std::fs::read_to_string(ruta) else {
        return Vec::new();
    };
    let sin_bom = texto.strip_prefix('\u{feff}').unwrap_or(&texto);
    match toml::from_str::<Archivo>(sin_bom) {
        Ok(archivo) => archivo.conexiones,
        Err(err) => {
            log::warn!("ssh.toml invalido: {err}");
            Vec::new()
        }
    }
}

pub fn guardar(ruta: &Path, conexiones: &[Conexion]) -> Result<(), String> {
    let archivo = Archivo {
        conexiones: conexiones.to_vec(),
    };
    let texto = toml::to_string_pretty(&archivo).map_err(|e| e.to_string())?;
    if let Some(dir) = ruta.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    std::fs::write(ruta, texto).map_err(|e| e.to_string())
}

/// Arma los argumentos de `ssh`. Cada uno va por separado: host y usuario salen
/// de un archivo que el usuario edita, y armar con ellos una linea de comando
/// dejaria que un `; rm -rf` escrito en el campo host se ejecutara.
pub fn argumentos(conexion: &Conexion) -> Vec<String> {
    let mut args = Vec::new();

    if conexion.puerto != 22 {
        args.push("-p".into());
        args.push(conexion.puerto.to_string());
    }
    if !conexion.identidad.trim().is_empty() {
        args.push("-i".into());
        args.push(conexion.identidad.clone());
    }

    let destino = if conexion.usuario.trim().is_empty() {
        conexion.host.clone()
    } else {
        format!("{}@{}", conexion.usuario, conexion.host)
    };
    args.push(destino);

    args
}

pub fn a_perfil(conexion: &Conexion) -> Profile {
    Profile {
        id: format!("ssh-{}", conexion.id),
        name: conexion.nombre.clone(),
        command: "ssh".into(),
        args: argumentos(conexion),
        icon: "ssh".into(),
        cwd: None,
        detectado: false,
    }
}
