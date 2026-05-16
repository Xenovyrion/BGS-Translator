use super::{tags, ProviderConfig};

// ── Template rendering ────────────────────────────────────────────────────────

/// Replace `{text}`, `{from}`, `{to}`, `{api_key}` placeholders in a template.
fn render(template: &str, text: &str, from: &str, to: &str, key: &str) -> String {
    template
        .replace("{text}",    text)
        .replace("{from}",    from)
        .replace("{to}",      to)
        .replace("{api_key}", key)
}

// ── JSON path extraction ──────────────────────────────────────────────────────
//
// Supports simple dot / bracket notation:
//   "translatedText"           → root field
//   "translations[0].text"     → array index then field
//   "data.translations[0].text"→ nested
//
// Returns None if the path doesn't resolve to a string value.

fn json_extract(value: &serde_json::Value, path: &str) -> Option<String> {
    if path.is_empty() {
        // Leaf: try as string, fall back to JSON repr
        return value.as_str().map(str::to_owned)
            .or_else(|| Some(value.to_string()));
    }

    // Array index: path starts with '['
    if let Some(rest) = path.strip_prefix('[') {
        let end  = rest.find(']')?;
        let idx: usize = rest[..end].parse().ok()?;
        let tail = rest[end + 1..].trim_start_matches('.');
        return json_extract(value.get(idx)?, tail);
    }

    // Key: split at the next '.' or '['
    let (key, tail) = if let Some(dot) = path.find('.') {
        if let Some(bracket) = path.find('[') {
            if bracket < dot {
                (&path[..bracket], &path[bracket..])
            } else {
                (&path[..dot], &path[dot + 1..])
            }
        } else {
            (&path[..dot], &path[dot + 1..])
        }
    } else if let Some(bracket) = path.find('[') {
        (&path[..bracket], &path[bracket..])
    } else {
        (path, "")
    };

    json_extract(value.get(key)?, tail)
}

// ── Header parsing ────────────────────────────────────────────────────────────

/// Parse "Header-Name: value" into (name, value) — anything before the first ':'.
fn parse_header(raw: &str) -> Option<(&str, &str)> {
    let colon = raw.find(':')?;
    Some((raw[..colon].trim(), raw[colon + 1..].trim()))
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
        .ok_or("custom_no_endpoint")?;

    let request_template = config.request_template.as_deref()
        .filter(|s| !s.trim().is_empty())
        .ok_or("custom_no_request_template")?;

    let response_path = config.response_path.as_deref()
        .unwrap_or("translatedText");

    let key   = config.api_key.as_deref().unwrap_or("");
    let from  = source_lang.unwrap_or("auto");

    let (protected, tag_list) = tags::protect_tags(text);

    // Render URL and body
    let url  = render(endpoint,         &protected, from, target_lang, key);
    let body = render(request_template, &protected, from, target_lang, key);

    // Parse the rendered body as JSON
    let json_body: serde_json::Value = serde_json::from_str(&body)
        .map_err(|e| format!("custom_invalid_request_template: {e}"))?;

    // Build request
    let client = reqwest::Client::new();
    let mut req = client.post(&url).json(&json_body);

    // Apply auth header if present
    if let Some(auth_template) = config.auth_header.as_deref().filter(|s| !s.trim().is_empty()) {
        let auth_rendered = render(auth_template, &protected, from, target_lang, key);
        if let Some((header_name, header_value)) = parse_header(&auth_rendered) {
            req = req.header(header_name, header_value);
        }
    }

    let response = req.send().await
        .map_err(|e| format!("Network error: {e}"))?;

    let status = response.status();
    if !status.is_success() {
        return Err(format!("HTTP {}", status.as_u16()));
    }

    let json: serde_json::Value = response.json().await
        .map_err(|e| format!("Parse error: {e}"))?;

    let translated = json_extract(&json, response_path)
        .ok_or_else(|| format!("custom_path_not_found: {response_path}"))?;

    Ok(tags::restore_tags(&translated, &tag_list))
}
