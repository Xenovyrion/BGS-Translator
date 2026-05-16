use serde::Deserialize;
use super::{tags, ProviderConfig};

// ── DTOs ──────────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct Response {
    #[serde(rename = "responseStatus")]
    response_status: u16,
    #[serde(rename = "responseData")]
    response_data: ResponseData,
    #[serde(rename = "responseDetails")]
    response_details: Option<String>,
}

#[derive(Deserialize)]
struct ResponseData {
    #[serde(rename = "translatedText")]
    translated_text: String,
}

// ── Public API ────────────────────────────────────────────────────────────────
//
// MyMemory free tier: 1 000 words/day without key, 5 000 with free key.
// Endpoint: GET https://api.mymemory.translated.net/get
//   ?q=text&langpair=en|fr&key=optional_key

pub async fn translate_one(
    config:      &ProviderConfig,
    text:        &str,
    source_lang: Option<&str>,
    target_lang: &str,
) -> Result<String, String> {
    // MyMemory needs a source language — fall back to English
    let src = source_lang.unwrap_or("en");

    let lang_pair = format!("{}|{}", src.to_lowercase(), target_lang.to_lowercase());

    let (protected, tag_list) = tags::protect_tags(text);

    let mut params = vec![
        ("q",        protected.as_str()),
        ("langpair", lang_pair.as_str()),
    ];

    let key_str;
    if let Some(k) = config.api_key.as_deref().filter(|s| !s.trim().is_empty()) {
        key_str = k.to_owned();
        params.push(("key", key_str.as_str()));
    }

    let client   = reqwest::Client::new();
    let response = client
        .get("https://api.mymemory.translated.net/get")
        .query(&params)
        .send().await
        .map_err(|e| format!("Network error: {e}"))?;

    let http_status = response.status();
    if !http_status.is_success() {
        return Err(format!("HTTP {}", http_status.as_u16()));
    }

    let parsed: Response = response.json().await
        .map_err(|e| format!("Parse error: {e}"))?;

    if parsed.response_status != 200 {
        let detail = parsed.response_details.unwrap_or_default();
        return Err(if detail.contains("LIMIT") {
            "mymemory_quota_exceeded".into()
        } else {
            format!("mymemory_error:{detail}")
        });
    }

    Ok(tags::restore_tags(&parsed.response_data.translated_text, &tag_list))
}
