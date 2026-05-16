/// Extract BGS-style tags (`<...>`) and replace them with `⟦N⟧` placeholders.
/// Returns the modified text and the original tags in encounter order.
///
/// We use rare Unicode bracket pairs ⟦N⟧ (U+27E6/U+27E7) as placeholders.
/// Translation engines preserve these verbatim since they carry no translatable
/// meaning, while standard `<…>` tags would be mangled or stripped.
///
/// Example:
///   "Power from Beyond (<Alias=PlanetWithTrait>)"
///   → protected: "Power from Beyond (⟦0⟧)"
///   → translated: "Pouvoir venu d'ailleurs (⟦0⟧)"
///   → restored:   "Pouvoir venu d'ailleurs (<Alias=PlanetWithTrait>)"
pub fn protect_tags(text: &str) -> (String, Vec<String>) {
    let mut out  = String::with_capacity(text.len() + 8);
    let mut tags: Vec<String> = Vec::new();
    let chars: Vec<char> = text.chars().collect();
    let n = chars.len();
    let mut i = 0;
    while i < n {
        if chars[i] == '<' {
            let start = i;
            i += 1;
            while i < n && chars[i] != '>' { i += 1; }
            if i < n {
                i += 1; // consume '>'
                let tag: String = chars[start..i].iter().collect();
                let id = tags.len();
                tags.push(tag);
                out.push('\u{27E6}');
                out.push_str(&id.to_string());
                out.push('\u{27E7}');
            } else {
                // Unclosed '<' — emit verbatim
                out.extend(chars[start..i].iter());
            }
        } else {
            out.push(chars[i]);
            i += 1;
        }
    }
    (out, tags)
}

/// Restore the original BGS tags after translation.
/// Handles the rare case where an engine adds a space inside the brackets.
pub fn restore_tags(text: &str, tags: &[String]) -> String {
    let mut s = text.to_string();
    for (id, original) in tags.iter().enumerate() {
        let placeholder = format!("\u{27E6}{id}\u{27E7}");
        s = s.replace(&placeholder, original);
    }
    s
}
