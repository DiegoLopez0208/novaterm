//! Bajar, verificar e instalar un plugin del registro.
//!
//! Instalar un plugin es meter codigo de otra persona en la maquina, asi que el
//! orden importa: primero se verifica el paquete entero en memoria, y recien
//! cuando pasa todo se escribe algo en disco. Al reves, un paquete con la firma
//! rota ya habria dejado archivos.
//!
//! Se comprueban dos cosas distintas. El sha256 dice que lo que llego es lo que
//! el registro anuncio ---protege contra una descarga cortada o un intermediario
//! sin TLS---. La firma ed25519 dice que el paquete lo armo quien dice haberlo
//! armado, y eso el registro no lo puede falsificar aunque lo tomen.

use std::path::{Path, PathBuf};

use ed25519_dalek::{Signature, VerifyingKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// Lo que el registro dice de una version antes de bajarla.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Version {
    pub version: String,
    pub url: String,
    /// sha256 del .tar.gz, en hexadecimal.
    pub sha256: String,
    /// Firma ed25519 del mismo .tar.gz, en hexadecimal. La clave publica del
    /// publicador viaja en la ficha del plugin.
    #[serde(default)]
    pub firma: String,
}

/// Ficha de un plugin en el catalogo.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Ficha {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub permissions: Vec<super::Permiso>,
    /// Clave publica ed25519 del publicador, en hexadecimal.
    #[serde(default)]
    pub clave_publica: String,
    #[serde(default)]
    pub versions: Vec<Version>,
}

fn hex_a_bytes(texto: &str, esperados: usize, que: &str) -> Result<Vec<u8>, String> {
    let bytes = hex::decode(texto.trim()).map_err(|e| format!("{que} no es hexadecimal: {e}"))?;
    if bytes.len() != esperados {
        return Err(format!(
            "{que} mide {} bytes y deberia medir {esperados}",
            bytes.len()
        ));
    }
    Ok(bytes)
}

/// Verifica el paquete contra lo que el registro prometio.
///
/// Se separa de la descarga para poder probarla sin red, que es justo lo que hay
/// que poder probar: los caminos de rechazo.
pub fn verificar(paquete: &[u8], version: &Version, clave_publica: &str) -> Result<(), String> {
    let esperado = hex_a_bytes(&version.sha256, 32, "el sha256")?;
    let real = Sha256::digest(paquete);
    if real.as_slice() != esperado.as_slice() {
        return Err(format!(
            "el paquete no coincide con su sha256 (esperado {}, llego {})",
            version.sha256.trim(),
            hex::encode(real)
        ));
    }

    // Sin clave publica no hay nada que verificar, y aceptar el paquete igual
    // seria decir que la firma es opcional. Un publicador sin clave no publica.
    if clave_publica.trim().is_empty() {
        return Err(
            "el plugin no declara clave publica: no se puede verificar quien lo firmo".into(),
        );
    }
    if version.firma.trim().is_empty() {
        return Err("la version no viene firmada".into());
    }

    let clave = hex_a_bytes(clave_publica, 32, "la clave publica")?;
    let clave: [u8; 32] = clave.try_into().expect("ya se verifico que mide 32");
    let verificador =
        VerifyingKey::from_bytes(&clave).map_err(|e| format!("clave publica invalida: {e}"))?;

    let firma = hex_a_bytes(&version.firma, 64, "la firma")?;
    let firma: [u8; 64] = firma.try_into().expect("ya se verifico que mide 64");
    let firma = Signature::from_bytes(&firma);

    verificador
        .verify_strict(paquete, &firma)
        .map_err(|_| "la firma no corresponde a la clave publica del publicador".to_string())
}

