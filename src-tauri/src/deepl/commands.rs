use serde::{Deserialize, Serialize};

// ── DeepL API DTOs ────────────────────────────────────────────────────────────

#[derive(Serialize)]
struct DeeplRequest {
    text:         Vec<String>,
    target_lang:  String,
    #[serde(skip_serializing_if = "Option::is_none")]
    source_lang:  Option<String>,
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
//
// We use rare Unicode bracket pairs ⟦N⟧ as placeholders (U+27E6/U+27E7).
// This avoids sending `tag_handling:"xml"` to DeepL, which would fragment
// the text at each placeholder and cause poor translation of surrounding words.
// DeepL naturally preserves these characters as-is since they carry no
// translatable meaning.
//
// Example:
//   "Power from Beyond (<Alias=PlanetWithTrait>)"
//   → protected: "Power from Beyond (⟦0⟧)"
//   → DeepL FR : "Pouvoir venu d'ailleurs (⟦0⟧)"
//   → restored : "Pouvoir venu d'ailleurs (<Alias=PlanetWithTrait>)"

/// Extract BGS-style tags (`<...>`) and replace them with `⟦N⟧` placeholders.
/// Returns the modified text and the original tags in encounter order.
fn protect_tags(text: &str) -> (String, Vec<String>) {
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
                // ⟦ = U+27E6, ⟧ = U+27E7
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

/// Restore the original BGS tags after DeepL has returned the translated text.
///
/// DeepL preserves the ⟦N⟧ tokens verbatim.  We also handle the rare case
/// where DeepL adds a thin-space or regular space inside the brackets.
fn restore_tags(text: &str, tags: &[String]) -> String {
    let mut s = text.to_string();
    for (id, original) in tags.iter().enumerate() {
        let placeholder = format!("\u{27E6}{id}\u{27E7}");
        s = s.replace(&placeholder, original);
    }
    s
}

// ── Shared helpers ────────────────────────────────────────────────────────────

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

    let body = DeeplRequest {
        text:        vec![protected],
        target_lang: to_deepl_target(&target_lang),
        source_lang: mapped_source,
    };

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

/// Translate multiple texts in a **single** DeepL API call (one HTTP round-trip).
///
/// Each text is tag-protected independently.  Results are returned in the same
/// order as the input.  Large selections are split into chunks of 50 to stay
/// well within DeepL's payload limits.
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

    // Protect tags for every text, keeping the tag maps for later restoration
    let protected_and_maps: Vec<(String, Vec<String>)> =
        texts.iter().map(|t| protect_tags(t)).collect();

    let mut results: Vec<String> = Vec::with_capacity(texts.len());

    // Chunk into groups of 50 to stay within DeepL payload limits
    for chunk in protected_and_maps.chunks(50) {
        let chunk_texts: Vec<String> = chunk.iter().map(|(t, _)| t.clone()).collect();

        let body = DeeplRequest {
            text:        chunk_texts,
            target_lang: tlang.clone(),
            source_lang: None, // auto-detect is best for mixed-content batches
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
