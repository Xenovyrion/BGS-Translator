use serde::{Deserialize, Serialize};

// ── DeepL API DTOs ────────────────────────────────────────────────────────────

#[derive(Serialize)]
struct DeeplRequest {
    text:         Vec<String>,
    target_lang:  String,
    #[serde(skip_serializing_if = "Option::is_none")]
    source_lang:  Option<String>,
    /// Enable XML tag-awareness so protected placeholders are preserved as-is.
    tag_handling: String,
    /// Tags named "x" are our BGS-tag placeholders — DeepL must not touch them.
    ignore_tags:  Vec<String>,
}

#[derive(Deserialize)]
struct DeeplResponse {
    translations: Vec<DeeplTranslation>,
}

#[derive(Deserialize)]
struct DeeplTranslation {
    text: String,
}

// ── Language code helpers ─────────────────────────────────────────────────────

fn to_deepl_source(lang: &str) -> String {
    match lang.to_lowercase().as_str() {
        "en" => "EN".into(),
        "fr" => "FR".into(),
        "de" => "DE".into(),
        "es" => "ES".into(),
        "it" => "IT".into(),
        "pl" => "PL".into(),
        "ru" => "RU".into(),
        "zh" => "ZH".into(),
        "ja" => "JA".into(),
        "ko" => "KO".into(),
        "pt" => "PT".into(),
        _    => lang.to_uppercase(),
    }
}

/// English target MUST be EN-US or EN-GB (DeepL v2 requirement).
fn to_deepl_target(lang: &str) -> String {
    match lang.to_lowercase().as_str() {
        "en" => "EN-US".into(),
        "fr" => "FR".into(),
        "de" => "DE".into(),
        "es" => "ES".into(),
        "it" => "IT".into(),
        "pl" => "PL".into(),
        "ru" => "RU".into(),
        "zh" => "ZH".into(),
        "ja" => "JA".into(),
        "ko" => "KO".into(),
        "pt" => "PT-PT".into(),
        _    => lang.to_uppercase(),
    }
}

// ── Tag protection ────────────────────────────────────────────────────────────

