use super::{
    Colors, CursorConfig, FontConfig, LlmConfig, Palette, PluginsConfig, TerminalConfig, UiConfig,
    WindowConfig,
};

impl Default for WindowConfig {
    fn default() -> Self {
        Self {
            opacity: 0.88,
            blur: true,
            padding: 12,
            // La barra la dibuja la app; la nativa de Windows rompia la pieza.
            decorations: false,
        }
    }
}

impl Default for FontConfig {
    fn default() -> Self {
        Self {
            // Nova Mono va empaquetada con la app, asi que el default se ve
            // igual en cualquier maquina. El resto de la cadena es el respaldo;
            // los glifos Nerd Font los aporta "Simbolos Nova", que el frontend
            // agrega al final de toda cadena de fuentes.
            family: "Nova Mono, JetBrainsMono Nerd Font, Cascadia Mono, Consolas, monospace"
                .to_string(),
            size: 14.0,
            line_height: 1.1,
            letter_spacing: 0.0,
            ligatures: true,
        }
    }
}

impl Default for CursorConfig {
    fn default() -> Self {
        Self {
            style: "bar".to_string(),
            blink: true,
        }
    }
}

impl Default for TerminalConfig {
    fn default() -> Self {
        Self {
            // Por panel, no por ventana: cuatro paneles con el default viejo de
            // 10.000 lineas eran ~24 MB de buffer que casi nadie llega a mirar.
            scrollback: 5000,
            copy_on_select: false,
            gpu: true,
        }
    }
}

impl Default for UiConfig {
    fn default() -> Self {
        Self {
            tab_bar: true,
            status_bar: true,
            animations: true,
            welcome: true,
        }
    }
}

impl Default for LlmConfig {
    fn default() -> Self {
        Self {
            provider: crate::llm::Proveedor::Deepseek,
            model: String::new(),
            // Alcanza para un dia de uso normal de un plugin que explica errores
            // y corta mucho antes de que un bucle haga dano.
            tokens_por_dia: 200_000,
        }
    }
}

impl Default for PluginsConfig {
    fn default() -> Self {
        Self {
            concedidos: std::collections::HashMap::new(),
            de_confianza: Vec::new(),
            registro: "http://127.0.0.1:8787".to_string(),
        }
    }
}

impl Default for Colors {
    fn default() -> Self {
        Self {
            background: "#0d0f18".to_string(),
            foreground: "#d8dee9".to_string(),
            cursor: "#ffffff".to_string(),
            selection: "#2b3245".to_string(),
            normal: Palette {
                black: "#161821".to_string(),
                red: "#e27878".to_string(),
                green: "#b4be82".to_string(),
                yellow: "#e2a478".to_string(),
                blue: "#84a0c6".to_string(),
                magenta: "#a093c7".to_string(),
                cyan: "#89b8c2".to_string(),
                white: "#c6c8d1".to_string(),
            },
            bright: Palette {
                black: "#6b7089".to_string(),
                red: "#e98989".to_string(),
                green: "#c0ca8e".to_string(),
                yellow: "#e9b189".to_string(),
                blue: "#91acd1".to_string(),
                magenta: "#ada0d3".to_string(),
                cyan: "#95c4ce".to_string(),
                white: "#d2d4de".to_string(),
            },
        }
    }
}

impl Default for Palette {
    fn default() -> Self {
        Colors::default().normal
    }
}
