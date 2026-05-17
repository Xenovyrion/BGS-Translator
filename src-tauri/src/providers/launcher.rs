use tauri_plugin_opener::OpenerExt;

// ── URL builders ──────────────────────────────────────────────────────────────

/// Maximum text length we'll embed in the URL.
/// Beyond this threshold we signal the frontend to use clipboard fallback.
const MAX_URL_TEXT_LEN: usize = 1_500;

fn build_url(
    service:          &str,
    text:             &str,
    source_lang:      &str,
    target_lang:      &str,
    custom_template:  Option<&str>,
) -> Option<String> {
    let encoded = urlencoded(text);
    let sl = source_lang.to_lowercase();
    let tl = target_lang.to_lowercase();

    match service {
        "launcher_deepl" => Some(format!(
            "https://www.deepl.com/translator#{}/{}/{}",
            sl, tl, encoded,
        )),
        "launcher_google" => Some(format!(
            "https://translate.google.com/?sl={}&tl={}&text={}&op=translate",
            sl, tl, encoded,
        )),
        "launcher_bing" => Some(format!(
            "https://www.bing.com/translator?text={}&from={}&to={}",
            encoded, sl, tl,
        )),
        // Custom browser launcher: the `endpoint` field is a URL template with
        // optional placeholders: {text}, {from}, {to}, {text_enc}
        _ if custom_template.is_some() => {
            let tmpl = custom_template.unwrap();
            let url  = tmpl
                .replace("{text_enc}", &encoded)
                .replace("{text}",     text)
                .replace("{from}",     &sl)
                .replace("{to}",       &tl);
            Some(url)
        }
        _ => None,
    }
}

fn urlencoded(s: &str) -> String {
    // Percent-encode everything except unreserved chars (RFC 3986).
    // We do this manually to avoid adding a dependency.
    let mut out = String::with_capacity(s.len() * 3);
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9'
            | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
            b' ' => out.push('+'),
            _    => { out.push('%'); out.push_str(&format!("{b:02X}")); }
        }
    }
    out
}

// ── Result sent to frontend ───────────────────────────────────────────────────

#[derive(serde::Serialize)]
pub struct LaunchResult {
    /// Browser was opened successfully.
    pub opened: bool,
    /// True when the text was embedded in the URL.
    /// False when text was too long — frontend should copy it to clipboard.
    pub text_in_url: bool,
}

// ── Public API ────────────────────────────────────────────────────────────────

/// Open a browser-based translation service.
///
/// `custom_template` is the URL template for custom launchers (the `endpoint` field from
/// ProviderConfig). It may contain: `{text_enc}`, `{text}`, `{from}`, `{to}`.
pub fn open(
    app:             &tauri::AppHandle,
    service:         &str,
    text:            &str,
    source_lang:     &str,
    target_lang:     &str,
    custom_template: Option<&str>,
) -> Result<LaunchResult, String> {
    let text_in_url = text.len() <= MAX_URL_TEXT_LEN;

    // If text is too long, open the service with an empty text slot
    let effective_text = if text_in_url { text } else { "" };

    let url = build_url(service, effective_text, source_lang, target_lang, custom_template)
        .ok_or_else(|| format!("launcher_unknown_service:{service}"))?;

    app.opener()
        .open_url(&url, None::<&str>)
        .map_err(|e| format!("Cannot open browser: {e}"))?;

    Ok(LaunchResult { opened: true, text_in_url })
}
