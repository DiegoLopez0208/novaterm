//! Los caminos de rechazo del instalador.
//!
//! Instalar es meter codigo ajeno en la maquina: lo que hay que probar no es que
//! un paquete bueno entre, sino que uno malo no entre. Cada test de aca
//! corresponde a una forma concreta de que un registro tomado, un publicador
//! suplantado o un tar armado a mano escriban donde no deben.

use std::io::Write;

use ed25519_dalek::{Signer, SigningKey};
use sha2::{Digest, Sha256};

use super::instalar::{extraer, id_valido, verificar, Version};

fn firmante() -> SigningKey {
    // Semilla fija: el test tiene que ser reproducible, y la clave no protege
    // nada real.
    SigningKey::from_bytes(&[7u8; 32])
}

/// Un paquete valido: sha256 correcto y firmado por la clave que se declara.
fn version_valida(paquete: &[u8], clave: &SigningKey) -> Version {
    Version {
        version: "1.0.0".into(),
        url: "http://ejemplo.invalido/p.tar.gz".into(),
        sha256: hex::encode(Sha256::digest(paquete)),
        firma: hex::encode(clave.sign(paquete).to_bytes()),
    }
}

fn clave_publica(clave: &SigningKey) -> String {
    hex::encode(clave.verifying_key().to_bytes())
}

#[test]
fn un_paquete_intacto_y_firmado_pasa() {
    let clave = firmante();
    let paquete = b"contenido de prueba";
    let version = version_valida(paquete, &clave);
    assert!(verificar(paquete, &version, &clave_publica(&clave)).is_ok());
}

/// El caso de la descarga corrompida o el intermediario que cambia bytes.
#[test]
fn un_paquete_alterado_falla_el_sha256() {
    let clave = firmante();
    let version = version_valida(b"original", &clave);
    let err = verificar(b"alterado", &version, &clave_publica(&clave)).unwrap_err();
    assert!(err.contains("sha256"), "error inesperado: {err}");
}

/// El caso que importa de verdad: alguien controla el registro, recalcula el
/// sha256 para que cierre, pero no tiene la clave privada del publicador.
#[test]
fn un_paquete_rehecho_por_el_registro_falla_la_firma() {
    let legitima = firmante();
    let atacante = SigningKey::from_bytes(&[9u8; 32]);

    let paquete = b"paquete cambiado por el registro";
    // sha256 coherente y firma valida... pero de otra clave.
    let version = version_valida(paquete, &atacante);

    let err = verificar(paquete, &version, &clave_publica(&legitima)).unwrap_err();
    assert!(err.contains("firma"), "error inesperado: {err}");
}

/// Sin firma no se instala. Si esto pasara, bastaria con omitir el campo para
/// saltearse la verificacion entera.
#[test]
fn una_version_sin_firma_se_rechaza() {
    let clave = firmante();
    let paquete = b"contenido";
    let mut version = version_valida(paquete, &clave);
    version.firma = String::new();

    let err = verificar(paquete, &version, &clave_publica(&clave)).unwrap_err();
    assert!(err.contains("firmada"), "error inesperado: {err}");
}

/// Mismo razonamiento del otro lado: un publicador sin clave publica no puede
/// publicar, porque no habria contra que verificar.
#[test]
fn un_plugin_sin_clave_publica_se_rechaza() {
    let clave = firmante();
    let paquete = b"contenido";
    let version = version_valida(paquete, &clave);

    let err = verificar(paquete, &version, "").unwrap_err();
    assert!(err.contains("clave publica"), "error inesperado: {err}");
}

#[test]
fn un_sha256_mal_formado_se_rechaza_sin_panic() {
    let clave = firmante();
    let paquete = b"contenido";
    let mut version = version_valida(paquete, &clave);
    version.sha256 = "no-es-hexadecimal".into();

    let err = verificar(paquete, &version, &clave_publica(&clave)).unwrap_err();
    assert!(err.contains("hexadecimal"), "error inesperado: {err}");
}

