use serde::Serialize;
use tauri::ipc::{Channel, InvokeResponseBody};

/// Salida de una sesion. La sesion no sabe si del otro lado hay una ventana,
/// un test o nada: solo empuja bytes. Sin esto el PTY solo se puede probar
/// levantando Tauri entero.
pub trait PtySink: Send + Sync + 'static {
    fn data(&self, bytes: &[u8]);
    fn exit(&self, code: Option<i32>);
}

#[derive(Clone, Serialize)]
pub struct ExitPayload {
    code: Option<i32>,
}

/// Manda cada chunk al frontend por un canal de IPC.
///
/// Antes esto emitia un evento Tauri con los bytes en base64 dentro de un JSON.
/// Eran tres copias y un +33% de tamano por chunk, y del otro lado un `atob`
/// byte a byte que alocaba un Uint8Array nuevo por evento; con salida sostenida
/// era casi todo el costo del puente. Un `Channel` con cuerpo `Raw` viaja como
/// ArrayBuffer sin pasar por JSON.
///
/// El canal ademas resuelve por construccion la carrera del prompt: existe
/// desde antes de que el comando `pty_spawn` llegue al backend, asi que no hay
/// ventana entre abrir el PTY y tener a alguien escuchando.
pub struct CanalSink {
    datos: Channel<InvokeResponseBody>,
    salida: Channel<ExitPayload>,
}

impl CanalSink {
    pub fn new(datos: Channel<InvokeResponseBody>, salida: Channel<ExitPayload>) -> Self {
        Self { datos, salida }
    }
}

impl PtySink for CanalSink {
    fn data(&self, bytes: &[u8]) {
        // Bytes crudos y no String: un caracter multibyte puede quedar partido
        // entre dos lecturas del PTY, y convertirlo aca lo reemplazaria por
        // U+FFFD. El decode incremental lo hace xterm del otro lado.
        let _ = self.datos.send(InvokeResponseBody::Raw(bytes.to_vec()));
    }

    fn exit(&self, code: Option<i32>) {
        let _ = self.salida.send(ExitPayload { code });
    }
}
