use super::{
    combinar, decodificar_utf16, detectar, es_distro_de_sistema, DeteccionCache, Profile,
};

fn perfil(id: &str, command: &str) -> Profile {
    Profile {
        id: id.to_string(),
        name: id.to_string(),
        command: command.to_string(),
        args: Vec::new(),
        icon: String::new(),
        cwd: None,
        detectado: false,
    }
}

/// La deteccion tiene que encontrar algo en cualquier maquina donde corra el
/// test: en Windows siempre esta cmd, y en Unix siempre /bin/sh.
#[test]
fn detecta_al_menos_un_shell_del_sistema() {
    let perfiles = detectar();
    assert!(!perfiles.is_empty(), "no se detecto ningun shell");

    let esperado = if cfg!(windows) { "cmd" } else { "sh" };
    assert!(
        perfiles.iter().any(|p| p.id == esperado),
        "falta el shell base '{esperado}': {:?}",
        perfiles.iter().map(|p| &p.id).collect::<Vec<_>>()
    );
}

#[test]
fn los_detectados_apuntan_a_rutas_que_existen() {
    for p in detectar() {
        assert!(
            std::path::Path::new(&p.command).exists(),
            "{} apunta a {} y no existe",
            p.id,
            p.command
        );
        assert!(p.detectado, "{} deberia venir marcado como detectado", p.id);
    }
}

#[test]
fn un_perfil_del_config_pisa_al_detectado_con_el_mismo_id() {
    let propio = perfil("cmd", "C:\\ruta\\propia\\cmd.exe");
    let combinados = combinar(vec![propio], detectar());

    let cmd: Vec<_> = combinados.iter().filter(|p| p.id == "cmd").collect();
    assert_eq!(cmd.len(), 1, "quedaron dos perfiles con el mismo id");
    assert_eq!(cmd[0].command, "C:\\ruta\\propia\\cmd.exe");
    assert!(!cmd[0].detectado);
}

#[test]
fn los_perfiles_propios_se_suman_a_los_detectados() {
    let propio = perfil("servidor", "ssh");
    let combinados = combinar(vec![propio], detectar());

    assert!(combinados.iter().any(|p| p.id == "servidor"));
    assert!(combinados.len() > 1);
}

/// Docker registra distros propias en WSL que no sirven como shell.
#[test]
fn las_distros_de_sistema_no_son_perfiles() {
    assert!(es_distro_de_sistema("docker-desktop"));
    assert!(es_distro_de_sistema("docker-desktop-data"));
    assert!(es_distro_de_sistema("Docker-Desktop"));
    assert!(!es_distro_de_sistema("Ubuntu"));
    assert!(!es_distro_de_sistema("Debian"));
}

/// `wsl -l -q` responde en UTF-16LE. Si se leyera como UTF-8, cada nombre
/// vendria con un cero entre letra y letra y ningun perfil funcionaria.
#[test]
fn la_salida_utf16_de_wsl_se_decodifica_bien() {
    let texto = "Ubuntu\r\nDebian\r\n";
    let bytes: Vec<u8> = texto.encode_utf16().flat_map(|u| u.to_le_bytes()).collect();

    let decodificado = decodificar_utf16(&bytes);

    assert_eq!(decodificado, texto);
    let distros: Vec<&str> = decodificado
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .collect();
    assert_eq!(distros, vec!["Ubuntu", "Debian"]);
}

/// La cache existe para no correr `wsl.exe` en cada `profiles_list`, pero no
/// puede cambiar lo que se ve: tiene que devolver exactamente lo mismo que la
/// deteccion directa, y lo mismo cada vez que se la consulta.
#[test]
fn la_cache_devuelve_lo_mismo_que_la_deteccion_directa() {
    let cache = DeteccionCache::default();

    let directa = detectar();
    let primera = cache.obtener();
    let segunda = cache.obtener();

    let ids = |perfiles: &[Profile]| -> Vec<String> {
        perfiles.iter().map(|p| p.id.clone()).collect()
    };
    assert_eq!(ids(&primera), ids(&directa));
    assert_eq!(ids(&segunda), ids(&primera));
}

#[test]
fn invalidar_la_cache_vuelve_a_detectar() {
    let cache = DeteccionCache::default();
    let antes = cache.obtener().len();

    cache.invalidar();

    assert_eq!(cache.obtener().len(), antes);
}