/// Replace every `<...>` BGS tag with `<x id="N"/>` so DeepL preserves them
/// verbatim thanks to `tag_handling: "xml"` + `ignore_tags: ["x"]`.
///
/// Returns the modified text and the list of original tags in encounter order.
fn protect_tags(text: &str) -> (String, Vec<String>) {
    let mut out  = String::with_capacity(text.len());
    let mut tags: Vec<String> = Vec::new();
    let chars: Vec<char> = text.chars().collect();
    let len = chars.len();
    let mut i = 0;
    while i < len {
        if chars[i] == '<' {
            // Find closing '>'
            let start = i;
            i += 1;
            while i < len && chars[i] != '>' { i += 1; }
            if i < len {
                i += 1; // consume '>'
                let original: String = chars[start..i].iter().collect();
                let id = tags.len();
                tags.push(original);
                // Use self-closing XML element — DeepL will leave it alone
                out.push_str(&format!(r#"<x id="{id}"/>"#));
            } else {
                // Unclosed '<' — emit as-is
                out.extend(chars[start..i].iter());
            }
        } else {
            out.push(chars[i]);
            i += 1;
        }
    }
    (out, tags)
}

/// Put the original BGS tags back after DeepL has returned the translated text.
///
/// DeepL generally preserves `<x id="N"/>` exactly, but we also handle
/// variants with a space before `/>` or with single quotes.
fn restore_tags(text: &str, tags: &[String]) -> String {
    let mut s = text.to_string();
    for (id, original) in tags.iter().enumerate() {
        // Variants DeepL may produce
        s = s
            .replace(&format!(r#"<x id="{id}"/>"#),   original)
            .replace(&format!(r#"<x id="{id}" />"#),   original)
            .replace(&format!(r#"<x id='{id}'/>"#),    original)
            .replace(&format!(r#"<x id='{id}' />"#),   original);
    }
    s
}

// ── Shared HTTP helper ────────────────────────────────────────────────────────

fn make_request_body(
    texts:       Vec<String>,
    target_lang: &str,
    source_lang: Option<String>,
) -> DeeplRequest {
    DeeplRequest {
        text:         texts,
        target_lang:  to_deepl_target(target_lang),
        source_lang,
        tag_handling: "xml".to_string(),
        ignore_tags:  vec!["x".to_string()],
    }
}

fn endpoint(api_type: &str) -> &'static str {
    if api_type == "pro" {
        "https://api.deepl.com/v2/translate"
    } else {
        "https://api-free.deepl.com/v2/translate"
    }
}

fn map_status(code: u16) -> String {
    match code {
        403 => "deepl_invalid_key".into(),
        456 => "deepl_quota_exceeded".into(),
        429 => "deepl_too_many_requests".into(),
        c   => format!("HTTP {c}"),
    }
}

// ── Single-text command ───────────────────────────────────────────────────────

#[tauri::command]
pub async fn translate_deepl_cmd(
    api_key:     String,
    api_type:    String,
    text:        String,
    source_lang: Option<String>,
    target_lang: String,
) -> Result<String, String> {
    let key = api_key.trim();
    if key.is_empty() { return Err("deepl_no_api_key".into()); }
    if text.trim().is_empty() { return Ok(String::new()); }

    let mapped_source = source_lang.as_deref().and_then(|s| {
        if s.trim().is_empty() { None } else { Some(to_deepl_source(s)) }
    });

    // Protect BGS tags before sending
    let (protected, tag_list) = protect_tags(&text);

    let body = make_request_body(vec![protected], &target_lang, mapped_source);

    let client = reqwest::Client::new();
    let response = client
        .post(endpoint(&api_type))
        .header("Authorization", format!("DeepL-Auth-Key {key}"))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;

    let status = response.status();
    if !status.is_success() {
        return Err(map_status(status.as_u16()));
    }

    let parsed: DeeplResponse = response.json().await
        .map_err(|e| format!("Parse error: {e}"))?;

    let translated = parsed.translations.into_iter().next()
        .map(|t| t.text)
        .ok_or_else(|| "deepl_empty_response".to_string())?;

    // Restore original BGS tags
    Ok(restore_tags(&translated, &tag_list))
}

// ── Batch command ─────────────────────────────────────────────────────────────

/// Translate multiple texts in a **single** DeepL API call.
///
/// Each element of `texts` is tag-protected independently before sending.
/// The returned `Vec<String>` has the same length and order as the input.
/// DeepL supports multiple `text[]` values natively — one roundtrip only.
///
/// To avoid hitting payload limits on large selections, chunks of 50 are used.
#[tauri::command]
pub async fn translate_deepl_batch_cmd(
    api_key:     String,
    api_type:    String,
    texts:       Vec<String>,
    target_lang: String,
) -> Result<Vec<String>, String> {
    let key = api_key.trim();
    if key.is_empty() { return Err("deepl_no_api_key".into()); }
    if texts.is_empty() { return Ok(Vec::new()); }

    let client  = reqwest::Client::new();
    let url     = endpoint(&api_type);
    let auth    = format!("DeepL-Auth-Key {key}");
    let tlang   = to_deepl_target(&target_lang);

    // Protect tags for every text, keeping the mapping
    let protected_and_maps: Vec<(String, Vec<String>)> =
        texts.iter().map(|t| protect_tags(t)).collect();

    let mut results: Vec<String> = Vec::with_capacity(texts.len());

    // Chunk into groups of 50 to stay well within DeepL's payload limits
    for chunk in protected_and_maps.chunks(50) {
        let chunk_texts: Vec<String> = chunk.iter().map(|(t, _)| t.clone()).collect();

        let body = DeeplRequest {
            text:         chunk_texts,
            target_lang:  tlang.clone(),
            source_lang:  None, // auto-detect per chunk
            tag_handling: "xml".to_string(),
            ignore_tags:  vec!["x".to_string()],
        };

        let response = client
            .post(url)
            .header("Authorization", auth.clone())
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Network error: {e}"))?;

        let status = response.status();
        if !status.is_success() {
            return Err(map_status(status.as_u16()));
        }

        let parsed: DeeplResponse = response.json().await
            .map_err(|e| format!("Parse error: {e}"))?;

        if parsed.translations.len() != chunk.len() {
            return Err(format!(
                "DeepL returned {} translations for {} texts",
                parsed.translations.len(), chunk.len()
            ));
        }

        for (translation, (_, tag_list)) in parsed.translations.into_iter().zip(chunk.iter()) {
            results.push(restore_tags(&translation.text, tag_list));
        }
    }

    Ok(results)
}