#[test]
fn una_firma_de_largo_equivocado_se_rechaza_sin_panic() {
    let clave = firmante();
    let paquete = b"contenido";
    let mut version = version_valida(paquete, &clave);
    version.firma = hex::encode([1u8; 10]);

    let err = verificar(paquete, &version, &clave_publica(&clave)).unwrap_err();
    assert!(err.contains("deberia medir 64"), "error inesperado: {err}");
}

// --- extraccion -------------------------------------------------------------

/// Arma un .tar.gz en memoria con las rutas y contenidos que se le pidan.
///
/// El nombre se escribe directo en la cabecera en vez de usar `append_data`,
/// porque el propio crate `tar` rechaza rutas absolutas o con dos puntos al
/// construir. Justamente por eso hay que escribirlas a mano: el atacante no usa
/// esta API, arma el tar como quiere, y lo que se prueba es que `extraer` lo
/// frene igual.
fn tar_con(entradas: &[(&str, &[u8])]) -> Vec<u8> {
    let mut crudo: Vec<u8> = Vec::new();

    for (ruta, datos) in entradas {
        let mut cabecera = tar::Header::new_gnu();
        {
            let gnu = cabecera.as_gnu_mut().expect("cabecera gnu");
            let bytes = ruta.as_bytes();
            assert!(bytes.len() < gnu.name.len(), "nombre demasiado largo");
            gnu.name[..bytes.len()].copy_from_slice(bytes);
        }
        cabecera.set_size(datos.len() as u64);
        cabecera.set_mode(0o644);
        cabecera.set_entry_type(tar::EntryType::Regular);
        cabecera.set_cksum();

        crudo.extend_from_slice(cabecera.as_bytes());
        crudo.extend_from_slice(datos);
        // Cada bloque del tar mide 512 bytes.
        let sobra = (512 - datos.len() % 512) % 512;
        crudo.extend(std::iter::repeat_n(0u8, sobra));
    }
    // Dos bloques vacios cierran el archivo.
    crudo.extend(std::iter::repeat_n(0u8, 1024));

    let mut gz = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::fast());
    gz.write_all(&crudo).unwrap();
    gz.finish().unwrap()
}

fn carpeta_temporal(nombre: &str) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!("novaterm-test-{nombre}"));
    let _ = std::fs::remove_dir_all(&dir);
    dir
}

#[test]
fn se_extrae_un_paquete_normal() {
    let dir = carpeta_temporal("extraer-ok");
    let paquete = tar_con(&[("plugin.toml", b"id = \"uno\""), ("index.js", b"// hola")]);

    extraer(&paquete, &dir).expect("deberia extraer");
    assert!(dir.join("plugin.toml").is_file());
    assert!(dir.join("index.js").is_file());
    let _ = std::fs::remove_dir_all(&dir);
}

