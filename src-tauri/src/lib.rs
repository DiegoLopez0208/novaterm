mod commands;
#[cfg(test)]
mod tests_color;

pub mod config;
pub mod plugins;
pub mod profiles;
pub mod pty;
pub mod ssh;
pub mod stats;

use tauri::{Manager, RunEvent, WindowEvent};

use crate::config::{watch_config, ConfigStore};
use crate::profiles::DeteccionCache;
use crate::pty::PtyManager;
use crate::stats::Monitor;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let store = ConfigStore::load();

    // La config viaja al webview **antes** de que cargue el documento, asi el
    // primer render no espera un `invoke`: sin esto el frontend no dibujaba
    // nada hasta que volvia `config_get`, y con la ventana transparente eso se
    // veia como un rectangulo vacio.
    //
    // Va aca y no en `setup()`: `js_init_script` solo alcanza a los webviews
    // que se creen **despues** de registrar el plugin, y para cuando corre
    // `setup` la ventana de `tauri.conf.json` ya existe. Registrado ahi, el
    // script no llegaba nunca (`window.__NOVA_CONFIG__` quedaba `undefined`) y
    // el arranque seguia pagando el round-trip.
    let inyectar_config = serde_json::to_string(&store.current())
        .map(|json| format!("window.__NOVA_CONFIG__ = {json};"))
        .unwrap_or_default();

    let app = tauri::Builder::default()
        .plugin(
            tauri::plugin::Builder::<tauri::Wry>::new("nova-config")
                .js_init_script(inyectar_config)
                .build(),
        )
        .manage(PtyManager::default())
        .manage(store)
        .manage(Monitor::default())
        .manage(DeteccionCache::default())
        .invoke_handler(tauri::generate_handler![
            commands::pty_spawn,
            commands::pty_write,
            commands::pty_resize,
            commands::pty_close,
            commands::config_get,
            commands::config_path,
            commands::config_save,
            commands::config_reload,
            commands::profiles_list,
            commands::profiles_refresh,
            commands::window_ready,
            commands::system_stats,
            commands::system_info,
            commands::plugins_list,
            commands::plugin_widget_run,
            commands::ssh_list,
            commands::ssh_save,
            commands::ssh_delete,
            commands::window_border
        ])
        .setup(|app| {
            // Tambien en release: sin log, un fallo al abrir el shell en el
            // binario final no deja ningun rastro para diagnosticar.
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log::LevelFilter::Info)
                    .build(),
            )?;

            let config = app.state::<ConfigStore>().current();

            if let Some(window) = app.get_webview_window("main") {
                aplicar_efecto_de_fondo(&window, config.window.blur);
                aplicar_bordes(&window, hex_a_rgb(&config.colors.normal.blue));
                let _ = window.set_decorations(config.window.decorations);
            }

            // La deteccion de shells lanza `wsl.exe`, que con el subsistema
            // frio tarda segundos. Se calienta aparte para que la lista ya este
            // cuando el frontend la pida.
            let para_deteccion = app.handle().clone();
            std::thread::spawn(move || {
                let _ = para_deteccion.state::<DeteccionCache>().obtener();
            });

            // Red de seguridad del arranque: si el frontend revienta antes de
            // llamar a `window_ready`, la ventana nunca aparece y la app queda
            // de proceso fantasma. A los tres segundos se muestra igual.
            let para_ventana = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(3));
                if let Some(window) = para_ventana.get_webview_window("main") {
                    if !window.is_visible().unwrap_or(false) {
                        let _ = window.show();
                    }
                }
            });

            watch_config(app.handle().clone());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    // Sin esto los shells quedan vivos despues de cerrar la ventana: soltar el
    // master del PTY no mata al proceso hijo.
    app.run(|handle, event| {
        if let RunEvent::WindowEvent {
            event: WindowEvent::Destroyed,
            ..
        } = event
        {
            handle.state::<PtyManager>().close_all();
        }
    });
}

