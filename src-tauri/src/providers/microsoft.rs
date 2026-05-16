use serde::{Deserialize, Serialize};
use super::{tags, ProviderConfig};

// ── DTOs ──────────────────────────────────────────────────────────────────────

#[derive(Serialize)]
struct RequestItem<'a> {
    #[serde(rename = "Text")]
    text: &'a str,
}

#[derive(Deserialize)]
struct ResponseItem {
    translations: Vec<TranslationItem>,
}

#[derive(Deserialize)]
struct TranslationItem {
    text: String,
}

// ── Language helpers ──────────────────────────────────────────────────────────
//
// Microsoft uses lowercase BCP-47 codes with some differences from ISO 639-1.

fn ms_lang(lang: &str) -> String {
    match lang.to_lowercase().as_str() {
        "zh" => "zh-Hans".into(),   // Simplified Chinese
        "pt" => "pt-pt".into(),
        _    => lang.to_lowercase(),
    }
}

// ── Endpoint / error helpers ──────────────────────────────────────────────────

const BASE_URL: &str =
    "https://api.cognitive.microsofttranslator.com/translate?api-version=3.0";

fn map_status(code: u16) -> String {
    match code {
        401 | 403 => "microsoft_invalid_key".into(),
        429       => "microsoft_too_many_requests".into(),
        456       => "microsoft_quota_exceeded".into(),
        c         => format!("HTTP {c}"),
    }
}

// ── Shared request helper ─────────────────────────────────────────────────────

async fn call(
    client:  &reqwest::Client,
    key:     &str,
    region:  Option<&str>,
    url:     &str,
    items:   &[RequestItem<'_>],
) -> Result<Vec<String>, String> {
    let mut req = client
        .post(url)
        .header("Ocp-Apim-Subscription-Key", key)
        .header("Content-Type", "application/json");

    if let Some(r) = region {
        if !r.is_empty() {
            req = req.header("Ocp-Apim-Subscription-Region", r);
        }
    }

    let response = req.json(items).send().await
        .map_err(|e| format!("Network error: {e}"))?;

    let status = response.status();
    if !status.is_success() { return Err(map_status(status.as_u16())); }

    let parsed: Vec<ResponseItem> = response.json().await
        .map_err(|e| format!("Parse error: {e}"))?;

    Ok(parsed.into_iter()
        .filter_map(|r| r.translations.into_iter().next())
        .map(|t| t.text)
        .collect())
}

// ── Public API ────────────────────────────────────────────────────────────────

pub async fn translate_one(
    config:      &ProviderConfig,
    text:        &str,
    source_lang: Option<&str>,
    target_lang: &str,
) -> Result<String, String> {
    let key = config.api_key.as_deref().unwrap_or("").trim();
    if key.is_empty() { return Err("microsoft_no_api_key".into()); }

    let region = config.variant.as_deref();
    let tgt    = ms_lang(target_lang);
    let mut url = format!("{BASE_URL}&to={tgt}");
    if let Some(src) = source_lang {
        url.push_str(&format!("&from={}", ms_lang(src)));
    }

    let (protected, tag_list) = tags::protect_tags(text);
    let items = vec![RequestItem { text: &protected }];
    let client = reqwest::Client::new();

    let translated = call(&client, key, region, &url, &items).await?
        .into_iter().next()
        .ok_or_else(|| "microsoft_empty_response".to_string())?;

    Ok(tags::restore_tags(&translated, &tag_list))
}

pub async fn translate_batch(
    config:      &ProviderConfig,
    texts:       &[String],
    source_lang: Option<&str>,
    target_lang: &str,
) -> Result<Vec<String>, String> {
    let key = config.api_key.as_deref().unwrap_or("").trim();
    if key.is_empty() { return Err("microsoft_no_api_key".into()); }

    let region = config.variant.as_deref();
    let tgt    = ms_lang(target_lang);
    let mut url = format!("{BASE_URL}&to={tgt}");
    if let Some(src) = source_lang {
        url.push_str(&format!("&from={}", ms_lang(src)));
    }

    let client = reqwest::Client::new();

    // Protect tags for every text
    let protected_and_maps: Vec<(String, Vec<String>)> =
        texts.iter().map(|t| tags::protect_tags(t)).collect();

    let mut results = Vec::with_capacity(texts.len());

    // Microsoft allows up to 100 items per request
    for chunk in protected_and_maps.chunks(100) {
        let items: Vec<RequestItem> = chunk.iter()
            .map(|(t, _)| RequestItem { text: t.as_str() })
            .collect();

        let translated = call(&client, key, region, &url, &items).await?;

        if translated.len() != chunk.len() {
            return Err(format!(
                "Microsoft returned {} translations for {} texts",
                translated.len(), chunk.len()
            ));
        }

        for (text, (_, tag_list)) in translated.into_iter().zip(chunk.iter()) {
            results.push(tags::restore_tags(&text, tag_list));
        }
    }

    Ok(results)
}
