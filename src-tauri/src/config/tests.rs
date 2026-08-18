use super::{Config, ConfigStore};

/// El TOML tiene que poder venir incompleto: si al agregar una opcion nueva la
/// config vieja del usuario dejara de parsear, cada version le romperia los
/// colores.
#[test]
fn un_toml_parcial_completa_con_los_defaults() {
    // r## y no r#: la secuencia `"#` de un color cerraria el raw string.
    let parcial = r##"
[font]
size = 18.0

[colors]
background = "#000000"
"##;

    let config: Config = toml::from_str(parcial).expect("deberia parsear");

    assert_eq!(config.font.size, 18.0);
    assert_eq!(config.colors.background, "#000000");
    // Lo que no vino queda en el default, no en cero.
    assert_eq!(config.window.opacity, 0.88);
    assert_eq!(config.terminal.scrollback, 10000);
    assert_eq!(config.colors.normal.red, "#e27878");
    assert!(config.font.family.contains("Nerd Font"));
}

#[test]
fn el_config_sobrevive_la_ida_y_vuelta_a_toml() {
    let original = Config::default();
    let texto = toml::to_string_pretty(&original).expect("deberia serializar");
    let vuelta: Config = toml::from_str(&texto).expect("deberia parsear");

    assert_eq!(vuelta.window.opacity, original.window.opacity);
    assert_eq!(vuelta.font.family, original.font.family);
    assert_eq!(vuelta.colors.bright.white, original.colors.bright.white);
    assert_eq!(vuelta.cursor.style, original.cursor.style);
}

#[test]
fn un_toml_roto_no_pisa_la_config_en_memoria() {
    let dir = std::env::temp_dir().join(format!("novaterm-test-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let ruta = dir.join("config.toml");

    let mut buena = Config::default();
    buena.font.size = 20.0;
    std::fs::write(&ruta, toml::to_string_pretty(&buena).unwrap()).unwrap();

    let store = ConfigStore::en(ruta.clone());

    std::fs::write(&ruta, "esto no es TOML valido [[[").unwrap();
    let err = store.reload().unwrap_err();

    assert!(!err.is_empty(), "deberia explicar el error de sintaxis");
    assert_eq!(
        store.current().font.size,
        20.0,
        "la config buena tiene que seguir en pie"
    );

    let _ = std::fs::remove_dir_all(&dir);
}

/// Un BOM al principio es invisible en el editor y hacia que toda la config se
/// perdiera en silencio.
#[test]
fn un_archivo_con_bom_se_lee_igual() {
    let dir = std::env::temp_dir().join(format!("novaterm-bom-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let ruta = dir.join("config.toml");

    let mut esperado = Config::default();
    esperado.font.size = 17.0;
    esperado.window.opacity = 0.42;
    let con_bom = format!("\u{feff}{}", toml::to_string_pretty(&esperado).unwrap());
    std::fs::write(&ruta, con_bom).unwrap();

    let store = ConfigStore::en(ruta.clone());
    assert_eq!(store.current().font.size, 17.0, "el BOM rompio la lectura inicial");

    let releida = store.reload().expect("reload deberia tolerar el BOM");
    assert_eq!(releida.window.opacity, 0.42);

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn guardar_y_releer_devuelve_lo_mismo() {
    let dir = std::env::temp_dir().join(format!("novaterm-save-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let ruta = dir.join("config.toml");

    let store = ConfigStore::en(ruta.clone());
    let mut config = Config::default();
    config.window.opacity = 0.5;
    config.colors.background = "#123456".to_string();

    store.save(&config).expect("no se pudo guardar");
    let releida = store.reload().expect("no se pudo releer");

    assert_eq!(releida.window.opacity, 0.5);
    assert_eq!(releida.colors.background, "#123456");

    let _ = std::fs::remove_dir_all(&dir);
}

/// La config viaja al webview dos veces por caminos distintos: inyectada como
/// JSON antes de que cargue el documento, y despues por `config_get`. Si los
/// dos no dieran lo mismo, el arranque pintaria una cosa y el primer refresco
/// otra.
#[test]
fn el_json_inyectado_coincide_con_el_de_config_get() {
    let config = Config::default();

    let json = serde_json::to_string(&config).expect("serializa");
    let vuelta: Config = serde_json::from_str(&json).expect("deserializa");

    assert_eq!(vuelta.font.family, config.font.family);
    assert_eq!(vuelta.font.size, config.font.size);
    assert_eq!(vuelta.colors.background, config.colors.background);
    assert_eq!(vuelta.window.opacity, config.window.opacity);
    // El script se arma con `format!("window.__NOVA_CONFIG__ = {json};")`: si el
    // JSON trajera un salto de linea sin escapar, la linea quedaria partida y
    // el webview no ejecutaria nada.
    assert!(!json.contains('\n'));
}

/// La fuente propia tiene que ser la primera de la cadena por defecto, o en una
/// maquina limpia se cae a Consolas y los prompts con Nerd Font salen rotos.
#[test]
fn la_fuente_por_defecto_arranca_con_la_propia() {
    assert!(Config::default().font.family.starts_with("Nova Mono"));
}
