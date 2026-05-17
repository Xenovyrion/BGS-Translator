/// AI / LLM provider module.
///
/// Supported backends:
/// - `ollama`    — local Ollama server (http://localhost:11434)
/// - `claude`    — Anthropic Claude API
/// - `cohere`    — Cohere Chat API v2
/// - `custom_ai` — any OpenAI-compatible endpoint (LM Studio, Groq, Mistral, OpenAI…)
///
/// Tag protection (see `tags.rs`) is applied automatically before every call
/// and reversed after — the LLM never sees raw BGS tags.
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json;
use super::{tags, ProviderConfig};
use log::{info, warn, error, debug};

// ── Default system prompt ─────────────────────────────────────────────────────

pub const DEFAULT_SYSTEM_PROMPT: &str = "\
You are a professional video game translator specializing in Bethesda RPGs \
(Starfield, Skyrim, Fallout).\n\
Translate from {source_lang} to {target_lang}.\n\
\n\
Rules:\n\
- Return ONLY the translated text — no explanations, no quotes, no comments\n\
- Preserve all special symbols, brackets and placeholders EXACTLY as they appear\n\
- Preserve all line breaks exactly\n\
- Match the tone of the original (dialogue, lore, UI label, etc.)\n\
- Keep proper nouns untranslated unless you know the official localized version";

fn build_system(config: &ProviderConfig, source_lang: &str, target_lang: &str) -> String {
    config.system_prompt
        .as_deref()
        .unwrap_or(DEFAULT_SYSTEM_PROMPT)
        .replace("{source_lang}", source_lang)
        .replace("{target_lang}", target_lang)
}

// ── Ollama ────────────────────────────────────────────────────────────────────

#[derive(Serialize)]
struct OllamaMessage {
    role:    &'static str,
    content: String,
}

#[derive(Serialize)]
struct OllamaOptions {
    temperature: f32,
}

#[derive(Serialize)]
struct OllamaChatRequest {
    model:    String,
    messages: Vec<OllamaMessage>,
    stream:   bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    options:  Option<OllamaOptions>,
}

#[derive(Deserialize)]
struct OllamaChatResponse {
    message: OllamaChatMessage,
}

#[derive(Deserialize)]
struct OllamaChatMessage {
    content: String,
}

async fn ollama_translate(config: &ProviderConfig, system: &str, text: &str) -> Result<String, String> {
    let base  = config.endpoint.as_deref().unwrap_or("http://localhost:11434");
    let base  = base.trim_end_matches('/');
    let model = config.model.as_deref().unwrap_or("llama3").to_string();
    let temp  = config.temperature.unwrap_or(0.3);

    let body = OllamaChatRequest {
        model,
        messages: vec![
            OllamaMessage { role: "system", content: system.to_string() },
            OllamaMessage { role: "user",   content: text.to_string() },
        ],
        stream:  false,
        options: Some(OllamaOptions { temperature: temp }),
    };

    let resp = Client::new()
        .post(format!("{base}/api/chat"))
        .json(&body)
        .send().await
        .map_err(|e| format!("ai_network:{e}"))?;

    let status = resp.status().as_u16();
    if !resp.status().is_success() {
        return Err(match status {
            404 => "ollama_model_not_found".into(),
            503 => "ollama_not_running".into(),
            _   => format!("ollama_http:{status}"),
        });
    }

    let parsed: OllamaChatResponse = resp.json().await
        .map_err(|e| format!("ai_parse:{e}"))?;

    Ok(parsed.message.content.trim().to_string())
}

// ── Claude (Anthropic) ────────────────────────────────────────────────────────

#[derive(Serialize)]
struct ClaudeMessage {
    role:    &'static str,
    content: String,
}

#[derive(Serialize)]
struct ClaudeRequest {
    model:      String,
    max_tokens: u32,
    system:     String,
    messages:   Vec<ClaudeMessage>,
}

#[derive(Deserialize)]
struct ClaudeContent {
    #[serde(rename = "type")]
    kind: String,
    text: Option<String>,
}

#[derive(Deserialize)]
struct ClaudeResponse {
    content: Vec<ClaudeContent>,
}

