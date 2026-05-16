use tauri::AppHandle;
use super::{launcher, ProviderConfig, ProviderMeta, all_providers, dispatch_one, dispatch_batch};

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

// ── Browser launcher ──────────────────────────────────────────────────────────

/// Open the system browser on a translation service with the text pre-filled.
///
/// Returns `{ opened: true, text_in_url: true }` if the text fit in the URL,
/// or `{ opened: true, text_in_url: false }` when the text was too long —
/// the frontend should copy the text to the clipboard and inform the user.
#[tauri::command]
pub async fn open_browser_translator_cmd(
    app:         AppHandle,
    service:     String,
    text:        String,
    source_lang: String,
    target_lang: String,
) -> Result<launcher::LaunchResult, String> {
    launcher::open(&app, &service, &text, &source_lang, &target_lang)
}
