use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Runtime};

/// Salida de una sesion. La sesion no sabe si del otro lado hay una ventana,
/// un test o nada: solo empuja bytes. Sin esto el PTY solo se puede probar
/// levantando Tauri entero.
pub trait PtySink: Send + Sync + 'static {
    fn data(&self, bytes: &[u8]);
    fn exit(&self, code: Option<i32>);
}

#[derive(Clone, Serialize)]
struct DataPayload {
    data: String,
}

#[derive(Clone, Serialize)]
struct ExitPayload {
    code: Option<i32>,
}

/// Manda cada chunk al frontend como evento Tauri.
pub struct TauriSink<R: Runtime> {
    app: AppHandle<R>,
    data_event: String,
    exit_event: String,
}

impl<R: Runtime> TauriSink<R> {
    pub fn new(app: AppHandle<R>, id: &str) -> Self {
        Self {
            app,
            data_event: format!("pty://{id}/data"),
            exit_event: format!("pty://{id}/exit"),
        }
    }
}

impl<R: Runtime> PtySink for TauriSink<R> {
    fn data(&self, bytes: &[u8]) {
        // Base64 y no String::from_utf8: un caracter multibyte puede quedar
        // partido entre dos lecturas del PTY, y convertirlo aca lo reemplazaria
        // por U+FFFD. El decode incremental lo hace xterm del otro lado.
        let payload = DataPayload {
            data: BASE64.encode(bytes),
        };
        let _ = self.app.emit(&self.data_event, payload);
    }

    fn exit(&self, code: Option<i32>) {
        let _ = self.app.emit(&self.exit_event, ExitPayload { code });
    }
}
