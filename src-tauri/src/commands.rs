use std::sync::Arc;

use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::{AppHandle, Manager, State};

use crate::config::{Config, ConfigStore};
use crate::plugins::{descubrir, directorio_plugins, ejecutar_widget, Plugin, WidgetPlugin};
use crate::profiles::{combinar, DeteccionCache, Profile};
use crate::ssh;
use crate::llm::Presupuesto;
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

    crate::memoria::purga_inicial(ventana);
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

// --- plugins: permisos, codigo y catalogo -----------------------------------

/// El codigo del plugin, para que el frontend lo meta en su iframe.
///
/// Lo lee Rust y no el webview: el webview no tiene acceso al sistema de
/// archivos, y darselo para esto abriria un agujero mucho mayor que el problema
/// que resuelve.
#[tauri::command]
pub fn plugin_entry(id: String) -> Result<String, String> {
    let plugins = descubrir(&directorio_plugins());
    let plugin = plugins
        .iter()
        .find(|p| p.id == id)
        .ok_or_else(|| format!("no hay ningun plugin instalado con id '{id}'"))?;
    crate::plugins::leer_entry(plugin)
}

/// Guarda lo que el usuario aprobo en la pantalla de consentimiento.
///
/// Se cruzan contra lo que el manifiesto declara: conceder un permiso que el
/// plugin no pidio no tiene sentido y seria una forma de ampliarle el alcance
/// sin que se note en su ficha.
#[tauri::command]
pub fn plugin_conceder(
    store: State<'_, ConfigStore>,
    id: String,
    permisos: Vec<crate::plugins::Permiso>,
) -> Result<(), String> {
    let plugins = descubrir(&directorio_plugins());
    let plugin = plugins
        .iter()
        .find(|p| p.id == id)
        .ok_or_else(|| format!("no hay ningun plugin instalado con id '{id}'"))?;

    for permiso in &permisos {
        if !plugin.permissions.contains(permiso) {
            return Err(format!(
                "el plugin '{id}' no declara el permiso {permiso:?} en su manifiesto"
            ));
        }
    }

    let mut config = store.current();
    config.plugins.concedidos.insert(id, permisos);
    store.save(&config)
}

/// Marca o desmarca un plugin como de confianza. Solo afecta a si se pide
/// confirmacion por cada escritura en la terminal.
#[tauri::command]
pub fn plugin_confianza(
    store: State<'_, ConfigStore>,
    id: String,
    confiar: bool,
) -> Result<(), String> {
    let mut config = store.current();
    config.plugins.de_confianza.retain(|x| x != &id);
    if confiar {
        config.plugins.de_confianza.push(id);
    }
    store.save(&config)
}

#[tauri::command]
pub async fn market_buscar(
    store: State<'_, ConfigStore>,
    consulta: String,
) -> Result<Vec<crate::plugins::instalar::Ficha>, String> {
    let base = store.current().plugins.registro;
    crate::plugins::instalar::buscar(&base, &consulta).await
}

#[tauri::command]
pub async fn market_detalle(
    store: State<'_, ConfigStore>,
    id: String,
) -> Result<crate::plugins::instalar::Ficha, String> {
    let base = store.current().plugins.registro;
    crate::plugins::instalar::detalle(&base, &id).await
}

/// Baja, verifica e instala una version.
///
/// La ficha se vuelve a pedir al registro en vez de aceptar la que manda el
/// frontend: la clave publica del publicador y el sha256 son justo lo que no
/// puede venir del lado que se quiere verificar.
#[tauri::command]
pub async fn plugin_install(
    store: State<'_, ConfigStore>,
    id: String,
    version: Option<String>,
) -> Result<String, String> {
    let base = store.current().plugins.registro;
    let ficha = crate::plugins::instalar::detalle(&base, &id).await?;

    let elegida = match &version {
        Some(v) => ficha.versions.iter().find(|x| &x.version == v),
        None => ficha.versions.last(),
    }
    .ok_or_else(|| "el registro no ofrece esa version".to_string())?
    .clone();

    let raiz = directorio_plugins();
    std::fs::create_dir_all(&raiz).map_err(|e| e.to_string())?;
    let carpeta = crate::plugins::instalar::instalar(&ficha, &elegida, &raiz).await?;
    Ok(carpeta.to_string_lossy().to_string())
}

/// Desinstala y ademas olvida lo que se le habia concedido: si mas adelante se
/// vuelve a instalar, los permisos se piden de nuevo.
#[tauri::command]
pub fn plugin_uninstall(store: State<'_, ConfigStore>, id: String) -> Result<(), String> {
    crate::plugins::instalar::desinstalar(&directorio_plugins(), &id)?;

    let mut config = store.current();
    config.plugins.concedidos.remove(&id);
    config.plugins.de_confianza.retain(|x| x != &id);
    store.save(&config)
}

// --- IA ---------------------------------------------------------------------

#[derive(serde::Serialize)]
pub struct EstadoLlm {
    pub provider: crate::llm::Proveedor,
    pub model: String,
    pub tokens_por_dia: u64,
    pub hay_clave: bool,
    pub gastado: std::collections::HashMap<String, u64>,
}

#[tauri::command]
pub fn llm_estado(store: State<'_, ConfigStore>, presupuesto: State<'_, Presupuesto>) -> EstadoLlm {
    let config = store.current();
    let provider = config.llm.provider;
    EstadoLlm {
        provider,
        model: if config.llm.model.is_empty() {
            provider.modelo_por_defecto().to_string()
        } else {
            config.llm.model.clone()
        },
        tokens_por_dia: config.llm.tokens_por_dia,
        hay_clave: crate::llm::hay_clave(provider),
        gastado: presupuesto.gastado(),
    }
}

/// Guarda la clave en el llavero del sistema. Una clave vacia la borra.
///
/// No devuelve la clave nunca, ni siquiera enmascarada: el frontend solo
/// necesita saber si hay una.
#[tauri::command]
pub fn llm_clave(proveedor: crate::llm::Proveedor, clave: String) -> Result<(), String> {
    crate::llm::guardar_clave(proveedor, &clave)
}

/// Le pide una respuesta al modelo en nombre de un plugin.
///
/// El permiso se vuelve a comprobar aca aunque el broker del frontend ya lo haya
/// hecho. El broker es codigo nuestro, pero es la capa que un bug de la interfaz
/// puede saltear; esta es la que decide de verdad.
#[tauri::command]
pub async fn llm_complete(
    store: State<'_, ConfigStore>,
    presupuesto: State<'_, Presupuesto>,
    plugin_id: String,
    pedido: crate::llm::Pedido,
) -> Result<crate::llm::Respuesta, String> {
    let config = store.current();

    let concedidos = config
        .plugins
        .concedidos
        .get(&plugin_id)
        .ok_or_else(|| format!("el plugin '{plugin_id}' no tiene permisos concedidos"))?;
    if !concedidos.contains(&crate::plugins::Permiso::LlmCompletar) {
        return Err(format!(
            "el plugin '{plugin_id}' no tiene permiso para consultar al modelo"
        ));
    }

    let mut pedido = pedido;
    if pedido.model.is_none() && !config.llm.model.is_empty() {
        pedido.model = Some(config.llm.model.clone());
    }

    crate::llm::completar(
        &presupuesto,
        config.llm.provider,
        config.llm.tokens_por_dia,
        &plugin_id,
        pedido,
    )
    .await
}
