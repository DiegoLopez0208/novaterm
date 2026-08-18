mod session;
mod sink;

#[cfg(test)]
mod tests;

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use uuid::Uuid;

pub use session::{PtySession, SpawnOptions};
pub use sink::{PtySink, TauriSink};

/// Duenio de todas las sesiones vivas. Las sesiones no se conocen entre si:
/// el manager solo las indexa y las cierra; cada una maneja su propio proceso.
#[derive(Default)]
pub struct PtyManager {
    sessions: Mutex<HashMap<String, PtySession>>,
}

impl PtyManager {
    /// El id lo trae el llamador, no se genera aca.
    ///
    /// Es lo que evita una carrera: el shell empieza a escribir apenas se abre
    /// el PTY, asi que el frontend necesita estar escuchando `pty://{id}/data`
    /// **antes** de pedir el spawn. Si el id se generara aca, el prompt podria
    /// emitirse entre la respuesta y la suscripcion y la terminal quedaria en
    /// blanco. En el build de release, que arranca sin esperar a Vite, pasaba
    /// siempre.
    pub fn spawn<F>(&self, id: &str, options: SpawnOptions, make_sink: F) -> Result<String, String>
    where
        F: FnOnce(&str) -> Arc<dyn PtySink>,
    {
        let id = if id.trim().is_empty() {
            Uuid::new_v4().to_string()
        } else {
            id.to_string()
        };

        {
            let sessions = self.sessions.lock().map_err(|e| e.to_string())?;
            if sessions.contains_key(&id) {
                return Err(format!("ya hay una sesion con el id {id}"));
            }
        }

        let session = PtySession::spawn(make_sink(&id), options)?;
        self.sessions
            .lock()
            .map_err(|e| e.to_string())?
            .insert(id.clone(), session);
        Ok(id)
    }

    pub fn write(&self, id: &str, data: &str) -> Result<(), String> {
        let sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        sessions
            .get(id)
            .ok_or_else(|| format!("sesion desconocida: {id}"))?
            .write(data)
    }

    pub fn resize(&self, id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        sessions
            .get(id)
            .ok_or_else(|| format!("sesion desconocida: {id}"))?
            .resize(cols, rows)
    }

    /// Cerrar una sesion que ya no existe no es un error: el frontend puede
    /// desmontar el componente despues de que el shell murio solo.
    pub fn close(&self, id: &str) -> Result<(), String> {
        let mut sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        if let Some(mut session) = sessions.remove(id) {
            session.kill();
        }
        Ok(())
    }

    pub fn close_all(&self) {
        if let Ok(mut sessions) = self.sessions.lock() {
            for (_, mut session) in sessions.drain() {
                session.kill();
            }
        }
    }
}
