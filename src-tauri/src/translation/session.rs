use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use crate::parser::PluginInfo;
use crate::translation::entry::TranslationEntry;

/// A translation session = an open plugin with all its entries.
/// Serializable for backup/restore (.json).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranslationSession {
    /// Absolute path to the source plugin (.esp/.esm).
    pub plugin_path: PathBuf,
    /// Plugin name (without the file extension).
    pub plugin_name: String,
    /// Plugin metadata (author, masters, etc.).
    pub plugin_info: PluginInfo,
    /// All translation entries have been extracted.
    pub entries: Vec<TranslationEntry>,
    /// Target language of the translation (e.g., “fr”, “de”).
    pub target_language: String,
}

impl TranslationSession {
    pub fn new(
        plugin_path: PathBuf,
        plugin_info: PluginInfo,
        entries: Vec<TranslationEntry>,
        target_language: String,
    ) -> Self {
        let plugin_name = plugin_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown")
            .to_owned();

        TranslationSession { plugin_path, plugin_name, plugin_info, entries, target_language }
    }

    pub fn total(&self) -> usize {
        self.entries.len()
    }

    pub fn translated_count(&self) -> usize {
        self.entries.iter().filter(|e| e.status == crate::translation::entry::EntryStatus::Validated).count()
    }

    pub fn progress_percent(&self) -> f32 {
        if self.entries.is_empty() {
            return 100.0;
        }
        self.translated_count() as f32 / self.entries.len() as f32 * 100.0
    }

    pub fn update_translation(&mut self, form_id: u32, sub_type: &str, translated: String) {
        for entry in &mut self.entries {
            if entry.form_id == form_id && entry.sub_type == sub_type {
                entry.translated = translated;
                return;
            }
        }
    }
}

const SESSION_MAGIC: &[u8; 4] = b"BGTS";
const SESSION_VERSION: u8 = 1;

/// Saves a session in compressed binary format (.bgts = bincode + zstd).
pub fn save_session(session: &TranslationSession, path: &std::path::Path) -> Result<(), String> {
    use std::io::Write;
    let encoded    = bincode::serialize(session).map_err(|e| e.to_string())?;
    let compressed = zstd::encode_all(encoded.as_slice(), 3).map_err(|e| e.to_string())?;
    let mut file   = std::fs::File::create(path).map_err(|e| e.to_string())?;
    file.write_all(SESSION_MAGIC).map_err(|e| e.to_string())?;
    file.write_all(&[SESSION_VERSION]).map_err(|e| e.to_string())?;
    file.write_all(&compressed).map_err(|e| e.to_string())
}

/// Loads a session. Supports the new binary format (.bgts) and the old JSON format (.json).
pub fn load_session(path: &std::path::Path) -> Result<TranslationSession, String> {
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;

    // New binary format: BGTS magic header
    if bytes.len() >= 5 && &bytes[..4] == SESSION_MAGIC {
        let decompressed = zstd::decode_all(&bytes[5..]).map_err(|e| e.to_string())?;
        return bincode::deserialize(&decompressed).map_err(|e| e.to_string());
    }

    // Legacy: plain JSON
    let json = std::str::from_utf8(&bytes).map_err(|e| e.to_string())?;
    serde_json::from_str(json).map_err(|e| e.to_string())
}
