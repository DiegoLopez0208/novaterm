use std::sync::{Mutex, OnceLock};

use serde::Serialize;
use sysinfo::{CpuRefreshKind, MemoryRefreshKind, RefreshKind, System};

#[derive(Debug, Clone, Serialize)]
pub struct Stats {
    /// Uso de CPU en porcentaje, 0 a 100.
    pub cpu: f32,
    pub ram_usada: u64,
    pub ram_total: u64,
}

/// El System se conserva entre lecturas porque el uso de CPU se calcula
/// comparando contra la medicion anterior: una instancia nueva siempre
/// informaria 0.
pub struct Monitor {
    sistema: Mutex<System>,
}

impl Default for Monitor {
    fn default() -> Self {
        let sistema = System::new_with_specifics(
            RefreshKind::nothing()
                .with_cpu(CpuRefreshKind::nothing().with_cpu_usage())
                .with_memory(MemoryRefreshKind::nothing().with_ram()),
        );
        Self {
            sistema: Mutex::new(sistema),
        }
    }
}

impl Monitor {
    pub fn leer(&self) -> Result<Stats, String> {
        let mut sistema = self.sistema.lock().map_err(|e| e.to_string())?;
        sistema.refresh_cpu_usage();
        sistema.refresh_memory();

        Ok(Stats {
            cpu: sistema.global_cpu_usage(),
            ram_usada: sistema.used_memory(),
            ram_total: sistema.total_memory(),
        })
    }
}

/// Lo que muestra la bienvenida de la terminal, al estilo de fastfetch.
///
/// Nada de esto cambia mientras la app corre, asi que se lee una sola vez y se
/// guarda: la bienvenida se dibuja al abrir **cada** panel y no puede pagar un
/// escaneo del sistema cada vez.
#[derive(Debug, Clone, Serialize)]
pub struct InfoSistema {
    pub host: String,
    pub usuario: String,
    pub so: String,
    pub version: String,
    pub cpu: String,
    pub nucleos: usize,
    pub ram_total: u64,
    /// `None` si no se pudo averiguar; la bienvenida omite la linea.
    pub gpu: Option<String>,
    /// Segundos desde que arranco el sistema.
    pub uptime: u64,
    /// La version de la app, de `Cargo.toml`.
    pub novaterm: String,
}

static INFO: OnceLock<InfoSistema> = OnceLock::new();

pub fn info_sistema() -> InfoSistema {
    INFO.get_or_init(|| {
        let sistema = System::new_with_specifics(
            RefreshKind::nothing()
                .with_cpu(CpuRefreshKind::everything())
                .with_memory(MemoryRefreshKind::nothing().with_ram()),
        );

        let cpu = sistema
            .cpus()
            .first()
            .map(|c| c.brand().trim().to_string())
            .filter(|marca| !marca.is_empty())
            .unwrap_or_else(|| "desconocido".to_string());

        InfoSistema {
            host: System::host_name().unwrap_or_default(),
            usuario: std::env::var("USERNAME")
                .or_else(|_| std::env::var("USER"))
                .unwrap_or_default(),
            so: System::name().unwrap_or_else(|| "desconocido".to_string()),
            version: System::os_version().unwrap_or_default(),
            cpu,
            nucleos: sistema.cpus().len(),
            ram_total: sistema.total_memory(),
            gpu: gpu(),
            uptime: System::uptime(),
            novaterm: env!("CARGO_PKG_VERSION").to_string(),
        }
    })
    .clone()
}

/// El nombre de la placa de video sale del registro y no de `wmic`: lanzar un
/// proceso para esto agregaria medio segundo al primer panel, que es
/// justamente lo que se acaba de sacar del arranque.
///
/// La clave es la del adaptador 0000 de la clase de adaptadores de pantalla.
#[cfg(windows)]
fn gpu() -> Option<String> {
    use std::ffi::OsString;
    use std::os::windows::ffi::{OsStrExt, OsStringExt};
    use windows_sys::Win32::System::Registry::{
        RegGetValueW, HKEY_LOCAL_MACHINE, RRF_RT_REG_SZ,
    };

    let ruta: Vec<u16> = std::ffi::OsStr::new(
        r"SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}\0000",
    )
    .encode_wide()
    .chain(std::iter::once(0))
    .collect();
    let valor: Vec<u16> = std::ffi::OsStr::new("DriverDesc")
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    let mut buffer = [0u16; 128];
    let mut bytes = (buffer.len() * 2) as u32;

    // SAFETY: las dos cadenas terminan en NUL y el tamaño que se declara es el
    // del buffer en bytes, que es lo que la API espera.
    let resultado = unsafe {
        RegGetValueW(
            HKEY_LOCAL_MACHINE,
            ruta.as_ptr(),
            valor.as_ptr(),
            RRF_RT_REG_SZ,
            std::ptr::null_mut(),
            buffer.as_mut_ptr() as *mut _,
            &mut bytes,
        )
    };
    if resultado != 0 {
        return None;
    }

    let largo = (bytes as usize / 2).saturating_sub(1);
    let nombre = OsString::from_wide(&buffer[..largo.min(buffer.len())])
        .to_string_lossy()
        .trim()
        .to_string();

    (!nombre.is_empty()).then_some(nombre)
}

#[cfg(not(windows))]
fn gpu() -> Option<String> {
    None
}