async fn claude_translate(config: &ProviderConfig, system: &str, text: &str) -> Result<String, String> {
    let key  = config.api_key.as_deref().unwrap_or("").trim();
    if key.is_empty() { return Err("ai_claude_no_key".into()); }
    let model      = config.model.as_deref().unwrap_or("claude-haiku-4-5").to_string();
    let max_tokens = config.max_tokens.unwrap_or(1024);

    let body = ClaudeRequest {
        model,
        max_tokens,
        system: system.to_string(),
        messages: vec![ClaudeMessage { role: "user", content: text.to_string() }],
    };

    let resp = Client::new()
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send().await
        .map_err(|e| format!("ai_network:{e}"))?;

    let status = resp.status().as_u16();
    if !resp.status().is_success() {
        return Err(match status {
            401 => "ai_claude_invalid_key".into(),
            429 => "ai_claude_rate_limit".into(),
            529 => "ai_claude_overloaded".into(),
            _   => format!("ai_claude_http:{status}"),
        });
    }

    let parsed: ClaudeResponse = resp.json().await
        .map_err(|e| format!("ai_parse:{e}"))?;

    let result = parsed.content.into_iter()
        .find(|c| c.kind == "text")
        .and_then(|c| c.text)
        .ok_or_else(|| "ai_claude_empty".to_string())?;

    Ok(result.trim().to_string())
}

// ── Cohere ────────────────────────────────────────────────────────────────────

#[derive(Serialize)]
struct CohereMessage {
    role:    &'static str,
    content: String,
}

#[derive(Serialize)]
struct CohereRequest {
    model:    String,
    messages: Vec<CohereMessage>,
}

#[derive(Deserialize)]
struct CohereContent {
    #[serde(rename = "type")]
    kind: String,
    text: Option<String>,
}

#[derive(Deserialize)]
struct CohereRespMessage {
    content: Vec<CohereContent>,
}

#[derive(Deserialize)]
struct CohereResponse {
    message: CohereRespMessage,
}

async fn cohere_translate(config: &ProviderConfig, system: &str, text: &str) -> Result<String, String> {
    let key = config.api_key.as_deref().unwrap_or("").trim();
    if key.is_empty() { return Err("ai_cohere_no_key".into()); }
    let model = config.model.as_deref().unwrap_or("command-r-plus").to_string();

    let body = CohereRequest {
        model,
        messages: vec![
            CohereMessage { role: "system", content: system.to_string() },
            CohereMessage { role: "user",   content: text.to_string() },
        ],
    };

    let resp = Client::new()
        .post("https://api.cohere.ai/v2/chat")
        .header("Authorization", format!("Bearer {key}"))
        .header("content-type", "application/json")
        .json(&body)
        .send().await
        .map_err(|e| format!("ai_network:{e}"))?;

    let status = resp.status().as_u16();
    if !resp.status().is_success() {
        return Err(match status {
            401 => "ai_cohere_invalid_key".into(),
            429 => "ai_cohere_rate_limit".into(),
            _   => format!("ai_cohere_http:{status}"),
        });
    }

    let parsed: CohereResponse = resp.json().await
        .map_err(|e| format!("ai_parse:{e}"))?;

    let result = parsed.message.content.into_iter()
        .find(|c| c.kind == "text")
        .and_then(|c| c.text)
        .ok_or_else(|| "ai_cohere_empty".to_string())?;

    Ok(result.trim().to_string())
}

// ── OpenAI-compatible (custom_ai) ─────────────────────────────────────────────

#[derive(Serialize)]
struct OpenAIMessage {
    role:    &'static str,
    content: String,
}

#[derive(Serialize)]
struct OpenAIRequest {
    model:       String,
    messages:    Vec<OpenAIMessage>,
    temperature: f32,
    max_tokens:  u32,
}

#[derive(Deserialize)]
struct OpenAIRespMessage {
    content: String,
}

#[derive(Deserialize)]
struct OpenAIChoice {
    message: OpenAIRespMessage,
}

#[derive(Deserialize)]
struct OpenAIResponse {
    choices: Vec<OpenAIChoice>,
}