/// El desenfoque lo dibuja el compositor de Windows detras de la ventana; el
/// color de la terminal se pinta encima con alpha desde el frontend. Por eso el
/// blur se decide aca y la opacidad alla.
///
/// Va por `DWMWA_SYSTEMBACKDROP_TYPE` y no por el acrilico clasico
/// (`ACCENT_ENABLE_ACRYLICBLURBEHIND`, que es lo que usa window-vibrancy): en
/// Windows 11 ese efecto viejo pinta un fondo **solido** y se come toda la
/// transparencia. Verificado a ojo comparando capturas de pantalla completas.
#[cfg(windows)]
pub fn aplicar_efecto_de_fondo<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>, blur: bool) {
    use windows_sys::Win32::Graphics::Dwm::{
        DwmSetWindowAttribute, DWMSBT_NONE, DWMSBT_TRANSIENTWINDOW, DWMWA_SYSTEMBACKDROP_TYPE,
    };

    let Ok(hwnd) = window.hwnd() else {
        log::warn!("sin HWND: no se aplica el fondo");
        return;
    };

    // TRANSIENTWINDOW es el acrilico moderno, el mismo de los menus flotantes
    // del sistema.
    let modo: i32 = if blur {
        DWMSBT_TRANSIENTWINDOW
    } else {
        DWMSBT_NONE
    };

    // SAFETY: el HWND viene de la ventana viva y el atributo es un i32 del
    // tamano que la API declara.
    let resultado = unsafe {
        DwmSetWindowAttribute(
            hwnd.0 as _,
            DWMWA_SYSTEMBACKDROP_TYPE as u32,
            &modo as *const i32 as *const _,
            std::mem::size_of::<i32>() as u32,
        )
    };

    if resultado != 0 {
        log::warn!("DwmSetWindowAttribute devolvio {resultado:#x}");
    }
}

#[cfg(not(windows))]
pub fn aplicar_efecto_de_fondo<R: tauri::Runtime>(_window: &tauri::WebviewWindow<R>, _blur: bool) {}

/// Esquinas redondeadas y color de borde.
///
/// Al sacar la barra de titulo nativa la ventana pierde el redondeo del sistema
/// y queda un rectangulo cortado a filo. Windows 11 lo devuelve por
/// `DWMWA_WINDOW_CORNER_PREFERENCE`, y de paso `DWMWA_BORDER_COLOR` permite
/// teñir el borde con el color del tema en vez del gris por defecto.
#[cfg(windows)]
pub fn aplicar_bordes<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
    color: Option<(u8, u8, u8)>,
) {
    use windows_sys::Win32::Graphics::Dwm::{
        DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND,
    };

    let Ok(hwnd) = window.hwnd() else { return };

    let redondeo: i32 = DWMWCP_ROUND;
    // SAFETY: el HWND viene de la ventana viva y los atributos son i32/u32 del
    // tamaño que declara la API.
    unsafe {
        DwmSetWindowAttribute(
            hwnd.0 as _,
            DWMWA_WINDOW_CORNER_PREFERENCE as u32,
            &redondeo as *const i32 as *const _,
            std::mem::size_of::<i32>() as u32,
        );
    }

    if let Some((r, g, b)) = color {
        // COLORREF es 0x00BBGGRR: el orden va al reves de lo que uno escribe.
        let colorref: u32 = (b as u32) << 16 | (g as u32) << 8 | r as u32;
        unsafe {
            DwmSetWindowAttribute(
                hwnd.0 as _,
                DWMWA_BORDER_COLOR as u32,
                &colorref as *const u32 as *const _,
                std::mem::size_of::<u32>() as u32,
            );
        }
    }
}

#[cfg(not(windows))]
pub fn aplicar_bordes<R: tauri::Runtime>(
    _window: &tauri::WebviewWindow<R>,
    _color: Option<(u8, u8, u8)>,
) {
}

/// "#84a0c6" -> (132, 160, 198). Devuelve None si el texto no es un color.
pub fn hex_a_rgb(hex: &str) -> Option<(u8, u8, u8)> {
    let limpio = hex.trim().trim_start_matches('#');
    if limpio.len() != 6 {
        return None;
    }
    Some((
        u8::from_str_radix(&limpio[0..2], 16).ok()?,
        u8::from_str_radix(&limpio[2..4], 16).ok()?,
        u8::from_str_radix(&limpio[4..6], 16).ok()?,
    ))
}