/// El clasico: un tar con una ruta que sube escribe fuera de la carpeta.
#[test]
fn un_tar_que_sube_de_carpeta_se_rechaza() {
    let dir = carpeta_temporal("extraer-sube");
    let paquete = tar_con(&[("../afuera.txt", b"no")]);

    let err = extraer(&paquete, &dir).unwrap_err();
    assert!(err.contains("sube de carpeta"), "error inesperado: {err}");
    assert!(
        !dir.parent().unwrap().join("afuera.txt").exists(),
        "el archivo se escribio igual"
    );
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn un_tar_con_ruta_absoluta_se_rechaza() {
    let dir = carpeta_temporal("extraer-absoluta");
    let paquete = tar_con(&[("/tmp/afuera.txt", b"no")]);

    let err = extraer(&paquete, &dir).unwrap_err();
    assert!(err.contains("es absoluta"), "error inesperado: {err}");
    let _ = std::fs::remove_dir_all(&dir);
}

// --- ids --------------------------------------------------------------------

/// El id es el nombre de la carpeta. Un id con separadores o con dos puntos
/// permitiria instalar fuera de la raiz de plugins.
#[test]
fn los_ids_peligrosos_se_rechazan() {
    assert!(id_valido("explicame"));
    assert!(id_valido("git-helper_2"));

    assert!(!id_valido(""));
    assert!(!id_valido(".."));
    assert!(!id_valido("../otro"));
    assert!(!id_valido("uno/dos"));
    assert!(!id_valido("con espacio"));
    assert!(!id_valido(&"x".repeat(65)));
}

/// Valores de oro producidos por PyNaCl, que es lo que usa la herramienta de
/// empaquetado del registro.
///
/// Las dos mitades de esto viven en repos distintos y en lenguajes distintos: si
/// alguna cambia de biblioteca, de codificacion o de variante de Ed25519, nadie
/// se entera hasta que un usuario no puede instalar nada. Este test es el unico
/// lugar donde las dos se tocan.
///
/// Reproducible con:
///   from nacl.signing import SigningKey
///   k = SigningKey(bytes([7])*32)
///   k.sign(b"paquete de prueba entre python y rust").signature.hex()
#[test]
fn el_verificador_acepta_una_firma_hecha_por_la_herramienta_en_python() {
    let paquete = b"paquete de prueba entre python y rust";

    let version = Version {
        version: "1.0.0".into(),
        url: String::new(),
        sha256: "9d6f669a5733277cc67d8295690fb57d7cec917ce72ab6b75ceb1a9f3cacf91a".into(),
        firma: concat!(
            "043d0d518cd02ac1354a423eaf044ba57c249acd65d0fa0761e6cdf5f94a7e8a",
            "942d9924168ffd02893b9429d7b8232f1621a9ae368018284371899ff9472609"
        )
        .into(),
    };
    let clave = "ea4a6c63e29c520abef5507b132ec5f9954776aebebe7b92421eea691446d22c";

    verificar(paquete, &version, clave).expect("Rust deberia aceptar lo que firma PyNaCl");
}

/// Ciclo completo contra el registro de verdad: pide la ficha, baja el paquete,
/// verifica sha256 y firma, y lo deja instalado.
///
/// Va marcado como ignorado porque necesita el registro levantado. Es la unica
/// prueba que cubre la costura entre los dos repos ---el formato del catalogo,
/// el nombre de los campos, la codificacion de la firma--- y ahi es donde un
/// cambio de un lado rompe al otro sin que ningun test unitario se entere.
///
///   cd ../../novaterm-registry && uv run uvicorn app.main:app --port 8787
///   cargo test --lib se_instala_desde_el_registro -- --ignored --nocapture
#[test]
#[ignore = "necesita el registro corriendo en 127.0.0.1:8787"]
fn se_instala_desde_el_registro() {
    let base = "http://127.0.0.1:8787";
    let dir = carpeta_temporal("instalar-e2e");
    std::fs::create_dir_all(&dir).unwrap();

    let resultado = tauri::async_runtime::block_on(async {
        let ficha = super::instalar::detalle(base, "explicame").await?;
        let version = ficha
            .versions
            .last()
            .cloned()
            .ok_or_else(|| "el registro no ofrece ninguna version".to_string())?;
        super::instalar::instalar(&ficha, &version, &dir).await
    });

    let carpeta = resultado.expect("deberia instalar");
    assert!(carpeta.join("plugin.toml").is_file(), "falta el manifiesto");
    assert!(carpeta.join("index.js").is_file(), "falta el entry");

    // Y el manifiesto instalado tiene que pasar la validacion del cargador, no
    // solo estar ahi.
    let plugin = super::leer_manifiesto(&carpeta.join("plugin.toml")).expect("manifiesto valido");
    assert_eq!(plugin.id, "explicame");
    assert_eq!(plugin.entry.as_deref(), Some("index.js"));
    assert!(plugin.permissions.contains(&super::Permiso::TerminalLeer));

    let _ = std::fs::remove_dir_all(&dir);
}
