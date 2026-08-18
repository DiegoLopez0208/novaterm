use std::path::PathBuf;

use super::{a_perfil, argumentos, cargar, guardar, Conexion};

fn conexion(id: &str) -> Conexion {
    Conexion {
        id: id.to_string(),
        nombre: "Production".into(),
        host: "192.168.1.50".into(),
        usuario: "root".into(),
        puerto: 22,
        identidad: String::new(),
    }
}

fn ruta_temporal(nombre: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("novaterm-ssh-{}-{}", std::process::id(), nombre));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir.join("ssh.toml")
}

#[test]
fn guardar_y_cargar_devuelve_lo_mismo() {
    let ruta = ruta_temporal("ida-vuelta");
    let conexiones = vec![conexion("prod"), conexion("staging")];

    guardar(&ruta, &conexiones).unwrap();
    let leidas = cargar(&ruta);

    assert_eq!(leidas, conexiones);
    let _ = std::fs::remove_dir_all(ruta.parent().unwrap());
}

#[test]
fn cargar_un_archivo_que_no_existe_da_lista_vacia() {
    assert!(cargar(&PathBuf::from("C:\\no\\existe\\ssh.toml")).is_empty());
}

/// El puerto por defecto no se pasa: `ssh -p 22` es ruido, y ademas asi la
/// linea queda igual a la que uno escribiria a mano.
#[test]
fn el_puerto_estandar_no_agrega_argumentos() {
    let args = argumentos(&conexion("prod"));
    assert_eq!(args, vec!["root@192.168.1.50"]);
}

#[test]
fn un_puerto_distinto_se_pasa_con_p() {
    let mut c = conexion("prod");
    c.puerto = 2222;

    assert_eq!(argumentos(&c), vec!["-p", "2222", "root@192.168.1.50"]);
}

#[test]
fn sin_usuario_se_conecta_solo_al_host() {
    let mut c = conexion("prod");
    c.usuario = String::new();

    assert_eq!(argumentos(&c), vec!["192.168.1.50"]);
}

#[test]
fn la_clave_privada_se_pasa_con_i() {
    let mut c = conexion("prod");
    c.identidad = "C:\\Users\\Diego\\.ssh\\id_ed25519".into();

    let args = argumentos(&c);

    assert_eq!(args[0], "-i");
    assert_eq!(args[1], "C:\\Users\\Diego\\.ssh\\id_ed25519");
    assert_eq!(args[2], "root@192.168.1.50");
}

/// Cada argumento viaja separado hasta CreateProcess. Si se armara una linea de
/// comando concatenando, lo que hay despues del `;` se ejecutaria.
#[test]
fn un_host_con_metacaracteres_queda_en_un_solo_argumento() {
    let mut c = conexion("raro");
    c.host = "host; rm -rf /".into();

    let args = argumentos(&c);

    assert_eq!(args.len(), 1);
    assert_eq!(args[0], "root@host; rm -rf /");
}

/// La red de seguridad del diseño: si alguien agrega un campo de contraseña,
/// este test lo hace visible.
#[test]
fn el_archivo_guardado_no_contiene_secretos() {
    let ruta = ruta_temporal("sin-secretos");
    guardar(&ruta, &[conexion("prod")]).unwrap();

    let texto = std::fs::read_to_string(&ruta).unwrap().to_lowercase();

    for prohibido in ["password", "contrasena", "passphrase", "secret"] {
        assert!(
            !texto.contains(prohibido),
            "el archivo de conexiones no deberia guardar '{prohibido}'"
        );
    }
    let _ = std::fs::remove_dir_all(ruta.parent().unwrap());
}

#[test]
fn la_conexion_se_convierte_en_un_perfil_de_ssh() {
    let perfil = a_perfil(&conexion("prod"));

    assert_eq!(perfil.id, "ssh-prod");
    assert_eq!(perfil.name, "Production");
    assert_eq!(perfil.command, "ssh");
    assert_eq!(perfil.args, vec!["root@192.168.1.50"]);
    assert!(!perfil.detectado);
}
