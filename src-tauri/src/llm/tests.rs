use super::*;

fn pedido(mensajes: &[(&str, &str)]) -> Pedido {
    Pedido {
        messages: mensajes
            .iter()
            .map(|(r, c)| Mensaje {
                role: r.to_string(),
                content: c.to_string(),
            })
            .collect(),
        model: None,
        max_tokens: None,
    }
}

/// Anthropic rechaza el rol `system` dentro de `messages`: va en su propio
/// campo. Mandarlo en la lista devuelve un 400, asi que la separacion tiene que
/// pasar antes de salir a la red.
#[test]
fn anthropic_saca_el_system_de_los_mensajes() {
    let cuerpo = cuerpo(
        Proveedor::Anthropic,
        "claude-sonnet-5",
        &pedido(&[("system", "sos util"), ("user", "hola")]),
    );

    assert_eq!(cuerpo["system"], "sos util");
    assert_eq!(cuerpo["messages"].as_array().unwrap().len(), 1);
    assert_eq!(cuerpo["messages"][0]["role"], "user");
}

/// Varios mensajes de sistema se juntan en uno solo: el campo es un string.
#[test]
fn anthropic_junta_varios_system() {
    let cuerpo = cuerpo(
        Proveedor::Anthropic,
        "claude-sonnet-5",
        &pedido(&[("system", "uno"), ("system", "dos"), ("user", "hola")]),
    );
    assert_eq!(cuerpo["system"], "uno\n\ndos");
}

/// Sin mensajes de sistema no se manda el campo: mandarlo vacio tambien es 400.
#[test]
fn anthropic_sin_system_no_manda_el_campo() {
    let cuerpo = cuerpo(
        Proveedor::Anthropic,
        "claude-sonnet-5",
        &pedido(&[("user", "hola")]),
    );
    assert!(cuerpo.get("system").is_none());
}

/// En el formato de OpenAI el `system` es un mensaje mas y tiene que quedarse
/// donde estaba.
#[test]
fn openai_deja_el_system_en_la_lista() {
    let cuerpo = cuerpo(
        Proveedor::Deepseek,
        "deepseek-chat",
        &pedido(&[("system", "sos util"), ("user", "hola")]),
    );
    assert!(cuerpo.get("system").is_none());
    assert_eq!(cuerpo["messages"].as_array().unwrap().len(), 2);
    assert_eq!(cuerpo["messages"][0]["role"], "system");
}

#[test]
fn se_extrae_el_texto_y_los_tokens_de_anthropic() {
    let json = serde_json::json!({
        "content": [{ "type": "text", "text": "hola" }, { "type": "text", "text": " mundo" }],
        "usage": { "input_tokens": 10, "output_tokens": 5 }
    });
    let (texto, tokens) = extraer(Proveedor::Anthropic, &json).unwrap();
    assert_eq!(texto, "hola mundo");
    assert_eq!(tokens, 15);
}

#[test]
fn se_extrae_el_texto_y_los_tokens_de_openai() {
    let json = serde_json::json!({
        "choices": [{ "message": { "content": "hola" } }],
        "usage": { "total_tokens": 42 }
    });
    let (texto, tokens) = extraer(Proveedor::Deepseek, &json).unwrap();
    assert_eq!(texto, "hola");
    assert_eq!(tokens, 42);
}

/// Un 200 con `error` adentro existe: hay proveedores que contestan asi. Sin
/// mirar el campo, el plugin recibiria una respuesta vacia sin saber por que.
#[test]
fn un_error_en_el_cuerpo_se_devuelve_como_error() {
    let json = serde_json::json!({ "error": { "message": "clave invalida" } });
    let err = extraer(Proveedor::Deepseek, &json).unwrap_err();
    assert!(err.contains("clave invalida"), "error inesperado: {err}");
}

#[test]
fn el_presupuesto_descuenta_lo_gastado() {
    let p = Presupuesto::default();
    assert_eq!(p.disponible("uno", 1000).unwrap(), 1000);
    p.anotar("uno", 400);
    assert_eq!(p.disponible("uno", 1000).unwrap(), 600);
}

/// Es lo que evita que un plugin con un bucle desbocado vacie la cuenta.
#[test]
fn el_presupuesto_corta_al_llegar_al_tope() {
    let p = Presupuesto::default();
    p.disponible("uno", 100).unwrap();
    p.anotar("uno", 150); // el ultimo pedido puede pasarse: se cobra lo real
    let err = p.disponible("uno", 100).unwrap_err();
    assert!(err.contains("agoto"), "error inesperado: {err}");
}

/// Cada plugin tiene su propia cuenta: uno que se pasa no puede dejar sin
/// presupuesto a los demas.
#[test]
fn el_presupuesto_es_por_plugin() {
    let p = Presupuesto::default();
    p.disponible("uno", 100).unwrap();
    p.anotar("uno", 200);
    assert!(p.disponible("uno", 100).is_err());
    assert_eq!(p.disponible("otro", 100).unwrap(), 100);
}

#[test]
fn gastado_solo_informa_del_dia_en_curso() {
    let p = Presupuesto::default();
    p.disponible("uno", 1000).unwrap();
    p.anotar("uno", 30);
    assert_eq!(p.gastado().get("uno"), Some(&30));
}

/// Un pedido vacio se corta antes de leer la clave y antes de abrir el cliente
/// HTTP: no tiene sentido gastar una llamada ni tocar el llavero.
#[test]
fn un_pedido_sin_mensajes_no_sale_a_la_red() {
    let p = Presupuesto::default();
    let vacio = Pedido {
        messages: Vec::new(),
        model: None,
        max_tokens: None,
    };
    let err =
        tauri::async_runtime::block_on(completar(&p, Proveedor::Deepseek, 1000, "uno", vacio))
            .unwrap_err();
    assert!(err.contains("nada que mandar"), "error inesperado: {err}");
}
