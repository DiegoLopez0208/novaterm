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
