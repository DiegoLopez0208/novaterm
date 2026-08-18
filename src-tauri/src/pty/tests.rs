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
    fn data(&self, bytes: &[u8]) {
        self.bytes.lock().unwrap().extend_from_slice(bytes);
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
    assert!(listo, "el shell nunca mostro un prompt: {:?}", espia.texto());

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
    let arranco = esperar_respondiendo_dsr(&manager, &id, &espia, 45, || {
        espia.texto().contains('>')
    });
    assert!(arranco, "node nunca mostro el prompt: {:?}", espia.texto());

    manager.write(&id, "2+2\r").expect("no se pudo escribir");

    // El REPL hace eco de lo tipeado y despues imprime el resultado, asi que
    // "4" aparece solo en la respuesta. 40 s por lo mismo que el prompt: bajo
    // carga, node tarda.
    let visto = esperar_respondiendo_dsr(&manager, &id, &espia, 40, || {
        espia.texto().contains("\n4") || espia.texto().contains("\r\n4")
    });
    let capturado = espia.texto();
    manager.close(&id).expect("no se pudo cerrar");

    assert!(visto, "el REPL no evaluo la expresion. Capturado:\n{capturado}");
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
    assert!(err.contains("sesion desconocida"), "error inesperado: {err}");
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
        .spawn("", opciones(Some("no_existe_este_shell_12345")), move |_| sink)
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
    fn data(&self, bytes: &[u8]) {
        *self.bytes.lock().unwrap() += bytes.len();
        std::thread::sleep(Duration::from_millis(20));
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

