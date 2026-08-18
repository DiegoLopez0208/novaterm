use std::sync::mpsc;
use std::time::{Duration, Instant};

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime};

use super::ConfigStore;

#[derive(Clone, Serialize)]
struct ErrorPayload {
    message: String,
}

/// Vigila el config.toml y avisa al frontend cuando cambia, para que los temas
/// se recarguen sin reiniciar.
pub fn watch_config<R: Runtime>(app: AppHandle<R>) {
    let ruta = app.state::<ConfigStore>().path().to_path_buf();
    // Se vigila el directorio y no el archivo: los editores guardan escribiendo
    // un temporal y renombrando, con lo cual el archivo que se estaba mirando
    // desaparece y no llega ningun evento mas.
    let Some(dir) = ruta.parent().map(|p| p.to_path_buf()) else {
        return;
    };

    std::thread::spawn(move || {
        let (tx, rx) = mpsc::channel();
        let mut watcher: RecommendedWatcher = match notify::recommended_watcher(tx) {
            Ok(w) => w,
            Err(err) => {
                log::warn!("no se pudo vigilar la config: {err}");
                return;
            }
        };
        if let Err(err) = watcher.watch(&dir, RecursiveMode::NonRecursive) {
            log::warn!("no se pudo vigilar {}: {err}", dir.display());
            return;
        }

        // Un solo guardado dispara varios eventos (escritura, rename, atributos);
        // sin esta ventana la config se releeria tres veces por cada Ctrl+S.
        let mut ultimo = Instant::now() - Duration::from_secs(1);
        for evento in rx {
            let Ok(evento) = evento else { continue };
            if !evento.paths.iter().any(|p| p == &ruta) {
                continue;
            }
            if ultimo.elapsed() < Duration::from_millis(150) {
                continue;
            }
            ultimo = Instant::now();

            match app.state::<ConfigStore>().reload() {
                Ok(config) => {
                    let _ = app.emit("config://changed", config);
                }
                Err(message) => {
                    let _ = app.emit("config://error", ErrorPayload { message });
                }
            }
        }
    });
}
