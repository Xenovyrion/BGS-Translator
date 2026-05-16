pub mod commands;
pub mod custom;
pub mod deepl;
pub mod launcher;
pub mod libretranslate;
pub mod microsoft;
pub mod mymemory;
pub(crate) mod tags;

use serde::{Deserialize, Serialize};

// ── Provider metadata (sent to frontend) ─────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ProviderKind {
    OfficialApi,
    FreeApi,
    BrowserLauncher,
    Custom,
}

#[derive(Serialize, Clone, Debug)]
pub struct ProviderMeta {
    pub id:             String,
    pub name:           String,
    pub kind:           ProviderKind,
    pub requires_key:   bool,
    /// Whether it can translate multiple texts in one round-trip.
    pub supports_batch: bool,
    /// Whether it opens a browser instead of returning translated text.
    pub is_launcher:    bool,
}

// ── Provider config (sent from frontend on each call) ────────────────────────

/// All fields a provider might need.  Each provider only reads what it uses.
/// Fields are deserialized from camelCase JS objects (Tauri → serde).
#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ProviderConfig {
    /// Provider ID: "deepl" | "microsoft" | "libretranslate" | "mymemory"
    ///              | "launcher_deepl" | "launcher_google" | "launcher_bing"
    ///              | "custom"
    pub id: String,

    pub api_key: Option<String>,

    /// Provider-specific variant:
    ///   DeepL      → "free" | "pro"
    ///   Microsoft  → Azure region code (e.g. "francecentral") — optional
    pub variant: Option<String>,

    /// Custom base URL (LibreTranslate self-hosted, custom REST endpoint).
    pub endpoint: Option<String>,

    // ── Custom provider template fields ──────────────────────────────────────
    /// Header template, e.g. "Authorization: Bearer {api_key}"
    pub auth_header: Option<String>,
    /// JSON body template with {text}, {from}, {to}, {api_key} placeholders.
    pub request_template: Option<String>,
    /// Dot/bracket path into the JSON response, e.g. "translations[0].text"
    pub response_path: Option<String>,
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

/// Translate a single text using the configured provider.
pub async fn dispatch_one(
    config:      &ProviderConfig,
    text:        &str,
    source_lang: Option<&str>,
    target_lang: &str,
) -> Result<String, String> {
    if text.trim().is_empty() { return Ok(String::new()); }
    match config.id.as_str() {
        "deepl"          => deepl::translate_one(config, text, source_lang, target_lang).await,
        "microsoft"      => microsoft::translate_one(config, text, source_lang, target_lang).await,
        "libretranslate" => libretranslate::translate_one(config, text, source_lang, target_lang).await,
        "mymemory"       => mymemory::translate_one(config, text, source_lang, target_lang).await,
        "custom"         => custom::translate_one(config, text, source_lang, target_lang).await,
        id               => Err(format!("provider_unknown:{id}")),
    }
}

/// Translate multiple texts using the configured provider.
/// Non-batch providers fall back to sequential individual calls.
pub async fn dispatch_batch(
    config:      &ProviderConfig,
    texts:       &[String],
    source_lang: Option<&str>,
    target_lang: &str,
) -> Result<Vec<String>, String> {
    if texts.is_empty() { return Ok(Vec::new()); }
    match config.id.as_str() {
        "deepl"          => deepl::translate_batch(config, texts, source_lang, target_lang).await,
        "microsoft"      => microsoft::translate_batch(config, texts, source_lang, target_lang).await,
        "libretranslate" => sequential_batch(config, texts, source_lang, target_lang).await,
        "mymemory"       => sequential_batch(config, texts, source_lang, target_lang).await,
        "custom"         => sequential_batch(config, texts, source_lang, target_lang).await,
        id               => Err(format!("provider_unknown:{id}")),
    }
}

/// Fallback: translate each text individually (for providers without batch API).
async fn sequential_batch(
    config:      &ProviderConfig,
    texts:       &[String],
    source_lang: Option<&str>,
    target_lang: &str,
) -> Result<Vec<String>, String> {
    let mut results = Vec::with_capacity(texts.len());
    for text in texts {
        results.push(dispatch_one(config, text, source_lang, target_lang).await?);
    }
    Ok(results)
}

// ── Built-in provider catalog ─────────────────────────────────────────────────

pub fn all_providers() -> Vec<ProviderMeta> {
    vec![
        ProviderMeta {
            id: "deepl".into(), name: "DeepL".into(),
            kind: ProviderKind::OfficialApi,
            requires_key: true, supports_batch: true, is_launcher: false,
        },
        ProviderMeta {
            id: "microsoft".into(), name: "Microsoft Translator".into(),
            kind: ProviderKind::OfficialApi,
            requires_key: true, supports_batch: true, is_launcher: false,
        },
        ProviderMeta {
            id: "libretranslate".into(), name: "LibreTranslate".into(),
            kind: ProviderKind::FreeApi,
            requires_key: false, supports_batch: false, is_launcher: false,
        },
        ProviderMeta {
            id: "mymemory".into(), name: "MyMemory".into(),
            kind: ProviderKind::FreeApi,
            requires_key: false, supports_batch: false, is_launcher: false,
        },
        ProviderMeta {
            id: "launcher_deepl".into(), name: "DeepL Web".into(),
            kind: ProviderKind::BrowserLauncher,
            requires_key: false, supports_batch: false, is_launcher: true,
        },
        ProviderMeta {
            id: "launcher_google".into(), name: "Google Translate".into(),
            kind: ProviderKind::BrowserLauncher,
            requires_key: false, supports_batch: false, is_launcher: true,
        },
        ProviderMeta {
            id: "launcher_bing".into(), name: "Bing Translator".into(),
            kind: ProviderKind::BrowserLauncher,
            requires_key: false, supports_batch: false, is_launcher: true,
        },
        ProviderMeta {
            id: "custom".into(), name: "Custom API".into(),
            kind: ProviderKind::Custom,
            requires_key: false, supports_batch: false, is_launcher: false,
        },
    ]
}
