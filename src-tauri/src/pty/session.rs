use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::Deserialize;

use super::flow::FlowControl;
use super::sink::PtySink;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpawnOptions {
    pub shell: Option<String>,
    pub args: Option<Vec<String>>,
    pub cwd: Option<String>,
    pub cols: u16,
    pub rows: u16,
}

pub struct PtySession {
    master: Arc<Mutex<Option<Box<dyn MasterPty + Send>>>>,
    pub(super) writer: Mutex<Box<dyn Write + Send>>,
    killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
    flow: Arc<FlowControl>,
    exited: Arc<AtomicBool>,
    kill_called: AtomicBool,
}

impl PtySession {
    pub(super) fn spawn_with_flow(
        sink: Arc<dyn PtySink>,
        options: SpawnOptions,
        flow: Arc<FlowControl>,
    ) -> Result<Self, String> {
        let pty_system = native_pty_system();
        let size = PtySize {
            rows: options.rows.max(1),
            cols: options.cols.max(1),
            pixel_width: 0,
            pixel_height: 0,
        };

        let pair = pty_system.openpty(size).map_err(|e| e.to_string())?;
        // Acquire fallible handles before starting a child that would need cleanup.
        let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
        let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;

        // El programa y cada argumento viajan separados hasta CreateProcess:
        // nunca se arma una linea de comando concatenando strings, asi que no
        // hay superficie de inyeccion aunque el perfil venga de config.
        let program = options.shell.unwrap_or_else(default_shell);
        let programa_log = program.clone();
        let mut cmd = CommandBuilder::new(program);
        for arg in options.args.unwrap_or_default() {
            cmd.arg(arg);
        }
        if let Some(cwd) = options.cwd {
            cmd.cwd(cwd);
        }
        // Sin esto los programas que consultan TERM (vim, less, htop) creen que
        // estan en una terminal tonta y desactivan color y posicionamiento.
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");

        log::info!("abriendo shell: {programa_log}");
        let mut child = pair.slave.spawn_command(cmd).map_err(|e| {
            log::error!("no se pudo abrir {programa_log}: {e}");
            e.to_string()
        })?;
        // El slave tiene que morir aca: mientras siga abierto de este lado, el
        // reader nunca ve EOF y la sesion parece viva despues de salir el shell.
        drop(pair.slave);

        let killer = child.clone_killer();
        let master = Arc::new(Mutex::new(Some(pair.master)));
        let mut delivery_killer = child.clone_killer();
        let exited = Arc::new(AtomicBool::new(false));
        let (exit_tx, exit_rx) = std::sync::mpsc::sync_channel(1);

        // Leer y emitir van en hilos distintos, con la salida agrupada en el
        // medio. ConPTY devuelve pedazos chicos —a veces una linea— y cada uno
        // cruzaba el puente como un mensaje propio, con su vuelta por el bucle
        // de eventos del webview. Con salida pesada eso era casi todo el costo.
        //
        // El agrupador junta lo que llegue mientras siga llegando y corta al
        // primer respiro o al llenarse. La demora que agrega es menos de un
        // cuadro, asi que no se nota al escribir.
        //
        // La cola entre los dos hilos va acotada a proposito. Sin limite, un
        // `cat` de un archivo grande o un build ruidoso hacen que el lector
        // empuje mas rapido de lo que el puente puede emitir y los chunks se
        // apilan sin techo: la RAM sube y no vuelve. Llena, `send` bloquea al
        // lector, el pipe se llena y ConPTY frena al proceso hijo, que es como
        // debe comportarse una terminal. 256 chunks de 8 KB = 2 MB de cola.
        const COLA: usize = 256;
        let (tx, rx) = std::sync::mpsc::sync_channel::<Vec<u8>>(COLA);
        let wake = tx.clone();
        flow.set_waker(move || {
            let _ = wake.try_send(Vec::new());
        });

        let reader_flow = flow.clone();
        std::thread::spawn(move || {
            let mut buf = [0u8; 8192];
            loop {
                if reader_flow.is_closed() {
                    break;
                }
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        if tx.send(buf[..n].to_vec()).is_err() {
                            break;
                        }
                    }
                    Err(_) => break,
                }
            }
            reader_flow.clear_waker();
        });

        let data_sink = sink.clone();
        let delivery_flow = flow.clone();
        let delivery_exited = exited.clone();
        std::thread::spawn(move || {
            use std::sync::mpsc::RecvTimeoutError;

            /// Un respiro mas corto que un cuadro a 60 Hz.
            const RESPIRO: std::time::Duration = std::time::Duration::from_millis(3);
            /// Tope duro: con `cat` de un archivo grande no hay respiro nunca, y
            /// sin este corte el buffer creceria sin fin.
            const TOPE: usize = 64 * 1024;

            let mut juntado: Vec<u8> = Vec::new();

            'delivery: loop {
                if delivery_flow.is_closed() {
                    break;
                }
                match rx.recv() {
                    Ok(primero) => juntado.extend_from_slice(&primero),
                    Err(_) => break,
                }

                let mut cerrado = false;
                while juntado.len() < TOPE {
                    match rx.recv_timeout(RESPIRO) {
                        Ok(mas) => juntado.extend_from_slice(&mas),
                        Err(RecvTimeoutError::Timeout) => break,
                        Err(RecvTimeoutError::Disconnected) => {
                            cerrado = true;
                            break;
                        }
                    }
                }

                for bytes in juntado.chunks(TOPE) {
                    if !delivery_flow.reserve(bytes.len()) {
                        break 'delivery;
                    }
                    if !data_sink.data(bytes) {
                        delivery_flow.close();
                        break 'delivery;
                    }
                    if !data_sink.requires_ack() {
                        let _ = delivery_flow.acknowledge(bytes.len());
                    }
                }
                juntado.clear();

                if cerrado {
                    break;
                }
            }
            // Release the reader's bounded queue before waiting for child exit.
            drop(rx);
            if !delivery_flow.wait_until_drained() && !delivery_exited.load(Ordering::SeqCst) {
                let _ = delivery_killer.kill();
            }
            let code = exit_rx.recv().unwrap_or(None);
            // On natural exit, every byte has been parsed before this notification.
            data_sink.exit(code);
        });

        let waiting_exited = exited.clone();
        let waiting_master = master.clone();
        std::thread::spawn(move || {
            let code = child.wait().ok().map(|status| status.exit_code() as i32);
            waiting_exited.store(true, Ordering::SeqCst);
            // ConPTY does not close its output pipe just because the child exits.
            // Close the pseudoconsole on this separate thread while the reader
            // drains its final output, allowing delivery to observe EOF.
            let master = waiting_master
                .lock()
                .unwrap_or_else(|err| err.into_inner())
                .take();
            drop(master);
            let _ = exit_tx.send(code);
        });

        Ok(Self {
            master,
            writer: Mutex::new(writer),
            killer: Mutex::new(killer),
            flow,
            exited,
            kill_called: AtomicBool::new(false),
        })
    }

    pub fn write(&self, data: &str) -> Result<(), String> {
        if self.flow.is_closed() || self.exited.load(Ordering::SeqCst) {
            return Err("PTY session is closed".into());
        }
        let mut writer = self.writer.lock().map_err(|e| e.to_string())?;
        if self.flow.is_closed() || self.exited.load(Ordering::SeqCst) {
            return Err("PTY session is closed".into());
        }
        writer
            .write_all(data.as_bytes())
            .map_err(|e| e.to_string())?;
        writer.flush().map_err(|e| e.to_string())
    }

    pub fn resize(&self, cols: u16, rows: u16) -> Result<(), String> {
        self.master
            .lock()
            .map_err(|err| err.to_string())?
            .as_ref()
            .ok_or("PTY process has exited")?
            .resize(PtySize {
                rows: rows.max(1),
                cols: cols.max(1),
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())
    }

    pub fn kill(&self) {
        self.flow.close();
        if !self.kill_called.swap(true, Ordering::SeqCst) && !self.exited.load(Ordering::SeqCst) {
            let _ = self
                .killer
                .lock()
                .unwrap_or_else(|err| err.into_inner())
                .kill();
        }
    }
}

impl Drop for PtySession {
    fn drop(&mut self) {
        self.kill();
    }
}

fn default_shell() -> String {
    #[cfg(windows)]
    {
        "powershell.exe".to_string()
    }
    #[cfg(not(windows))]
    {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
    }
}
