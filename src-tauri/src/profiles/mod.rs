#[cfg(test)]
mod tests;

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Profile {
    pub id: String,
    pub name: String,
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub icon: String,
    #[serde(default)]
    pub cwd: Option<String>,
    /// Lo encontro la deteccion automatica. Los del config van en false.
    #[serde(default)]
    pub detectado: bool,
}

impl Profile {
    fn nuevo(id: &str, name: &str, command: impl Into<String>, icon: &str) -> Self {
        Self {
            id: id.to_string(),
            name: name.to_string(),
            command: command.into(),
            args: Vec::new(),
            icon: icon.to_string(),
            cwd: None,
            detectado: true,
        }
    }

    fn con_args(mut self, args: &[&str]) -> Self {
        self.args = args.iter().map(|a| a.to_string()).collect();
        self
    }
}

/// Los perfiles del config van primero, para que el usuario pueda pisar uno
/// detectado reusando su id.
pub fn combinar(configurados: Vec<Profile>, detectados: Vec<Profile>) -> Vec<Profile> {
    let mut salida = configurados;
    for detectado in detectados {
        if !salida.iter().any(|p| p.id == detectado.id) {
            salida.push(detectado);
        }
    }
    salida
}

/// `detectar()` corre `wsl.exe -l -q`, que con el subsistema frio tarda de
/// cientos de milisegundos a varios segundos, y hasta ahora eso pasaba **en
/// cada** `profiles_list`, incluida la del arranque. Se calcula una vez, en un
/// hilo aparte al iniciar, y se rehace solo cuando alguien lo pide.
#[derive(Default)]
pub struct DeteccionCache(std::sync::Mutex<Option<Vec<Profile>>>);

impl DeteccionCache {
    pub fn obtener(&self) -> Vec<Profile> {
        // El lock se sostiene durante la deteccion a proposito: si dos hilos
        // llegan juntos, el segundo espera en vez de lanzar otro `wsl.exe`.
        let mut guardia = self.0.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(cache) = guardia.as_ref() {
            return cache.clone();
        }
        let detectados = detectar();
        *guardia = Some(detectados.clone());
        detectados
    }

    pub fn invalidar(&self) {
        *self.0.lock().unwrap_or_else(|e| e.into_inner()) = None;
    }
}

pub fn detectar() -> Vec<Profile> {
    #[cfg(windows)]
    {
        detectar_windows()
    }
    #[cfg(not(windows))]
    {
        detectar_unix()
    }
}

#[cfg(windows)]
fn detectar_windows() -> Vec<Profile> {
    let system_root = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".into());
    let system32 = PathBuf::from(&system_root).join("System32");
    let mut perfiles = Vec::new();

    let windows_powershell = system32
        .join("WindowsPowerShell")
        .join("v1.0")
        .join("powershell.exe");
    if windows_powershell.exists() {
        perfiles.push(Profile::nuevo(
            "windows-powershell",
            "Windows PowerShell",
            ruta(&windows_powershell),
            "powershell",
        ));
    }

    for base in ["ProgramFiles", "ProgramFiles(x86)", "LocalAppData"] {
        let Ok(dir) = std::env::var(base) else { continue };
        let pwsh = PathBuf::from(dir).join("PowerShell").join("7").join("pwsh.exe");
        if pwsh.exists() {
            perfiles.push(Profile::nuevo("pwsh", "PowerShell 7", ruta(&pwsh), "powershell"));
            break;
        }
    }

    let cmd = system32.join("cmd.exe");
    if cmd.exists() {
        perfiles.push(Profile::nuevo("cmd", "Símbolo del sistema", ruta(&cmd), "cmd"));
    }

    let wsl = system32.join("wsl.exe");
    if wsl.exists() {
        for distro in distros_wsl(&wsl) {
            perfiles.push(
                Profile::nuevo(
                    &format!("wsl-{}", distro.to_lowercase().replace(' ', "-")),
                    &distro,
                    ruta(&wsl),
                    "linux",
                )
                .con_args(&["-d", &distro]),
            );
        }
    }

    for base in ["ProgramFiles", "ProgramFiles(x86)"] {
        let Ok(dir) = std::env::var(base) else { continue };
        let bash = PathBuf::from(dir).join("Git").join("bin").join("bash.exe");
        if bash.exists() {
            // -i -l: interactivo y de login, o el prompt sale pelado y no se
            // cargan ni el .bashrc ni el PATH de Git.
            perfiles.push(
                Profile::nuevo("git-bash", "Git Bash", ruta(&bash), "bash").con_args(&["-i", "-l"]),
            );
            break;
        }
    }

    perfiles
}

/// `wsl -l -q` escribe en **UTF-16LE**, no en UTF-8: leerlo como UTF-8 devuelve
/// los nombres con un byte cero entre cada letra.
#[cfg(windows)]
fn distros_wsl(wsl: &Path) -> Vec<String> {
    let salida = match std::process::Command::new(wsl).args(["-l", "-q"]).output() {
        Ok(salida) if salida.status.success() => salida.stdout,
        _ => return Vec::new(),
    };

    decodificar_utf16(&salida)
        .lines()
        .map(|linea| linea.trim().trim_end_matches('\0').to_string())
        .filter(|linea| !linea.is_empty())
        .filter(|linea| !es_distro_de_sistema(linea))
        .collect()
}

/// Docker registra sus propias distros en WSL. No son shells que quieras abrir:
/// aparecen en la lista pero arrancan un entorno que no tiene ni prompt util.
pub fn es_distro_de_sistema(nombre: &str) -> bool {
    let minuscula = nombre.to_lowercase();
    minuscula.starts_with("docker-desktop") || minuscula.starts_with("rancher-desktop")
}

pub fn decodificar_utf16(bytes: &[u8]) -> String {
    let utf16: Vec<u16> = bytes
        .chunks_exact(2)
        .map(|par| u16::from_le_bytes([par[0], par[1]]))
        .collect();
    String::from_utf16_lossy(&utf16)
}

#[cfg(not(windows))]
fn detectar_unix() -> Vec<Profile> {
    let mut perfiles = Vec::new();
    for (id, nombre, ruta_shell) in [
        ("bash", "bash", "/bin/bash"),
        ("zsh", "zsh", "/bin/zsh"),
        ("fish", "fish", "/usr/bin/fish"),
        ("sh", "sh", "/bin/sh"),
    ] {
        if Path::new(ruta_shell).exists() {
            perfiles.push(Profile::nuevo(id, nombre, ruta_shell, "bash"));
        }
    }
    perfiles
}

fn ruta(path: &Path) -> String {
    path.display().to_string()
}