/// Un id de plugin se usa como nombre de carpeta, asi que se restringe a lo que
/// no puede escaparse de la raiz ni pisar nada: letras, digitos, guion y guion
/// bajo.
pub fn id_valido(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// Descomprime el .tar.gz dentro de `destino`.
///
/// Cada entrada se comprueba contra la raiz despues de resolverla. Un tar puede
/// traer rutas que suben con dos puntos, rutas absolutas, o un enlace simbolico
/// que apunte afuera; comparar el texto de la ruta no alcanza.
pub fn extraer(paquete: &[u8], destino: &Path) -> Result<(), String> {
    std::fs::create_dir_all(destino).map_err(|e| e.to_string())?;
    let raiz = destino.canonicalize().map_err(|e| e.to_string())?;

    let descomprimido = flate2::read::GzDecoder::new(paquete);
    let mut tar = tar::Archive::new(descomprimido);

    for entrada in tar.entries().map_err(|e| e.to_string())? {
        let mut entrada = entrada.map_err(|e| e.to_string())?;
        let ruta = entrada.path().map_err(|e| e.to_string())?.into_owned();

        // Por componentes y no por `is_absolute()`: en Windows una ruta como
        // "/tmp/x" no es absoluta ---le falta la unidad--- pero si tiene raiz, y
        // se plantaria en la raiz del disco actual. `Prefix` cubre "C:" y las
        // rutas UNC.
        use std::path::Component;
        for componente in ruta.components() {
            let problema = match componente {
                Component::ParentDir => "sube de carpeta",
                Component::RootDir | Component::Prefix(_) => "es absoluta",
                _ => continue,
            };
            return Err(format!(
                "el paquete trae una ruta que {problema}: {}",
                ruta.display()
            ));
        }
        // Los enlaces no le aportan nada a un plugin y son el camino mas corto
        // para escribir fuera de la carpeta.
        let tipo = entrada.header().entry_type();
        if tipo.is_symlink() || tipo.is_hard_link() {
            return Err(format!("el paquete trae un enlace: {}", ruta.display()));
        }

        let destino_final = raiz.join(&ruta);
        if !destino_final.starts_with(&raiz) {
            return Err(format!("el paquete escribe afuera: {}", ruta.display()));
        }

        entrada.unpack(&destino_final).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Baja, verifica e instala. Devuelve la carpeta donde quedo.
pub async fn instalar(ficha: &Ficha, version: &Version, raiz: &Path) -> Result<PathBuf, String> {
    if !id_valido(&ficha.id) {
        return Err(format!("id de plugin invalido: '{}'", ficha.id));
    }

    let cliente = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;

    let respuesta = cliente
        .get(&version.url)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !respuesta.status().is_success() {
        return Err(format!("el registro contesto {}", respuesta.status()));
    }
    let paquete = respuesta.bytes().await.map_err(|e| e.to_string())?;

    verificar(&paquete, version, &ficha.clave_publica)?;

    // A una carpeta temporal primero. Extraer encima de la instalacion vieja
    // dejaria un plugin a medio reemplazar si el tar falla en la mitad.
    let definitiva = raiz.join(&ficha.id);
    let temporal = raiz.join(format!(".{}.parcial", ficha.id));
    if temporal.exists() {
        std::fs::remove_dir_all(&temporal).map_err(|e| e.to_string())?;
    }
    extraer(&paquete, &temporal)?;

    if !temporal.join("plugin.toml").is_file() {
        let _ = std::fs::remove_dir_all(&temporal);
        return Err("el paquete no trae plugin.toml".into());
    }
    // Se lee antes de dejarlo en su lugar: un manifiesto invalido no llega a
    // instalarse.
    let manifiesto = match super::leer_manifiesto(&temporal.join("plugin.toml")) {
        Ok(m) => m,
        Err(e) => {
            let _ = std::fs::remove_dir_all(&temporal);
            return Err(e);
        }
    };
    if manifiesto.id != ficha.id {
        let _ = std::fs::remove_dir_all(&temporal);
        return Err(format!(
            "el paquete dice ser '{}' pero el catalogo lo llama '{}'",
            manifiesto.id, ficha.id
        ));
    }

    if definitiva.exists() {
        std::fs::remove_dir_all(&definitiva).map_err(|e| e.to_string())?;
    }
    std::fs::rename(&temporal, &definitiva).map_err(|e| e.to_string())?;
    Ok(definitiva)
}

/// Borra la carpeta de un plugin instalado.
pub fn desinstalar(raiz: &Path, id: &str) -> Result<(), String> {
    if !id_valido(id) {
        return Err(format!("id de plugin invalido: '{id}'"));
    }
    let carpeta = raiz.join(id);
    if !carpeta.is_dir() {
        return Ok(());
    }
    std::fs::remove_dir_all(carpeta).map_err(|e| e.to_string())
}

/// Pide el catalogo al registro.
pub async fn buscar(base: &str, consulta: &str) -> Result<Vec<Ficha>, String> {
    let cliente = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;

    let respuesta = cliente
        .get(format!("{}/v1/plugins", base.trim_end_matches('/')))
        .query(&[("q", consulta)])
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !respuesta.status().is_success() {
        return Err(format!("el registro contesto {}", respuesta.status()));
    }
    respuesta.json().await.map_err(|e| e.to_string())
}

/// Pide la ficha completa de un plugin, con sus versiones.
pub async fn detalle(base: &str, id: &str) -> Result<Ficha, String> {
    if !id_valido(id) {
        return Err(format!("id de plugin invalido: '{id}'"));
    }
    let cliente = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;

    let respuesta = cliente
        .get(format!("{}/v1/plugins/{id}", base.trim_end_matches('/')))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !respuesta.status().is_success() {
        return Err(format!("el registro contesto {}", respuesta.status()));
    }
    respuesta.json().await.map_err(|e| e.to_string())
}
