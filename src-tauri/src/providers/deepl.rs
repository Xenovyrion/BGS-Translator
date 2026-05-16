use serde::{Deserialize, Serialize};
use super::{tags, ProviderConfig};

// ── DTOs ──────────────────────────────────────────────────────────────────────

#[derive(Serialize)]
struct Request {
    text:        Vec<String>,
    target_lang: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    source_lang: Option<String>,
}

#[derive(Deserialize)]
struct Response {
    translations: Vec<Translation>,
}

#[derive(Deserialize)]
struct Translation {
    text: String,
}

// ── Language helpers ──────────────────────────────────────────────────────────

fn fmt_source(lang: &str) -> String {
    lang.to_uppercase()
}

fn target_lang(lang: &str) -> String {
    match lang.to_lowercase().as_str() {
        "en" => "EN-US".into(),
        "pt" => "PT-PT".into(),
        _    => lang.to_uppercase(),
    }
}

// ── Endpoint / error helpers ──────────────────────────────────────────────────

fn endpoint(variant: &str) -> &'static str {
    if variant == "pro" {
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

// ── Public API ────────────────────────────────────────────────────────────────

pub async fn translate_one(
    config:      &ProviderConfig,
    text:        &str,
    source_lang: Option<&str>,
    target_lang_code: &str,
) -> Result<String, String> {
    let key = config.api_key.as_deref().unwrap_or("").trim();
    if key.is_empty() { return Err("deepl_no_api_key".into()); }

    let variant   = config.variant.as_deref().unwrap_or("free");
    let src        = source_lang.map(fmt_source);
    let tgt        = target_lang(target_lang_code);
    let (protected, tag_list) = tags::protect_tags(text);

    let body = Request {
        text:        vec![protected],
        target_lang: tgt,
        source_lang: src,
    };

    let client   = reqwest::Client::new();
    let response = client
        .post(endpoint(variant))
        .header("Authorization", format!("DeepL-Auth-Key {key}"))
        .json(&body)
        .send().await
        .map_err(|e| format!("Network error: {e}"))?;

    let status = response.status();
    if !status.is_success() { return Err(map_status(status.as_u16())); }

    let parsed: Response = response.json().await
        .map_err(|e| format!("Parse error: {e}"))?;

    let translated = parsed.translations.into_iter().next()
        .map(|t| t.text)
        .ok_or_else(|| "deepl_empty_response".to_string())?;

    Ok(tags::restore_tags(&translated, &tag_list))
}

pub async fn translate_batch(
    config:      &ProviderConfig,
    texts:       &[String],
    _source_lang: Option<&str>,
    target_lang_code: &str,
) -> Result<Vec<String>, String> {
    let key = config.api_key.as_deref().unwrap_or("").trim();
    if key.is_empty() { return Err("deepl_no_api_key".into()); }

    let variant = config.variant.as_deref().unwrap_or("free");
    let tgt      = target_lang(target_lang_code);
    let url      = endpoint(variant);
    let auth     = format!("DeepL-Auth-Key {key}");
    let client   = reqwest::Client::new();

    let protected_and_maps: Vec<(String, Vec<String>)> =
        texts.iter().map(|t| tags::protect_tags(t)).collect();

    let mut results = Vec::with_capacity(texts.len());

    for chunk in protected_and_maps.chunks(50) {
        let chunk_texts: Vec<String> = chunk.iter().map(|(t, _)| t.clone()).collect();
        let body = Request {
            text:        chunk_texts,
            target_lang: tgt.clone(),
            source_lang: None, // auto-detect is best for batches
        };

        let response = client
            .post(url)
            .header("Authorization", auth.clone())
            .json(&body)
            .send().await
            .map_err(|e| format!("Network error: {e}"))?;

        let status = response.status();
        if !status.is_success() { return Err(map_status(status.as_u16())); }

        let parsed: Response = response.json().await
            .map_err(|e| format!("Parse error: {e}"))?;

        if parsed.translations.len() != chunk.len() {
            return Err(format!(
                "DeepL returned {} translations for {} texts",
                parsed.translations.len(), chunk.len()
            ));
        }

        for (translation, (_, tag_list)) in parsed.translations.into_iter().zip(chunk.iter()) {
            results.push(tags::restore_tags(&translation.text, tag_list));
        }
    }

    Ok(results)
}
