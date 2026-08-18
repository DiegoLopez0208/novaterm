//! Puente al modelo, del lado de Rust.
//!
//! La clave del proveedor no baja nunca al webview. Un plugin pide
//! `llm.complete` y recibe texto; la clave se guarda en el Administrador de
//! credenciales de Windows y solo la toca este modulo. Si viviera en
//! `config.toml` o en el frontend, cualquier plugin con acceso al panel podria
//! leerla y el sandbox del iframe no serviria de nada.
//!
//! Todo pedido pasa por un presupuesto por plugin. Sin tope, un plugin con un
//! bucle mal escrito ---o mal intencionado--- gasta la cuenta del usuario en una
//! tarde y nadie se entera hasta la factura.

#[cfg(test)]
mod tests;

use std::collections::HashMap;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

/// Servicio bajo el que se guardan las claves en el llavero del sistema.
const SERVICIO: &str = "novaterm-llm";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Proveedor {
    Anthropic,
    Openai,
    Deepseek,
}

impl Proveedor {
    pub fn como_texto(self) -> &'static str {
        match self {
            Proveedor::Anthropic => "anthropic",
            Proveedor::Openai => "openai",
            Proveedor::Deepseek => "deepseek",
        }
    }

    fn url(self) -> &'static str {
        match self {
            Proveedor::Anthropic => "https://api.anthropic.com/v1/messages",
            Proveedor::Openai => "https://api.openai.com/v1/chat/completions",
            Proveedor::Deepseek => "https://api.deepseek.com/chat/completions",
        }
    }

    /// Modelo por defecto, para que un plugin no tenga que saber de proveedores.
    pub fn modelo_por_defecto(self) -> &'static str {
        match self {
            Proveedor::Anthropic => "claude-sonnet-5",
            Proveedor::Openai => "gpt-5",
            Proveedor::Deepseek => "deepseek-chat",
        }
    }

    /// Anthropic tiene su propio formato: el rol `system` va en un campo aparte
    /// y `max_tokens` es obligatorio. OpenAI y DeepSeek comparten el de OpenAI.
    fn estilo_anthropic(self) -> bool {
        matches!(self, Proveedor::Anthropic)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Mensaje {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Pedido {
    pub messages: Vec<Mensaje>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub max_tokens: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Respuesta {
    pub text: String,
    pub tokens: u64,
    /// Lo que le queda al plugin hoy, para que pueda avisar antes de quedarse
    /// sin nada a mitad de una tarea.
    pub restante: u64,
}

// --- claves -----------------------------------------------------------------

fn entrada(proveedor: Proveedor) -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICIO, proveedor.como_texto()).map_err(|e| e.to_string())
}

pub fn guardar_clave(proveedor: Proveedor, clave: &str) -> Result<(), String> {
    if clave.trim().is_empty() {
        return borrar_clave(proveedor);
    }
    entrada(proveedor)?
        .set_password(clave.trim())
        .map_err(|e| e.to_string())
}

pub fn borrar_clave(proveedor: Proveedor) -> Result<(), String> {
    match entrada(proveedor)?.delete_credential() {
        Ok(()) => Ok(()),
        // Borrar una clave que no estaba no es un error: la UI llama a esto para
        // "olvidar" sin averiguar antes si habia algo guardado.
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

pub fn hay_clave(proveedor: Proveedor) -> bool {
    entrada(proveedor)
        .and_then(|e| e.get_password().map_err(|e| e.to_string()))
        .is_ok()
}

fn leer_clave(proveedor: Proveedor) -> Result<String, String> {
    entrada(proveedor)?.get_password().map_err(|_| {
        format!(
            "no hay clave guardada para {}; cargala en Ajustes",
            proveedor.como_texto()
        )
    })
}

// --- presupuesto ------------------------------------------------------------

#[derive(Debug, Clone)]
struct Uso {
    /// Dia, como cantidad de dias enteros desde la epoca. Cuando cambia, el
    /// contador arranca de cero.
    dia: u64,
    tokens: u64,
}

/// Cuanto gasto cada plugin hoy.
///
/// Vive en memoria a proposito. Persistirlo obligaria a otro archivo y a decidir
/// que pasa si alguien lo edita a mano; el caso que importa ---un bucle
/// desbocado dentro de una sesion--- queda cubierto igual.
#[derive(Default)]
pub struct Presupuesto {
    usos: Mutex<HashMap<String, Uso>>,
}

impl Presupuesto {
    /// Cuanto le queda al plugin. Falla si ya no le queda nada.
    fn disponible(&self, plugin: &str, tope: u64) -> Result<u64, String> {
        let dia = hoy();
        let mut usos = self.usos.lock().map_err(|e| e.to_string())?;
        let uso = usos
            .entry(plugin.to_string())
            .or_insert(Uso { dia, tokens: 0 });
        if uso.dia != dia {
            uso.dia = dia;
            uso.tokens = 0;
        }
        if uso.tokens >= tope {
            return Err(format!(
                "el plugin '{plugin}' agoto su presupuesto de {tope} tokens por hoy"
            ));
        }
        Ok(tope - uso.tokens)
    }

    /// Se anota el consumo real, no el estimado: el tope se pasa por lo que haya
    /// costado el ultimo pedido y recien ahi se corta. Cobrar antes obligaria a
    /// contar tokens del lado del cliente, que nunca coincide con el proveedor.
    fn anotar(&self, plugin: &str, tokens: u64) {
        if let Ok(mut usos) = self.usos.lock() {
            if let Some(uso) = usos.get_mut(plugin) {
                uso.tokens = uso.tokens.saturating_add(tokens);
            }
        }
    }

    /// Para la UI: cuanto lleva gastado cada plugin hoy.
    pub fn gastado(&self) -> HashMap<String, u64> {
        let dia = hoy();
        self.usos
            .lock()
            .map(|usos| {
                usos.iter()
                    .filter(|(_, u)| u.dia == dia)
                    .map(|(k, u)| (k.clone(), u.tokens))
                    .collect()
            })
            .unwrap_or_default()
    }
}

/// Dia actual como cantidad de dias desde la epoca. Alcanza con un valor que
/// cambie una vez por dia; traer una dependencia de calendario entera para esto
/// no se justifica.
fn hoy() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() / 86_400)
        .unwrap_or(0)
}

// --- pedido -----------------------------------------------------------------

fn cuerpo(proveedor: Proveedor, modelo: &str, pedido: &Pedido) -> serde_json::Value {
    let max = pedido.max_tokens.unwrap_or(1024);

    if proveedor.estilo_anthropic() {
        let sistema: Vec<&str> = pedido
            .messages
            .iter()
            .filter(|m| m.role == "system")
            .map(|m| m.content.as_str())
            .collect();
        let resto: Vec<&Mensaje> = pedido
            .messages
            .iter()
            .filter(|m| m.role != "system")
            .collect();

        let mut cuerpo = serde_json::json!({
            "model": modelo,
            "max_tokens": max,
            "messages": resto,
        });
        if !sistema.is_empty() {
            cuerpo["system"] = serde_json::Value::String(sistema.join("\n\n"));
        }
        return cuerpo;
    }

    serde_json::json!({
        "model": modelo,
        "max_tokens": max,
        "messages": pedido.messages,
    })
}

fn extraer(proveedor: Proveedor, json: &serde_json::Value) -> Result<(String, u64), String> {
    if let Some(error) = json.get("error") {
        let mensaje = error
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("el proveedor devolvio un error sin detalle");
        return Err(mensaje.to_string());
    }

    if proveedor.estilo_anthropic() {
        let texto = json["content"]
            .as_array()
            .map(|bloques| {
                bloques
                    .iter()
                    .filter_map(|b| b.get("text").and_then(|t| t.as_str()))
                    .collect::<Vec<_>>()
                    .join("")
            })
            .unwrap_or_default();
        let tokens = json["usage"]["input_tokens"].as_u64().unwrap_or(0)
            + json["usage"]["output_tokens"].as_u64().unwrap_or(0);
        return Ok((texto, tokens));
    }

    let texto = json["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or_default()
        .to_string();
    let tokens = json["usage"]["total_tokens"].as_u64().unwrap_or(0);
    Ok((texto, tokens))
}

/// Le pide una respuesta al proveedor en nombre de un plugin.
///
/// El `plugin_id` no viene del plugin: lo pone el broker del frontend a partir
/// del iframe que mando el mensaje. Si lo eligiera el plugin, gastaria el
/// presupuesto de otro.
pub async fn completar(
    presupuesto: &Presupuesto,
    proveedor: Proveedor,
    tope_diario: u64,
    plugin_id: &str,
    pedido: Pedido,
) -> Result<Respuesta, String> {
    if pedido.messages.is_empty() {
        return Err("no hay nada que mandar".into());
    }

    let restante = presupuesto.disponible(plugin_id, tope_diario)?;
    let clave = leer_clave(proveedor)?;
    let modelo = pedido
        .model
        .clone()
        .unwrap_or_else(|| proveedor.modelo_por_defecto().to_string());

    let cliente = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;

    let mut peticion = cliente
        .post(proveedor.url())
        .json(&cuerpo(proveedor, &modelo, &pedido));
    peticion = if proveedor.estilo_anthropic() {
        peticion
            .header("x-api-key", clave)
            .header("anthropic-version", "2023-06-01")
    } else {
        peticion.header("authorization", format!("Bearer {clave}"))
    };

    let respuesta = peticion.send().await.map_err(|e| e.to_string())?;
    let estado = respuesta.status();
    let json: serde_json::Value = respuesta.json().await.map_err(|e| e.to_string())?;

    let (texto, tokens) = extraer(proveedor, &json).map_err(|e| {
        if estado.is_success() {
            e
        } else {
            format!("{estado}: {e}")
        }
    })?;

    presupuesto.anotar(plugin_id, tokens);
    // El log deja rastro de quien gasto y cuanto, nunca de que se dijo: el
    // contenido puede llevar lo que el usuario tenia en pantalla.
    log::info!("llm: el plugin '{plugin_id}' gasto {tokens} tokens en {modelo}");

    Ok(Respuesta {
        text: texto,
        tokens,
        restante: restante.saturating_sub(tokens),
    })
}
