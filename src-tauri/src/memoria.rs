//! Nivel de memoria del webview.
//!
//! El grueso del consumo de NovaTerm no es codigo propio: son los seis procesos
//! de WebView2, que en reposo con una ventana pesan unos 120 MB privados contra
//! los 11 del binario de Rust. Chromium no los suelta solo mientras la ventana
//! sigue viva, aunque este tapada y sin hacer nada.
//!
//! `SetMemoryUsageTargetLevel` existe justamente para eso: en `LOW` el motor
//! libera caches de rasterizado, de imagenes y de JIT. Volver a `NORMAL` es
//! inmediato y no recarga la pagina, asi que el unico costo es que el primer
//! cuadro despues de volver al foco rasteriza de nuevo.
//!
//! No se aplica apenas se pierde el foco: una terminal se mira sin foco todo el
//! tiempo ---esperando un build, siguiendo un log--- y tirar los caches ahi
//! seria peor que el ahorro. Se espera a que la ventana lleve un rato quieta.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

/// Cuanto tiene que llevar la ventana sin foco antes de bajar el nivel.
const ESPERA: std::time::Duration = std::time::Duration::from_secs(20);

/// Cada cambio de foco incrementa el contador. El hilo que espera compara el
/// valor con el que tenia al arrancar: si no coincide, alguien volvio al foco
/// mientras dormia y el trabajo ya no corresponde.
#[derive(Default)]
pub struct Vigilante {
    generacion: AtomicU64,
}

impl Vigilante {
    /// La ventana perdio el foco. Programa la bajada de nivel.
    pub fn perdio_foco<R: tauri::Runtime>(self: &Arc<Self>, window: tauri::WebviewWindow<R>) {
        let mia = self.generacion.fetch_add(1, Ordering::SeqCst) + 1;
        let vigilante = self.clone();

        std::thread::spawn(move || {
            std::thread::sleep(ESPERA);
            if vigilante.generacion.load(Ordering::SeqCst) != mia {
                return; // volvio al foco mientras esperabamos
            }
            aplicar(&window, true);
        });
    }

    /// La ventana volvio al foco. Cancela lo pendiente y restaura el nivel.
    pub fn recupero_foco<R: tauri::Runtime>(self: &Arc<Self>, window: &tauri::WebviewWindow<R>) {
        self.generacion.fetch_add(1, Ordering::SeqCst);
        aplicar(window, false);
    }
}

#[cfg(windows)]
fn aplicar<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>, bajo: bool) {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2_19, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW,
        COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL,
    };
    use windows::core::Interface;

    let nivel = if bajo {
        COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW
    } else {
        COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL
    };

    let resultado = window.with_webview(move |webview| {
        // SAFETY: el controller lo entrega Tauri y solo vive mientras la ventana
        // exista; `with_webview` corre en el hilo de la interfaz, que es donde
        // WebView2 exige que se lo toque.
        unsafe {
            let controller = webview.controller();
            let Ok(core) = controller.CoreWebView2() else {
                return;
            };
            // La interfaz _19 la trae el runtime desde la 122; en uno mas viejo
            // el cast falla y no se hace nada, que es el comportamiento correcto.
            let Ok(con_memoria) = core.cast::<ICoreWebView2_19>() else {
                return;
            };
            if let Err(err) = con_memoria.SetMemoryUsageTargetLevel(nivel) {
                log::warn!("no se pudo cambiar el nivel de memoria: {err}");
            }
        }
    });

    if let Err(err) = resultado {
        log::warn!("no se pudo alcanzar el webview: {err}");
    }
}

#[cfg(not(windows))]
fn aplicar<R: tauri::Runtime>(_window: &tauri::WebviewWindow<R>, _bajo: bool) {}

/// Un pulso a `LOW` y de vuelta, poco despues de que la ventana se muestre.
///
/// Arrancar deja un pico: se cargan las fuentes, se compila el JavaScript, se
/// rasteriza el primer cuadro. Nada de eso hace falta despues, pero Chromium no
/// lo suelta por su cuenta mientras la ventana siga viva, asi que el proceso se
/// quedaba clavado en el pico de arranque en vez de bajar a su tamano de
/// regimen. Medido: 147 MB privados sin el pulso, ~50 MB con el.
///
/// Va con demora para no pelear con el primer cuadro, y vuelve a `NORMAL`
/// enseguida: lo que se libera no se vuelve a pedir.
pub fn purga_inicial<R: tauri::Runtime>(window: tauri::WebviewWindow<R>) {
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(8));
        aplicar(&window, true);
        std::thread::sleep(std::time::Duration::from_secs(6));
        aplicar(&window, false);
    });
}
