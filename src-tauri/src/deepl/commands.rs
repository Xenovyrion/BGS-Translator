use serde::{Deserialize, Serialize};

// ── DeepL API DTOs ────────────────────────────────────────────────────────────

#[derive(Serialize)]
struct DeeplRequest {
    text:        Vec<String>,
    target_lang: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    source_lang: Option<String>,
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

/// Maps a 2-letter app language code to a DeepL **source** language code.
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

/// Maps a 2-letter app language code to a DeepL **target** language code.
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

// ── Tauri command ─────────────────────────────────────────────────────────────

/// Translates `text` using the DeepL API.
///
/// Parameters
/// ----------
/// - `api_key`    : DeepL API key (free keys end with `:fx`)
/// - `api_type`   : `"free"` or `"pro"` — selects the API endpoint
/// - `text`       : source text to translate
/// - `source_lang`: 2-letter language code of the source, or `None` for auto-detect
/// - `target_lang`: 2-letter language code of the desired output
///
/// Returns the translated string, or an error message starting with `deepl_`
/// that the frontend can map to a localised string.
#[tauri::command]
pub async fn translate_deepl_cmd(
    api_key:     String,
    api_type:    String,
    text:        String,
    source_lang: Option<String>,
    target_lang: String,
) -> Result<String, String> {
    let key = api_key.trim();
    if key.is_empty() {
        return Err("deepl_no_api_key".to_string());
    }
    if text.trim().is_empty() {
        return Ok(String::new());
    }

    // Select endpoint based on account type
    // (free keys always end with ":fx" — we trust the caller but fallback is safe)
    let endpoint = if api_type == "pro" {
        "https://api.deepl.com/v2/translate"
    } else {
        "https://api-free.deepl.com/v2/translate"
    };

    let mapped_source = source_lang.as_deref().and_then(|s| {
        if s.trim().is_empty() { None } else { Some(to_deepl_source(s)) }
    });

    let body = DeeplRequest {
        text:        vec![text],
        target_lang: to_deepl_target(&target_lang),
        source_lang: mapped_source,
    };

    let client = reqwest::Client::new();
    let response = client
        .post(endpoint)
        .header("Authorization", format!("DeepL-Auth-Key {key}"))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;

    // Map well-known HTTP error codes to frontend-friendly tokens
    let status = response.status();
    if !status.is_success() {
        return Err(match status.as_u16() {
            403 => "deepl_invalid_key".to_string(),
            456 => "deepl_quota_exceeded".to_string(),
            429 => "deepl_too_many_requests".to_string(),
            _   => format!("HTTP {status}"),
        });
    }

    let parsed: DeeplResponse = response
        .json()
        .await
        .map_err(|e| format!("Parse error: {e}"))?;

    parsed
        .translations
        .into_iter()
        .next()
        .map(|t| t.text)
        .ok_or_else(|| "deepl_empty_response".to_string())
}
