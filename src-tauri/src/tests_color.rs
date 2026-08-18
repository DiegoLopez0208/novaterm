use crate::hex_a_rgb;

#[test]
fn convierte_un_color_hexadecimal() {
    assert_eq!(hex_a_rgb("#84a0c6"), Some((132, 160, 198)));
    assert_eq!(hex_a_rgb("84a0c6"), Some((132, 160, 198)));
    assert_eq!(hex_a_rgb("  #FF8AC4  "), Some((255, 138, 196)));
}

#[test]
fn rechaza_lo_que_no_es_un_color() {
    assert_eq!(hex_a_rgb(""), None);
    assert_eq!(hex_a_rgb("#fff"), None, "el formato corto no se soporta");
    assert_eq!(hex_a_rgb("#zzzzzz"), None);
    assert_eq!(hex_a_rgb("#84a0c6ff"), None, "con alpha no es un COLORREF");
}

/// COLORREF es 0x00BBGGRR: invertir el orden da un borde de otro color, y es un
/// error que no se ve hasta mirar la ventana.
#[test]
fn el_orden_de_bytes_de_colorref_es_bgr() {
    let (r, g, b) = hex_a_rgb("#ff0000").unwrap();
    let colorref: u32 = (b as u32) << 16 | (g as u32) << 8 | r as u32;

    assert_eq!(colorref, 0x0000_00ff, "el rojo puro va en el byte bajo");

    let (r, g, b) = hex_a_rgb("#0000ff").unwrap();
    let colorref: u32 = (b as u32) << 16 | (g as u32) << 8 | r as u32;

    assert_eq!(colorref, 0x00ff_0000, "el azul puro va en el byte alto");
}
