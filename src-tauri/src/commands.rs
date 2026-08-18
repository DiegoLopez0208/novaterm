use std::sync::Arc;

use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::{AppHandle, Manager, State};

use crate::config::{Config, ConfigStore};
use crate::plugins::{descubrir, directorio_plugins, ejecutar_widget, Plugin, WidgetPlugin};
use crate::profiles::{combinar, DeteccionCache, Profile};
use crate::ssh;
use crate::pty::{CanalSink, ExitPayload, PtyManager, PtySink, SpawnOptions};
use crate::stats::{info_sistema, InfoSistema, Monitor, Stats};

/// El orden es el de prioridad: lo tuyo primero, despues lo que aportan los
/// plugins y las conexiones guardadas, y al final lo que se detecto solo.
///
/// Lo propio se relee siempre —son tres archivos chicos— pero la deteccion de
/// shells sale de la cache: es la que lanza `wsl.exe` y frenaba el arranque.
#[tauri::command]
pub fn profiles_list(
    store: State<'_, ConfigStore>,
    deteccion: State<'_, DeteccionCache>,
) -> Vec<Profile> {
    let mut propios = store.current().profiles;

    for plugin in descubrir(&directorio_plugins()) {
        propios.extend(plugin.profiles);
    }
    for conexion in ssh::cargar(&ssh::ruta_archivo()) {
        propios.push(ssh::a_perfil(&conexion));
    }

    combinar(propios, deteccion.obtener())
}

/// Vuelve a detectar los shells instalados. Es lo que hay que llamar si
/// instalaste WSL o pwsh con la app abierta: antes pasaba solo, al precio de
/// correr `wsl.exe` en cada refresco de la lista.
#[tauri::command]
pub fn profiles_refresh(
    store: State<'_, ConfigStore>,
    deteccion: State<'_, DeteccionCache>,
) -> Vec<Profile> {
    deteccion.invalidar();
    profiles_list(store, deteccion)
}

/// El frontend avisa que ya pinto el primer frame. La ventana nace oculta
/// (`visible: false`) para no mostrar un rectangulo transparente vacio mientras
/// carga el webview.
#[tauri::command]
pub fn window_ready(app: AppHandle, store: State<'_, ConfigStore>) {
    let Some(ventana) = app.get_webview_window("main") else {
        return;
    };

    let _ = ventana.show();
    let _ = ventana.set_focus();

    // El acrilico y el borde se aplican tambien aca, y no solo en `setup`: el
    // compositor de Windows ignora los atributos DWM de una ventana que todavia
    // no se mostro, y desde que la ventana nace oculta esa era la unica pasada.
    let config = store.current();
    crate::aplicar_efecto_de_fondo(&ventana, config.window.blur);
    crate::aplicar_bordes(&ventana, crate::hex_a_rgb(&config.colors.normal.blue));
}

#[tauri::command]
pub fn plugins_list() -> Vec<Plugin> {
    descubrir(&directorio_plugins())
}

/// Corre el comando de un widget de plugin. El frontend lo llama con el
/// intervalo que el propio plugin declara.
#[tauri::command]
pub fn plugin_widget_run(widget: WidgetPlugin, cwd: Option<String>) -> Result<String, String> {
    ejecutar_widget(&widget, cwd.as_deref())
}

#[tauri::command]
pub fn ssh_list() -> Vec<ssh::Conexion> {
    ssh::cargar(&ssh::ruta_archivo())
}

#[tauri::command]
pub fn ssh_save(conexion: ssh::Conexion) -> Result<Vec<ssh::Conexion>, String> {
    let ruta = ssh::ruta_archivo();
    let mut conexiones = ssh::cargar(&ruta);

    match conexiones.iter_mut().find(|c| c.id == conexion.id) {
        Some(existente) => *existente = conexion,
        None => conexiones.push(conexion),
    }

    ssh::guardar(&ruta, &conexiones)?;
    Ok(conexiones)
}

#[tauri::command]
pub fn ssh_delete(id: String) -> Result<Vec<ssh::Conexion>, String> {
    let ruta = ssh::ruta_archivo();
    let conexiones: Vec<_> = ssh::cargar(&ruta).into_iter().filter(|c| c.id != id).collect();
    ssh::guardar(&ruta, &conexiones)?;
    Ok(conexiones)
}

#[tauri::command]
pub fn system_stats(monitor: State<'_, Monitor>) -> Result<Stats, String> {
    monitor.leer()
}

/// Lo fijo del equipo, para la bienvenida de cada panel. Se calcula una sola
/// vez por sesion (ver `stats::info_sistema`).
#[tauri::command]
pub fn system_info() -> InfoSistema {
    info_sistema()
}

/// Tiñe el borde de la ventana con el color que le pasa el frontend, para que
/// acompañe al tema elegido. Lo dibuja el compositor, no el HTML.
#[tauri::command]
pub fn window_border(app: AppHandle, color: String) {
    if let Some(window) = app.get_webview_window("main") {
        crate::aplicar_bordes(&window, crate::hex_a_rgb(&color));
    }
}

/// Prende o apaga el acrilico sobre la ventana viva. Antes el interruptor de
/// Ajustes solo se leia en `setup`, asi que cambiarlo pedia reiniciar.
#[tauri::command]
pub fn window_blur(app: AppHandle, blur: bool) {
    if let Some(window) = app.get_webview_window("main") {
        crate::aplicar_efecto_de_fondo(&window, blur);
    }
}

#[tauri::command]
pub fn config_get(store: State<'_, ConfigStore>) -> Config {
    store.current()
}

#[tauri::command]
pub fn config_path(store: State<'_, ConfigStore>) -> String {
    store.path().display().to_string()
}

/// Guardar dispara el watcher, que reemite `config://changed`. El frontend se
/// entera por el mismo camino escriba quien escriba: la GUI o el editor.
#[tauri::command]
pub fn config_save(store: State<'_, ConfigStore>, config: Config) -> Result<(), String> {
    store.save(&config)
}

#[tauri::command]
pub fn config_reload(store: State<'_, ConfigStore>) -> Result<Config, String> {
    store.reload()
}

#[tauri::command]
pub fn pty_spawn(
    manager: State<'_, PtyManager>,
    id: String,
    options: SpawnOptions,
    on_data: Channel<InvokeResponseBody>,
    on_exit: Channel<ExitPayload>,
) -> Result<String, String> {
    manager.spawn(&id, options, move |_id| {
        Arc::new(CanalSink::new(on_data, on_exit)) as Arc<dyn PtySink>
    })
}

#[tauri::command]
pub fn pty_write(manager: State<'_, PtyManager>, id: String, data: String) -> Result<(), String> {
    manager.write(&id, &data)
}

#[tauri::command]
pub fn pty_resize(
    manager: State<'_, PtyManager>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    manager.resize(&id, cols, rows)
}

#[tauri::command]
pub fn pty_close(manager: State<'_, PtyManager>, id: String) -> Result<(), String> {
    manager.close(&id)
}
