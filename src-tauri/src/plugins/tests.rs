use std::path::PathBuf;

use super::{descubrir, ejecutar_widget, leer_manifiesto, WidgetPlugin};

fn carpeta(nombre: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "novaterm-plugins-{}-{}",
        std::process::id(),
        nombre
    ));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

fn escribir_plugin(raiz: &PathBuf, nombre: &str, contenido: &str) {
    let dir = raiz.join(nombre);
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("plugin.toml"), contenido).unwrap();
}

#[test]
fn descubre_los_plugins_de_la_carpeta() {
    let raiz = carpeta("descubrir");
    escribir_plugin(
        &raiz,
        "git-status",
        r##"
name = "Git"
version = "1.0.0"

[[widgets]]
id = "rama"
command = "git"
args = ["branch", "--show-current"]
prefijo = "git:"
usar_cwd = true
"##,
    );
    escribir_plugin(&raiz, "vacio", "name = \"Sin nada\"\n");

    let plugins = descubrir(&raiz);

    assert_eq!(plugins.len(), 2);
    let git = plugins.iter().find(|p| p.id == "git-status").unwrap();
    assert_eq!(git.name, "Git");
    assert_eq!(git.widgets.len(), 1);
    assert_eq!(git.widgets[0].args, vec!["branch", "--show-current"]);
    assert_eq!(git.widgets[0].intervalo_ms, 5000, "deberia usar el default");

    let _ = std::fs::remove_dir_all(&raiz);
}

/// Sin id explicito manda el nombre de la carpeta: dos plugins nunca comparten
/// carpeta, asi que el id sale unico gratis.
#[test]
fn el_id_sale_de_la_carpeta_si_no_esta_declarado() {
    let raiz = carpeta("sin-id");
    escribir_plugin(&raiz, "docker", "name = \"Docker\"\n");

    let plugins = descubrir(&raiz);

    assert_eq!(plugins[0].id, "docker");
    let _ = std::fs::remove_dir_all(&raiz);
}

/// Un plugin roto no puede impedir que arranque la terminal.
#[test]
fn un_manifiesto_invalido_se_saltea_sin_romper_el_resto() {
    let raiz = carpeta("roto");
    escribir_plugin(&raiz, "bueno", "name = \"Bueno\"\n");
    escribir_plugin(&raiz, "roto", "esto no es toml [[[");

    let plugins = descubrir(&raiz);

    assert_eq!(plugins.len(), 1);
    assert_eq!(plugins[0].id, "bueno");
    let _ = std::fs::remove_dir_all(&raiz);
}

#[test]
fn un_widget_sin_comando_es_un_error() {
    let raiz = carpeta("sin-comando");
    escribir_plugin(
        &raiz,
        "malo",
        "name = \"Malo\"\n\n[[widgets]]\nid = \"x\"\ncommand = \"\"\n",
    );

    let err = leer_manifiesto(&raiz.join("malo").join("plugin.toml")).unwrap_err();

    assert!(err.contains("no declara comando"), "error inesperado: {err}");
    let _ = std::fs::remove_dir_all(&raiz);
}

#[test]
fn una_carpeta_sin_manifiesto_se_ignora() {
    let raiz = carpeta("sin-manifiesto");
    std::fs::create_dir_all(raiz.join("basura")).unwrap();

    assert!(descubrir(&raiz).is_empty());
    let _ = std::fs::remove_dir_all(&raiz);
}

#[test]
fn descubrir_en_una_carpeta_que_no_existe_no_falla() {
    assert!(descubrir(&PathBuf::from("C:\\no\\existe\\para\\nada")).is_empty());
}

#[test]
fn el_widget_ejecuta_y_devuelve_una_linea_con_prefijo() {
    let widget = WidgetPlugin {
        id: "eco".into(),
        command: if cfg!(windows) { "cmd".into() } else { "echo".into() },
        args: if cfg!(windows) {
            vec!["/c".into(), "echo".into(), "hola".into()]
        } else {
            vec!["hola".into()]
        },
        intervalo_ms: 1000,
        prefijo: "eco:".into(),
        usar_cwd: false,
    };

    let salida = tauri::async_runtime::block_on(ejecutar_widget(&widget, None)).unwrap();

    assert_eq!(salida, "eco:hola");
}

#[test]
fn un_comando_inexistente_devuelve_error_en_vez_de_panic() {
    let widget = WidgetPlugin {
        id: "fantasma".into(),
        command: "no_existe_este_binario_12345".into(),
        args: Vec::new(),
        intervalo_ms: 1000,
        prefijo: String::new(),
        usar_cwd: false,
    };

    assert!(tauri::async_runtime::block_on(ejecutar_widget(&widget, None)).is_err());
}
