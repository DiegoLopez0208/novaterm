use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use super::{PtyManager, PtySink, SpawnOptions};

#[derive(Default)]
struct SinkDePrueba {
    bytes: Mutex<Vec<u8>>,
    exit: Mutex<Option<Option<i32>>>,
}

impl SinkDePrueba {
    fn texto(&self) -> String {
        String::from_utf8_lossy(&self.bytes.lock().unwrap()).to_string()
    }

    fn salio(&self) -> bool {
        self.exit.lock().unwrap().is_some()
    }
}

impl PtySink for SinkDePrueba {
    fn data(&self, bytes: &[u8]) -> bool {
        self.bytes.lock().unwrap().extend_from_slice(bytes);
        true
    }

    fn exit(&self, code: Option<i32>) {
        *self.exit.lock().unwrap() = Some(code);
    }
}

fn opciones(shell: Option<&str>) -> SpawnOptions {
    SpawnOptions {
        shell: shell.map(str::to_string),
        args: None,
        cwd: None,
        cols: 80,
        rows: 24,
    }
}

fn shell_de_prueba() -> &'static str {
    if cfg!(windows) {
        "powershell.exe"
    } else {
        "/bin/sh"
    }
}

fn esperar<F: Fn() -> bool>(segundos: u64, condicion: F) -> bool {
    let limite = Instant::now() + Duration::from_secs(segundos);
    while Instant::now() < limite {
        if condicion() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    false
}

/// PowerShell arranca mandando DSR (`ESC[6n`) y se queda esperando que la
/// terminal le conteste donde esta el cursor. Sin respuesta no imprime prompt
/// ni procesa lo que se le escriba. En la app contesta xterm.js; aca hay que
/// hacer de emulador o el shell nunca arranca.
fn esperar_respondiendo_dsr<F: Fn() -> bool>(
    manager: &PtyManager,
    id: &str,
    espia: &SinkDePrueba,
    segundos: u64,
    condicion: F,
) -> bool {
    let limite = Instant::now() + Duration::from_secs(segundos);
    let mut respondidos = 0usize;

    while Instant::now() < limite {
        if condicion() {
            return true;
        }
        let pedidos = espia.texto().matches("\u{1b}[6n").count();
        while respondidos < pedidos {
            let _ = manager.write(id, "\u{1b}[1;1R");
            respondidos += 1;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    false
}

/// Ciclo completo contra el shell de verdad: abre el PTY, escribe un comando y
/// espera a ver la salida del proceso. Si esto pasa, el nucleo anda sin ventana.
#[test]
fn el_shell_real_responde_por_el_pty() {
    let manager = PtyManager::default();
    let sink = Arc::new(SinkDePrueba::default());
    let espia = sink.clone();

    let id = manager
        .spawn("", opciones(Some(shell_de_prueba())), move |_| sink)
        .expect("no se pudo abrir el PTY");

    // Escribir antes de que el shell muestre el prompt pierde el comando.
    let listo = esperar_respondiendo_dsr(&manager, &id, &espia, 25, || {
        espia.texto().contains('>') || espia.texto().contains('$')
    });
    assert!(
        listo,
        "el shell nunca mostro un prompt: {:?}",
        espia.texto()
    );

    manager
        .write(&id, "echo NOVATERM_PTY_OK\r")
        .expect("no se pudo escribir al PTY");

    let visto = esperar_respondiendo_dsr(&manager, &id, &espia, 30, || {
        // Dos apariciones: el eco de lo tipeado y la salida real del comando.
        espia.texto().matches("NOVATERM_PTY_OK").count() >= 2
    });
    let capturado = espia.texto();
    manager.close(&id).expect("no se pudo cerrar el PTY");

    assert!(
        visto,
        "el shell nunca devolvio la salida del comando. Capturado:\n{capturado}"
    );
}

/// Los escapes ANSI tienen que llegar crudos: si algo del camino los filtrara,
/// los colores y el posicionamiento del cursor no funcionarian.
#[test]
fn los_escapes_ansi_llegan_sin_tocar() {
    let manager = PtyManager::default();
    let sink = Arc::new(SinkDePrueba::default());
    let espia = sink.clone();

    let id = manager
        .spawn("", opciones(Some(shell_de_prueba())), move |_| sink)
        .expect("no se pudo abrir el PTY");

    assert!(esperar_respondiendo_dsr(&manager, &id, &espia, 25, || {
        espia.texto().contains('>') || espia.texto().contains('$')
    }));

    let comando = if cfg!(windows) {
        "Write-Host ([char]27 + '[31mROJO' + [char]27 + '[0m')\r"
    } else {
        "printf '\\033[31mROJO\\033[0m\\n'\r"
    };
    manager.write(&id, comando).expect("no se pudo escribir");

    let visto = esperar_respondiendo_dsr(&manager, &id, &espia, 30, || {
        espia.texto().contains("\u{1b}[31mROJO")
    });
    let capturado = espia.texto();
    manager.close(&id).expect("no se pudo cerrar");

    assert!(
        visto,
        "no se vio la secuencia ANSI cruda. Capturado:\n{capturado:?}"
    );
}

/// Un REPL es la prueba de fuego del PTY: solo entra en modo interactivo si el
/// proceso ve una terminal de verdad del otro lado. Con un pipe comun, node
/// leeria el script y saldria sin abrir el prompt.
#[test]
fn un_programa_interactivo_entra_en_modo_repl() {
    let manager = PtyManager::default();
    let sink = Arc::new(SinkDePrueba::default());
    let espia = sink.clone();

    let id = manager
        .spawn(
            "",
            SpawnOptions {
                shell: Some("node".to_string()),
                args: Some(vec!["-i".to_string()]),
                cwd: None,
                cols: 80,
                rows: 24,
            },
            move |_| sink,
        )
        .expect("no se pudo abrir node");

    // 45 s y no 25: los tests corren en paralelo y cada uno levanta un shell de
    // verdad, asi que bajo carga el REPL tarda mas en dar el prompt. El limite
    // esta para que el test falle si algo se cuelga, no para medir velocidad.
    let arranco =
        esperar_respondiendo_dsr(&manager, &id, &espia, 45, || espia.texto().contains('>'));
    assert!(arranco, "node nunca mostro el prompt: {:?}", espia.texto());

    manager
        .write(&id, "'NOVATERM_REPL_' + (2 + 2)\r")
        .expect("no se pudo escribir");

    // The complete marker appears only in the evaluated result, never in the
    // echoed expression. ConPTY may insert cursor/color escapes between a
    // newline and the result, so asserting a literal "\n4" is not portable.
    let visto = esperar_respondiendo_dsr(&manager, &id, &espia, 40, || {
        espia.texto().contains("NOVATERM_REPL_4")
    });
    let capturado = espia.texto();
    manager.close(&id).expect("no se pudo cerrar");

    assert!(
        visto,
        "el REPL no evaluo la expresion. Capturado:\n{capturado}"
    );
}

#[test]
fn cerrar_la_sesion_termina_el_proceso() {
    let manager = PtyManager::default();
    let sink = Arc::new(SinkDePrueba::default());
    let espia = sink.clone();

    let id = manager
        .spawn("", opciones(None), move |_| sink)
        .expect("no se pudo abrir el PTY");

    assert!(esperar(20, || !espia.texto().is_empty()));
    manager.close(&id).expect("el close fallo");

    assert!(
        esperar(15, || espia.salio()),
        "el proceso quedo vivo despues de cerrar la sesion"
    );
}

#[test]
fn el_resize_llega_al_pty() {
    let manager = PtyManager::default();
    let sink = Arc::new(SinkDePrueba::default());

    let id = manager
        .spawn("", opciones(None), move |_| sink)
        .expect("no se pudo abrir el PTY");

    manager.resize(&id, 120, 40).expect("el resize fallo");
    manager.close(&id).expect("no se pudo cerrar el PTY");
}

#[test]
fn escribir_a_una_sesion_inexistente_da_error() {
    let manager = PtyManager::default();
    let err = manager.write("no-existe", "hola").unwrap_err();
    assert!(
        err.contains("sesion desconocida"),
        "error inesperado: {err}"
    );
}

#[test]
fn cerrar_dos_veces_no_es_error() {
    let manager = PtyManager::default();
    let sink = Arc::new(SinkDePrueba::default());

    let id = manager
        .spawn("", opciones(None), move |_| sink)
        .expect("no se pudo abrir el PTY");

    manager.close(&id).expect("el primer close fallo");
    manager
        .close(&id)
        .expect("el segundo close deberia ser inocuo");
}

#[test]
fn un_shell_inexistente_da_error_en_vez_de_panic() {
    let manager = PtyManager::default();
    let sink = Arc::new(SinkDePrueba::default());

    let err = manager
        .spawn(
            "",
            opciones(Some("no_existe_este_shell_12345")),
            move |_| sink,
        )
        .unwrap_err();

    assert!(!err.is_empty(), "el error deberia explicar que fallo");
}

/// Sink que tarda a proposito, para llenar la cola entre el hilo lector y el
/// agrupador.
#[derive(Default)]
struct SinkLento {
    bytes: Mutex<usize>,
}

impl SinkLento {
    fn recibidos(&self) -> usize {
        *self.bytes.lock().unwrap()
    }
}

impl PtySink for SinkLento {
    fn data(&self, bytes: &[u8]) -> bool {
        *self.bytes.lock().unwrap() += bytes.len();
        std::thread::sleep(Duration::from_millis(20));
        true
    }

    fn exit(&self, _code: Option<i32>) {}
}

/// La cola del PTY es un `sync_channel` acotado: cuando se llena, el hilo lector
/// se bloquea en `send` y ConPTY frena al proceso hijo. Eso es lo que evita que
/// un `cat` de un archivo grande apile chunks en RAM sin techo, pero abre un
/// riesgo: si cerrar la sesion esperara a ese hilo bloqueado, cerrar una pestana
/// con salida pesada colgaria la app entera.
///
/// El close corre en otro hilo y se le da un limite, asi que un bloqueo falla el
/// test en vez de dejar la suite colgada para siempre.
#[test]
fn cerrar_no_se_traba_con_la_cola_llena() {
    let manager = Arc::new(PtyManager::default());
    let sink = Arc::new(SinkLento::default());
    let espia = sink.clone();

    // node y no un shell: powershell arranca mandando DSR y se cuelga esperando
    // que la terminal le conteste, y cmd.exe no recibe bien la linea entre
    // comillas. node escupe salida de entrada y se comporta igual en los dos
    // sistemas.
    let volcado = "for (let i = 0; i < 500000; i++) console.log(\"linea \" + i)";

    let id = manager
        .spawn(
            "",
            SpawnOptions {
                shell: Some("node".to_string()),
                args: Some(vec!["-e".to_string(), volcado.to_string()]),
                cwd: None,
                cols: 80,
                rows: 24,
            },
            move |_| sink,
        )
        .expect("no se pudo abrir el PTY");

    // ConPTY arranca mandando DSR y no suelta una sola linea del proceso hasta
    // que la terminal le conteste donde esta el cursor. En la app contesta
    // xterm.js; aca hay que hacerle de emulador, igual que en los otros tests.
    //
    // Y no alcanza con esperar el primer byte: ese primer byte es el DSR y para
    // entonces no hay nada encolado. Con el sink durmiendo 20 ms por chunk,
    // haber entregado 200 KB significa varios segundos de consumo, y para
    // entonces el productor ya dejo la cola llena y el lector bloqueado.
    let limite = Instant::now() + Duration::from_secs(60);
    let mut fluyendo = false;
    while Instant::now() < limite {
        if espia.recibidos() > 200_000 {
            fluyendo = true;
            break;
        }
        let _ = manager.write(&id, "[1;1R");
        std::thread::sleep(Duration::from_millis(50));
    }
    assert!(
        fluyendo,
        "el proceso no produjo salida suficiente: {} bytes",
        espia.recibidos()
    );

    let (aviso, espera) = std::sync::mpsc::channel();
    let cerrador = manager.clone();
    let id_cerrar = id.clone();
    std::thread::spawn(move || {
        let _ = aviso.send(cerrador.close(&id_cerrar));
    });

    let resultado = espera.recv_timeout(Duration::from_secs(20));
    assert!(
        resultado.is_ok(),
        "cerrar la sesion se trabo con la cola llena"
    );
    resultado.unwrap().expect("el close devolvio error");
}

#[derive(Default)]
struct AcknowledgedSink {
    bytes: Mutex<Vec<u8>>,
    exit_at: Mutex<Option<usize>>,
}

impl PtySink for AcknowledgedSink {
    fn data(&self, bytes: &[u8]) -> bool {
        self.bytes.lock().unwrap().extend_from_slice(bytes);
        true
    }
    fn exit(&self, _code: Option<i32>) {
        *self.exit_at.lock().unwrap() = Some(self.bytes.lock().unwrap().len());
    }
    fn requires_ack(&self) -> bool {
        true
    }
}

fn node_options(script: &str) -> SpawnOptions {
    SpawnOptions {
        shell: Some("node".into()),
        args: Some(vec!["-e".into(), script.into()]),
        cwd: None,
        cols: 80,
        rows: 24,
    }
}

#[test]
fn ipc_delivery_stays_bounded_and_exit_waits_for_parsed_output() {
    use super::flow::HIGH_WATERMARK;
    let manager = PtyManager::default();
    let sink = Arc::new(AcknowledgedSink::default());
    let output = sink.clone();
    let id = manager
        .spawn_with_token(
            "bounded-output",
            "current-token".into(),
            node_options("process.stdout.write('UNICODE é漢🙂\\n'.repeat(25000))"),
            move |_| sink,
        )
        .unwrap();

    let deadline = Instant::now() + Duration::from_secs(15);
    while output.bytes.lock().unwrap().len() < HIGH_WATERMARK - 80 * 1024
        && Instant::now() < deadline
    {
        manager.write(&id, "\u{1b}[1;1R").unwrap();
        std::thread::sleep(Duration::from_millis(25));
    }
    let buffered = output.bytes.lock().unwrap().len();
    assert!(
        buffered >= HIGH_WATERMARK - 80 * 1024,
        "producer did not fill the credit window: {buffered}"
    );
    std::thread::sleep(Duration::from_millis(150));
    assert!(output.bytes.lock().unwrap().len() <= HIGH_WATERMARK);
    assert!(output.exit_at.lock().unwrap().is_none());
    // A stale parser callback cannot unlock this session's transport.
    manager.acknowledge(&id, "old-token", buffered).unwrap();
    std::thread::sleep(Duration::from_millis(50));
    assert!(output.bytes.lock().unwrap().len() <= HIGH_WATERMARK);

    let mut acknowledged = 0;
    let deadline = Instant::now() + Duration::from_secs(20);
    while output.exit_at.lock().unwrap().is_none() && Instant::now() < deadline {
        let total = output.bytes.lock().unwrap().len();
        manager
            .acknowledge(&id, "current-token", total - acknowledged)
            .unwrap();
        acknowledged = total;
        std::thread::sleep(Duration::from_millis(5));
    }
    let at_exit = *output.exit_at.lock().unwrap();
    let bytes = output.bytes.lock().unwrap().clone();
    manager.close(&id).unwrap();
    assert_eq!(at_exit, Some(bytes.len()));
    assert_eq!(acknowledged, bytes.len());
    let text = String::from_utf8_lossy(&bytes);
    // ConPTY may encode spaces as cursor movement, so count the actual glyphs.
    assert_eq!(text.matches("UNICODE").count(), 25000);
    for glyph in ['é', '漢', '🙂'] {
        assert_eq!(text.matches(glyph).count(), 25000);
    }
    assert!(!text.contains('\u{fffd}'));
}

#[test]
fn closing_a_session_blocked_on_parser_credit_does_not_wait_for_ack() {
    let manager = Arc::new(PtyManager::default());
    let sink = Arc::new(AcknowledgedSink::default());
    let output = sink.clone();
    let id = manager
        .spawn_with_token(
            "close-pressure",
            "token".into(),
            node_options("while (true) process.stdout.write('noisy output\\n'.repeat(1000))"),
            move |_| sink,
        )
        .unwrap();
    let deadline = Instant::now() + Duration::from_secs(15);
    while output.bytes.lock().unwrap().len() < 180000 && Instant::now() < deadline {
        manager.write(&id, "\u{1b}[1;1R").unwrap();
        std::thread::sleep(Duration::from_millis(25));
    }
    assert!(output.bytes.lock().unwrap().len() >= 180000);
    let (sent, received) = std::sync::mpsc::channel();
    let closing = manager.clone();
    std::thread::spawn(move || {
        let _ = sent.send(closing.close(&id));
    });
    received
        .recv_timeout(Duration::from_secs(3))
        .expect("close waited for parser credit")
        .unwrap();
    assert!(esperar(5, || output.exit_at.lock().unwrap().is_some()));
}

#[test]
fn cancelled_spawn_cannot_overwrite_a_new_session_with_the_same_id() {
    let manager = Arc::new(PtyManager::default());
    let (reserved_tx, reserved_rx) = std::sync::mpsc::channel();
    let (release_tx, release_rx) = std::sync::mpsc::channel();
    let spawning = manager.clone();
    let old = std::thread::spawn(move || {
        spawning.spawn_with_token(
            "reused",
            "old".into(),
            node_options("setTimeout(() => {}, 30000)"),
            move |_| {
                reserved_tx.send(()).unwrap();
                release_rx.recv_timeout(Duration::from_secs(5)).unwrap();
                Arc::new(SinkDePrueba::default())
            },
        )
    });
    reserved_rx.recv_timeout(Duration::from_secs(2)).unwrap();
    assert!(manager
        .spawn("reused", opciones(None), |_| Arc::new(
            SinkDePrueba::default()
        ))
        .is_err());
    manager.close("reused").unwrap();
    manager
        .spawn_with_token(
            "reused",
            "new".into(),
            node_options("setTimeout(() => {}, 30000)"),
            |_| Arc::new(SinkDePrueba::default()),
        )
        .unwrap();
    release_tx.send(()).unwrap();
    assert!(old.join().unwrap().unwrap_err().contains("cancelled"));
    manager.resize("reused", 100, 30).unwrap();
    manager.acknowledge("reused", "old", usize::MAX).unwrap();
    assert!(manager.acknowledge("reused", "new", usize::MAX).is_err());
    manager.close_all();
}

#[test]
fn a_blocked_writer_does_not_hold_the_registry_or_prevent_close() {
    let manager = Arc::new(PtyManager::default());
    let first = manager
        .spawn(
            "blocked-writer",
            node_options("setTimeout(() => {}, 30000)"),
            |_| Arc::new(SinkDePrueba::default()),
        )
        .unwrap();
    let second = manager
        .spawn(
            "independent",
            node_options("setTimeout(() => {}, 30000)"),
            |_| Arc::new(SinkDePrueba::default()),
        )
        .unwrap();
    let session = manager.session(&first).unwrap();
    let held_writer = session.writer.lock().unwrap();
    let writing = manager.clone();
    let id = first.clone();
    let writer = std::thread::spawn(move || writing.write(&id, "waiting"));
    std::thread::sleep(Duration::from_millis(50));
    let (sent, received) = std::sync::mpsc::channel();
    let independent = manager.clone();
    std::thread::spawn(move || {
        let result = independent
            .resize(&second, 100, 30)
            .and_then(|_| independent.close(&first));
        let _ = sent.send(result);
    });
    let responsive = received.recv_timeout(Duration::from_secs(3));
    drop(held_writer);
    let _ = writer.join().unwrap();
    manager.close_all();
    responsive
        .expect("one writer blocked all sessions/close")
        .unwrap();
}

#[test]
fn a_disconnected_output_sink_stops_the_child_without_parser_acknowledgements() {
    #[derive(Default)]
    struct DisconnectedSink {
        exited: std::sync::atomic::AtomicBool,
    }
    impl PtySink for DisconnectedSink {
        fn data(&self, _: &[u8]) -> bool {
            false
        }
        fn exit(&self, _: Option<i32>) {
            self.exited.store(true, std::sync::atomic::Ordering::SeqCst);
        }
        fn requires_ack(&self) -> bool {
            true
        }
    }
    let manager = PtyManager::default();
    let sink = Arc::new(DisconnectedSink::default());
    let observed = sink.clone();
    let id = manager
        .spawn(
            "disconnected",
            node_options("setInterval(() => console.log('alive'), 10)"),
            move |_| sink,
        )
        .unwrap();
    assert!(esperar(5, || observed
        .exited
        .load(std::sync::atomic::Ordering::SeqCst)));
    assert!(manager.write(&id, "late input").is_err());
    manager.close(&id).unwrap();
}