async fn openai_compat_translate(config: &ProviderConfig, system: &str, text: &str) -> Result<String, String> {
    let endpoint = config.endpoint.as_deref()
        .ok_or("ai_custom_no_endpoint")?;
    let endpoint = endpoint.trim_end_matches('/');
    let model      = config.model.as_deref().unwrap_or("gpt-4o-mini").to_string();
    let temp       = config.temperature.unwrap_or(0.3);
    let max_tokens = config.max_tokens.unwrap_or(1024);

    let body = OpenAIRequest {
        model,
        messages: vec![
            OpenAIMessage { role: "system", content: system.to_string() },
            OpenAIMessage { role: "user",   content: text.to_string() },
        ],
        temperature: temp,
        max_tokens,
    };

    let mut req = Client::new()
        .post(format!("{endpoint}/v1/chat/completions"))
        .header("content-type", "application/json");

    if let Some(key) = config.api_key.as_deref().filter(|k| !k.trim().is_empty()) {
        req = req.header("Authorization", format!("Bearer {key}"));
    }

    let resp = req.json(&body).send().await
        .map_err(|e| format!("ai_network:{e}"))?;

    let status = resp.status().as_u16();
    if !resp.status().is_success() {
        return Err(match status {
            401 => "ai_custom_invalid_key".into(),
            429 => "ai_custom_rate_limit".into(),
            _   => format!("ai_custom_http:{status}"),
        });
    }

    let parsed: OpenAIResponse = resp.json().await
        .map_err(|e| format!("ai_parse:{e}"))?;

    let result = parsed.choices.into_iter().next()
        .map(|c| c.message.content)
        .ok_or_else(|| "ai_custom_empty".to_string())?;

    Ok(result.trim().to_string())
}

// ── OpenAI (official) ────────────────────────────────────────────────────────

/// Translate via the official OpenAI Chat API (hardcoded endpoint).
async fn openai_translate(config: &ProviderConfig, system: &str, text: &str) -> Result<String, String> {
    let key = config.api_key.as_deref().unwrap_or("").trim();
    if key.is_empty() { return Err("ai_openai_no_key".into()); }

    let model      = config.model.as_deref().unwrap_or("gpt-4o-mini").to_string();
    let temp       = config.temperature.unwrap_or(0.3);
    let max_tokens = config.max_tokens.unwrap_or(1024);

    let body = OpenAIRequest {
        model,
        messages: vec![
            OpenAIMessage { role: "system", content: system.to_string() },
            OpenAIMessage { role: "user",   content: text.to_string() },
        ],
        temperature: temp,
        max_tokens,
    };

    let resp = Client::new()
        .post("https://api.openai.com/v1/chat/completions")
        .header("content-type", "application/json")
        .header("Authorization", format!("Bearer {key}"))
        .json(&body)
        .send().await
        .map_err(|e| format!("ai_network:{e}"))?;

    let status = resp.status().as_u16();
    if !resp.status().is_success() {
        return Err(match status {
            401 => "ai_openai_invalid_key".into(),
            429 => "ai_openai_rate_limit".into(),
            _   => format!("ai_openai_http:{status}"),
        });
    }

    let parsed: OpenAIResponse = resp.json().await
        .map_err(|e| format!("ai_parse:{e}"))?;

    let result = parsed.choices.into_iter().next()
        .map(|c| c.message.content)
        .ok_or_else(|| "ai_openai_empty".to_string())?;

    Ok(result.trim().to_string())
}

// ── Public translation API ────────────────────────────────────────────────────

/// Translate a single text via an AI/LLM provider.
/// Tag protection is applied automatically.
pub async fn translate_one(
    config:      &ProviderConfig,
    text:        &str,
    source_lang: Option<&str>,
    target_lang: &str,
) -> Result<String, String> {
    if text.trim().is_empty() { return Ok(String::new()); }

    let (protected, tag_list) = tags::protect_tags(text);
    let sl     = source_lang.unwrap_or("en");
    let system = build_system(config, sl, target_lang);

    let translated = match config.id.as_str() {
        "ollama"    => ollama_translate(config, &system, &protected).await?,
        "claude"    => claude_translate(config, &system, &protected).await?,
        "cohere"    => cohere_translate(config, &system, &protected).await?,
        "openai"    => openai_translate(config, &system, &protected).await?,
        // "custom_ai" (legacy built-in) + user-created custom AI providers (UUID ids):
        // all route through the OpenAI-compatible endpoint path.
        _           => openai_compat_translate(config, &system, &protected).await?,
    };

    Ok(tags::restore_tags(&translated, &tag_list))
}

/// Translate multiple texts sequentially (LLMs generally don't support true batching).
pub async fn translate_batch(
    config:      &ProviderConfig,
    texts:       &[String],
    source_lang: Option<&str>,
    target_lang: &str,
) -> Result<Vec<String>, String> {
    let mut results = Vec::with_capacity(texts.len());
    for text in texts {
        results.push(translate_one(config, text, source_lang, target_lang).await?);
    }
    Ok(results)
}

