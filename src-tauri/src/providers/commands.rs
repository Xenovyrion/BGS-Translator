use tauri::AppHandle;
use super::{ai, launcher, ProviderConfig, ProviderMeta, all_providers, dispatch_one, dispatch_batch};

// ── Catalog ───────────────────────────────────────────────────────────────────

/// Return the list of all built-in providers (for the frontend settings UI).
#[tauri::command]
pub async fn get_providers_cmd() -> Vec<ProviderMeta> {
    all_providers()
}

// ── Translation ───────────────────────────────────────────────────────────────

/// Translate a single text with the given provider config.
#[tauri::command]
pub async fn translate_one_cmd(
    config:      ProviderConfig,
    text:        String,
    source_lang: Option<String>,
    target_lang: String,
) -> Result<String, String> {
    dispatch_one(
        &config,
        &text,
        source_lang.as_deref(),
        &target_lang,
    ).await
}

/// Translate multiple texts with the given provider config.
/// Non-batch providers fall back to sequential individual calls automatically.
#[tauri::command]
pub async fn translate_batch_cmd(
    config:      ProviderConfig,
    texts:       Vec<String>,
    source_lang: Option<String>,
    target_lang: String,
) -> Result<Vec<String>, String> {
    dispatch_batch(
        &config,
        &texts,
        source_lang.as_deref(),
        &target_lang,
    ).await
}

// ── AI — Ollama model management ─────────────────────────────────────────────

/// Fetch the list of models installed in the local Ollama server.
#[tauri::command]
pub async fn fetch_ollama_models_cmd(base_url: String) -> Result<Vec<String>, String> {
    ai::fetch_ollama_models(&base_url).await
}

/// Check whether a specific model is installed on disk and/or loaded in VRAM.
#[tauri::command]
pub async fn get_ollama_model_status_cmd(
    base_url: String,
    model:    String,
) -> Result<ai::OllamaModelStatus, String> {
    ai::get_ollama_model_status(&base_url, &model).await
}

/// Download + install a model from Ollama's registry (ollama pull).
/// Can take several minutes for large models — the frontend should show a spinner.
#[tauri::command]
pub async fn pull_ollama_model_cmd(base_url: String, model: String) -> Result<(), String> {
    ai::pull_ollama_model(&base_url, &model).await
}

/// Pre-load a model into VRAM without running inference.
#[tauri::command]
pub async fn load_ollama_model_cmd(base_url: String, model: String) -> Result<(), String> {
    ai::load_ollama_model(&base_url, &model).await
}

/// Unload a model from VRAM (keep_alive = 0).
#[tauri::command]
pub async fn unload_ollama_model_cmd(base_url: String, model: String) -> Result<(), String> {
    ai::unload_ollama_model(&base_url, &model).await
}

/// Delete a model from disk (ollama rm).
#[tauri::command]
pub async fn delete_ollama_model_cmd(base_url: String, model: String) -> Result<(), String> {
    ai::delete_ollama_model(&base_url, &model).await
}

// ── Browser launcher ──────────────────────────────────────────────────────────

/// Open the system browser on a translation service with the text pre-filled.
///
/// `config.id` identifies the service ("launcher_deepl", "launcher_google",
/// "launcher_bing", or a custom launcher whose URL template is `config.endpoint`).
///
/// Returns `{ opened: true, text_in_url: true }` if the text fit in the URL,
/// or `{ opened: true, text_in_url: false }` when the text was too long —
/// the frontend should copy the text to the clipboard and inform the user.
#[tauri::command]
pub async fn open_browser_translator_cmd(
    app:         AppHandle,
    config:      ProviderConfig,
    text:        String,
    source_lang: String,
    target_lang: String,
) -> Result<launcher::LaunchResult, String> {
    launcher::open(
        &app,
        &config.id,
        &text,
        &source_lang,
        &target_lang,
        config.endpoint.as_deref(),
    )
}
