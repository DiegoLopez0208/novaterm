mod flow;
mod session;
mod sink;

#[cfg(test)]
mod tests;

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use uuid::Uuid;

use flow::FlowControl;
pub use session::{PtySession, SpawnOptions};
pub use sink::{CanalSink, ExitPayload, PtySink};

#[derive(Default)]
struct SlotState {
    closed: bool,
    session: Option<Arc<PtySession>>,
}

struct Slot {
    token: String,
    flow: Arc<FlowControl>,
    state: Mutex<SlotState>,
}

impl Slot {
    fn close(&self) {
        let session = {
            let mut state = self.state.lock().unwrap_or_else(|err| err.into_inner());
            state.closed = true;
            state.session.take()
        };
        self.flow.close();
        if let Some(session) = session {
            session.kill();
        }
    }
}

#[derive(Default)]
struct Registry {
    sessions: Mutex<HashMap<String, Arc<Slot>>>,
}

impl Drop for Registry {
    fn drop(&mut self) {
        let slots = self
            .sessions
            .get_mut()
            .unwrap_or_else(|err| err.into_inner());
        for (_, slot) in slots.drain() {
            slot.close();
        }
    }
}

/** The registry lock only protects lookup/reservation, never PTY operations. */
#[derive(Clone, Default)]
pub struct PtyManager {
    registry: Arc<Registry>,
}

impl PtyManager {
    pub fn spawn<F>(&self, id: &str, options: SpawnOptions, make_sink: F) -> Result<String, String>
    where
        F: FnOnce(&str) -> Arc<dyn PtySink>,
    {
        self.spawn_with_token(id, Uuid::new_v4().to_string(), options, make_sink)
    }

    pub fn spawn_with_token<F>(
        &self,
        id: &str,
        token: String,
        options: SpawnOptions,
        make_sink: F,
    ) -> Result<String, String>
    where
        F: FnOnce(&str) -> Arc<dyn PtySink>,
    {
        if token.is_empty() {
            return Err("PTY flow token must not be empty".into());
        }
        let id = if id.trim().is_empty() {
            Uuid::new_v4().to_string()
        } else {
            id.to_string()
        };
        let slot = Arc::new(Slot {
            token,
            flow: Arc::new(FlowControl::default()),
            state: Mutex::new(SlotState::default()),
        });
        {
            let mut sessions = self
                .registry
                .sessions
                .lock()
                .map_err(|err| err.to_string())?;
            if sessions.contains_key(&id) {
                return Err(format!("Session ID is already reserved: {id}"));
            }
            sessions.insert(id.clone(), slot.clone());
        }
        let result = (|| {
            let sink = make_sink(&id);
            if slot.flow.is_closed() {
                return Err("PTY spawn was cancelled".into());
            }
            let session = Arc::new(PtySession::spawn_with_flow(
                sink,
                options,
                slot.flow.clone(),
            )?);
            let mut state = slot.state.lock().map_err(|err| err.to_string())?;
            if state.closed {
                drop(state);
                session.kill();
                return Err("PTY spawn was cancelled".into());
            }
            state.session = Some(session);
            Ok(id.clone())
        })();
        if result.is_err() {
            // A cancelled spawn must not remove a newer slot reusing this ID.
            let mut sessions = self
                .registry
                .sessions
                .lock()
                .map_err(|err| err.to_string())?;
            if sessions
                .get(&id)
                .is_some_and(|current| Arc::ptr_eq(current, &slot))
            {
                sessions.remove(&id);
            }
            drop(sessions);
            slot.close();
        }
        result
    }

    fn slot(&self, id: &str) -> Result<Option<Arc<Slot>>, String> {
        Ok(self
            .registry
            .sessions
            .lock()
            .map_err(|err| err.to_string())?
            .get(id)
            .cloned())
    }

    fn session(&self, id: &str) -> Result<Arc<PtySession>, String> {
        let slot = self
            .slot(id)?
            .ok_or_else(|| format!("sesion desconocida: {id}"))?;
        let state = slot.state.lock().map_err(|err| err.to_string())?;
        state
            .session
            .clone()
            .ok_or_else(|| format!("PTY session is not ready: {id}"))
    }

    pub fn write(&self, id: &str, data: &str) -> Result<(), String> {
        self.session(id)?.write(data)
    }
    pub fn resize(&self, id: &str, cols: u16, rows: u16) -> Result<(), String> {
        self.session(id)?.resize(cols, rows)
    }

    pub fn acknowledge(&self, id: &str, token: &str, bytes: usize) -> Result<(), String> {
        if let Some(slot) = self.slot(id)? {
            if slot.token == token {
                return slot.flow.acknowledge(bytes);
            }
        }
        Ok(()) // Parsed callbacks from closed/replaced sessions are harmless.
    }

    pub fn close(&self, id: &str) -> Result<(), String> {
        let slot = self
            .registry
            .sessions
            .lock()
            .map_err(|err| err.to_string())?
            .remove(id);
        if let Some(slot) = slot {
            slot.close();
        }
        Ok(())
    }

    pub fn close_all(&self) {
        let slots: Vec<_> = self
            .registry
            .sessions
            .lock()
            .unwrap_or_else(|err| err.into_inner())
            .drain()
            .map(|(_, slot)| slot)
            .collect();
        for slot in slots {
            slot.close();
        }
    }
}