// ── Ollama model discovery & management ──────────────────────────────────────

#[derive(Deserialize)]
struct OllamaTagsResponse {
    models: Vec<OllamaModelInfo>,
}

#[derive(Deserialize)]
struct OllamaModelInfo {
    name: String,
}

/// Fetch the list of locally installed Ollama models via GET /api/tags.
pub async fn fetch_ollama_models(base_url: &str) -> Result<Vec<String>, String> {
    let base = base_url.trim_end_matches('/');
    let resp = Client::new()
        .get(format!("{base}/api/tags"))
        .send().await
        .map_err(|_| "ollama_not_running".to_string())?;

    if !resp.status().is_success() {
        return Err("ollama_not_running".into());
    }

    let parsed: OllamaTagsResponse = resp.json().await
        .map_err(|e| format!("ai_parse:{e}"))?;

    Ok(parsed.models.into_iter().map(|m| m.name).collect())
}

// ── Ollama model status ───────────────────────────────────────────────────────

#[derive(Deserialize)]
struct OllamaPsResponse {
    models: Vec<OllamaPsModel>,
}

#[derive(Deserialize)]
struct OllamaPsModel {
    name: String,
}

/// Response returned to the frontend for a model status check.
#[derive(Serialize)]
pub struct OllamaModelStatus {
    pub installed: bool,
    pub running:   bool,
}

/// True if `candidate` (from the API) matches `query` (from the UI).
/// Handles the ":latest" suffix that Ollama appends automatically.
fn model_name_matches(candidate: &str, query: &str) -> bool {
    let c = candidate.to_lowercase();
    let q = query.to_lowercase();
    let c_base = c.strip_suffix(":latest").unwrap_or(&c);
    let q_base = q.strip_suffix(":latest").unwrap_or(&q);
    c == q || c_base == q_base || c == q_base || c_base == q
}

/// Check whether a specific model is installed on disk and/or currently loaded
/// in VRAM.  Returns an error only when Ollama itself is unreachable.
pub async fn get_ollama_model_status(base_url: &str, model: &str) -> Result<OllamaModelStatus, String> {
    let base   = base_url.trim_end_matches('/');
    let client = Client::new();
    debug!("[ollama] checking status for model '{}' at {}", model, base);

    // ── Is the model installed? (GET /api/tags) ──────────────────────────────
    let tags_resp = client.get(format!("{base}/api/tags")).send().await
        .map_err(|_| "ollama_not_running".to_string())?;

    if !tags_resp.status().is_success() {
        warn!("[ollama] /api/tags returned non-200 — Ollama may not be running");
        return Err("ollama_not_running".into());
    }

    let tags: OllamaTagsResponse = tags_resp.json().await
        .map_err(|e| format!("ai_parse:{e}"))?;

    let installed = tags.models.iter().any(|m| model_name_matches(&m.name, model));

    // ── Is the model currently in VRAM? (GET /api/ps) ───────────────────────
    let running = match client.get(format!("{base}/api/ps")).send().await {
        Ok(ps_resp) if ps_resp.status().is_success() => {
            match ps_resp.json::<OllamaPsResponse>().await {
                Ok(ps) => ps.models.iter().any(|m| model_name_matches(&m.name, model)),
                Err(_) => false,
            }
        }
        _ => false, // /api/ps is non-critical
    };

    debug!("[ollama] model '{}': installed={}, running={}", model, installed, running);
    Ok(OllamaModelStatus { installed, running })
}

// ── Ollama pull / load / unload ───────────────────────────────────────────────

#[derive(Serialize)]
struct OllamaPullRequest {
    model:  String,
    stream: bool,
}

#[derive(Deserialize)]
struct OllamaPullStatus {
    #[allow(dead_code)]
    status: Option<String>,
    error:  Option<String>,
}

#[derive(Serialize)]
struct OllamaKeepAliveRequest {
    model:      String,
    keep_alive: i32,   // seconds; 0 = unload immediately
}

