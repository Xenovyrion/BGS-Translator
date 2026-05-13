use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use tauri::Manager;
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

const SESSION_MAGIC:   &[u8; 4] = b"BGTS";
const SESSION_VERSION: u8       = 2; // v1 = bincode (broken with tagged enums), v2 = JSON + zstd

/// Saves a session as JSON compressed with zstd (.bgts v2).
pub fn save_session(session: &TranslationSession, path: &std::path::Path) -> Result<(), String> {
    use std::io::Write;
    let json       = serde_json::to_string(session).map_err(|e| e.to_string())?;
    let compressed = zstd::encode_all(json.as_bytes(), 3).map_err(|e| e.to_string())?;
    let mut file   = std::fs::File::create(path).map_err(|e| e.to_string())?;
    file.write_all(SESSION_MAGIC).map_err(|e| e.to_string())?;
    file.write_all(&[SESSION_VERSION]).map_err(|e| e.to_string())?;
    file.write_all(&compressed).map_err(|e| e.to_string())
}

/// Loads a session. Supports v2 (JSON+zstd) and legacy plain-JSON files.
/// v1 (bincode) files are rejected with a clear message.
pub fn load_session(path: &std::path::Path) -> Result<TranslationSession, String> {
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;

    if bytes.len() >= 5 && &bytes[..4] == SESSION_MAGIC {
        match bytes[4] {
            2 => {
                let decompressed = zstd::decode_all(&bytes[5..]).map_err(|e| e.to_string())?;
                let json = std::str::from_utf8(&decompressed).map_err(|e| e.to_string())?;
                return serde_json::from_str(json).map_err(|e| e.to_string());
            }
            v => return Err(format!(
                "Session format v{v} is not supported (old bincode format). \
                 Please delete this file and re-save from a plugin."
            )),
        }
    }

    // Legacy: plain JSON (pre-magic old format)
    let json = std::str::from_utf8(&bytes).map_err(|e| e.to_string())?;
    serde_json::from_str(json).map_err(|e| e.to_string())
}

// ── Managed session store ─────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct SessionListItem {
    pub id:               String,
    pub plugin_name:      String,
    pub plugin_path:      String,
    pub entry_count:      usize,
    pub translated_count: usize,
    pub progress_percent: f32,
    pub saved_at:         String,  // ISO 8601
}

fn get_sessions_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir()
        .map_err(|e| e.to_string())?
        .join("sessions");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn sanitize_plugin_name(name: &str) -> String {
    name.chars()
        .map(|c| if c.is_alphanumeric() || c == '-' { c } else { '_' })
        .collect()
}

/// Saves the session to the managed sessions directory.
/// Returns the session ID (file stem without extension).
pub fn save_session_auto(
    session: &TranslationSession,
    app: &tauri::AppHandle,
) -> Result<String, String> {
    let dir       = get_sessions_dir(app)?;
    let safe_name = sanitize_plugin_name(&session.plugin_name);
    let now       = chrono::Local::now();
    // Double-underscore separates the name from the timestamp for reliable parsing.
    let id        = format!("{}__{}", safe_name, now.format("%Y%m%d_%H%M%S"));
    let path      = dir.join(format!("{}.bgts", id));
    save_session(session, &path)?;
    Ok(id)
}

/// Lists all sessions in the managed directory, sorted by most recent first.
pub fn list_sessions_all(app: &tauri::AppHandle) -> Result<Vec<SessionListItem>, String> {
    let dir = get_sessions_dir(app)?;
    let mut items = Vec::new();

    let rd = std::fs::read_dir(&dir).map_err(|e| e.to_string())?;
    for dir_entry in rd.flatten() {
        let path = dir_entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("bgts") {
            continue;
        }

        // Use file modification time as saved_at (set by OS on creation/write).
        let saved_at = dir_entry.metadata()
            .ok()
            .and_then(|m| m.modified().ok())
            .map(|t| {
                let dt: chrono::DateTime<chrono::Local> = t.into();
                dt.to_rfc3339()
            })
            .unwrap_or_default();

        match load_session(&path) {
            Ok(session) => {
                let id = path.file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("")
                    .to_owned();
                items.push(SessionListItem {
                    id,
                    plugin_name:      session.plugin_name.clone(),
                    plugin_path:      session.plugin_path.to_string_lossy().to_string(),
                    entry_count:      session.entries.len(),
                    translated_count: session.translated_count(),
                    progress_percent: session.progress_percent(),
                    saved_at,
                });
            }
            Err(e) => log::warn!("[session] Skipping unreadable session {:?}: {}", path, e),
        }
    }

    // Sort descending: most recently modified first.
    items.sort_by(|a, b| b.saved_at.cmp(&a.saved_at));
    Ok(items)
}

pub fn load_session_by_id(id: &str, app: &tauri::AppHandle) -> Result<TranslationSession, String> {
    let path = get_sessions_dir(app)?.join(format!("{}.bgts", id));
    load_session(&path)
}

pub fn delete_session_by_id(id: &str, app: &tauri::AppHandle) -> Result<(), String> {
    let path = get_sessions_dir(app)?.join(format!("{}.bgts", id));
    std::fs::remove_file(&path).map_err(|e| e.to_string())
}
