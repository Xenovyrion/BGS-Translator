use serde::{Deserialize, Serialize};
use super::{tags, ProviderConfig};

// ── DTOs ──────────────────────────────────────────────────────────────────────

#[derive(Serialize)]
struct Request<'a> {
    q:       &'a str,
    source:  &'a str,
    target:  &'a str,
    format:  &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    api_key: Option<&'a str>,
}

#[derive(Deserialize)]
struct Response {
    #[serde(rename = "translatedText")]
    translated_text: String,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/// Public LibreTranslate instance as default endpoint.
const DEFAULT_ENDPOINT: &str = "https://libretranslate.com/translate";

fn map_status(code: u16) -> String {
    match code {
        400 => "libretranslate_bad_request".into(),
        403 => "libretranslate_forbidden".into(),
        429 => "libretranslate_too_many_requests".into(),
        500 => "libretranslate_server_error".into(),
        c   => format!("HTTP {c}"),
    }
}

// ── Public API ────────────────────────────────────────────────────────────────

pub async fn translate_one(
    config:      &ProviderConfig,
    text:        &str,
    source_lang: Option<&str>,
    target_lang: &str,
) -> Result<String, String> {
    let endpoint = config.endpoint.as_deref()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or(DEFAULT_ENDPOINT);

    let api_key = config.api_key.as_deref()
        .filter(|s| !s.trim().is_empty());

    // LibreTranslate uses "auto" for auto-detection
    let src = source_lang.unwrap_or("auto");

    let (protected, tag_list) = tags::protect_tags(text);

    let body = Request {
        q:       &protected,
        source:  src,
        target:  target_lang,
        format:  "text",
        api_key,
    };

    let client   = reqwest::Client::new();
    let response = client
        .post(endpoint)
        .json(&body)
        .send().await
        .map_err(|e| format!("Network error: {e}"))?;

    let status = response.status();
    if !status.is_success() { return Err(map_status(status.as_u16())); }

    let parsed: Response = response.json().await
        .map_err(|e| format!("Parse error: {e}"))?;

    Ok(tags::restore_tags(&parsed.translated_text, &tag_list))
}