/// Download and install a model from Ollama's registry.
/// Uses a 2-hour timeout — large models (e.g. Mixtral 48 GB) can take a while.
///
/// NOTE: Ollama may return HTTP 200 with `{"error":"..."}` in the body when
/// a model is not found or the pull fails. We always parse the last JSON line
/// of the response to detect this case.
pub async fn pull_ollama_model(base_url: &str, model: &str) -> Result<(), String> {
    let base = base_url.trim_end_matches('/');
    info!("[ollama] starting pull for model '{}' from {}", model, base);

    let body = OllamaPullRequest { model: model.to_string(), stream: false };

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(7_200))
        .build()
        .map_err(|e| format!("ai_network:{e}"))?;

    let resp = client
        .post(format!("{base}/api/pull"))
        .json(&body)
        .send().await
        .map_err(|e| {
            error!("[ollama] pull request failed (network): {}", e);
            if e.is_connect() { "ollama_not_running".to_string() }
            else               { format!("ai_network:{e}") }
        })?;

    let http_code = resp.status().as_u16();
    let body_text = resp.text().await.unwrap_or_default();
    debug!("[ollama] pull response HTTP {} — body: {}", http_code, &body_text[..body_text.len().min(500)]);

    // With stream:false Ollama may return multiple JSON lines; inspect the last one
    let last_json = body_text
        .lines()
        .filter(|l| !l.trim().is_empty())
        .last()
        .unwrap_or("");

    // Always check body for an explicit error field (returned even on HTTP 200)
    if let Ok(parsed) = serde_json::from_str::<OllamaPullStatus>(last_json) {
        if let Some(err) = parsed.error {
            error!("[ollama] pull error for '{}': {}", model, err);
            let msg = if err.contains("file does not exist") || err.contains("not found") {
                format!("ollama_model_not_found:{model}")
            } else {
                format!("ollama_pull_failed:{err}")
            };
            return Err(msg);
        }
    }

    if http_code != 200 {
        error!("[ollama] pull returned HTTP {} for model '{}'", http_code, model);
        return Err(match http_code {
            404 => format!("ollama_model_not_found:{model}"),
            503 => "ollama_not_running".into(),
            _   => format!("ollama_pull_error:{http_code}"),
        });
    }

    info!("[ollama] pull succeeded for model '{}'", model);
    Ok(())
}

/// Pre-load a model into VRAM without running inference.
/// Ollama will keep it in memory for its default keep_alive duration (5 min).
pub async fn load_ollama_model(base_url: &str, model: &str) -> Result<(), String> {
    let base = base_url.trim_end_matches('/');
    info!("[ollama] loading model '{}' into VRAM", model);

    // Sending a /api/generate request with no prompt forces Ollama to load the
    // model into memory and return immediately.
    let body = serde_json::json!({ "model": model, "stream": false });

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(300)) // 5 min to load into VRAM
        .build()
        .map_err(|e| format!("ai_network:{e}"))?;

    let resp = client
        .post(format!("{base}/api/generate"))
        .json(&body)
        .send().await
        .map_err(|e| format!("ai_network:{e}"))?;

    if !resp.status().is_success() {
        let code = resp.status().as_u16();
        error!("[ollama] load returned HTTP {} for model '{}'", code, model);
        return Err(format!("ollama_load_error:{code}"));
    }

    info!("[ollama] model '{}' loaded into VRAM", model);
    Ok(())
}

/// Unload a model from VRAM by setting keep_alive to 0.
pub async fn unload_ollama_model(base_url: &str, model: &str) -> Result<(), String> {
    let base = base_url.trim_end_matches('/');
    info!("[ollama] unloading model '{}' from VRAM", model);
    let body = OllamaKeepAliveRequest { model: model.to_string(), keep_alive: 0 };

    // Fire-and-forget; ignore response errors (the model may already be unloaded)
    let _ = Client::new()
        .post(format!("{base}/api/generate"))
        .json(&body)
        .send().await;

    debug!("[ollama] unload request sent for '{}'", model);
    Ok(())
}

/// Delete a model from disk (ollama rm).
/// Calls DELETE /api/delete.  Unload from VRAM first if needed.
pub async fn delete_ollama_model(base_url: &str, model: &str) -> Result<(), String> {
    let base = base_url.trim_end_matches('/');
    info!("[ollama] deleting model '{}' from disk", model);

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .delete(format!("{base}/api/delete"))
        .json(&serde_json::json!({ "model": model }))
        .send()
        .await
        .map_err(|e| {
            error!("[ollama] delete_model connect error for '{}': {}", model, e);
            "ollama_not_running".to_string()
        })?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body   = resp.text().await.unwrap_or_default();
        error!("[ollama] delete_model HTTP {} for '{}': {}", status, model, body);
        return Err(format!("ollama_delete_failed:{body}"));
    }

    info!("[ollama] model '{}' deleted from disk", model);
    Ok(())
}
