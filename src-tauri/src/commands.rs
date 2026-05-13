use serde::Serialize;

use crate::parser::open_file;
use crate::translation::{
    entry::TranslationEntry,
    session::{load_session, save_session, TranslationSession},
    writer::write_translated_plugin,
};

#[derive(Serialize)]
pub struct PluginLoadResult {
    pub plugin_name:  String,
    pub author:       String,
    pub description:  String,
    pub masters:      Vec<String>,
    pub is_localized: bool,
    pub entry_count:  usize,
    pub entries:      Vec<TranslationEntry>,
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn open_plugin_cmd(path: String) -> Result<PluginLoadResult, String> {
    log::info!("[cmd] open_plugin: {}", path);
    let loaded = open_file(std::path::Path::new(&path)).map_err(|e| {
        log::error!("[cmd] open_plugin failed: {}", e);
        e.to_string()
    })?;

    Ok(PluginLoadResult {
        plugin_name:  loaded.path.file_stem().and_then(|s| s.to_str()).unwrap_or("unknown").to_owned(),
        author:       loaded.info.author,
        description:  loaded.info.description,
        masters:      loaded.info.masters,
        is_localized: loaded.info.is_localized,
        entry_count:  loaded.entries.len(),
        entries:      loaded.entries,
    })
}

#[tauri::command]
pub async fn save_session_cmd(session: TranslationSession, path: String) -> Result<(), String> {
    log::info!("[cmd] save_session: {} ({} entries)", path, session.entries.len());
    let result = save_session(&session, std::path::Path::new(&path));
    if result.is_ok() {
        log::debug!("[cmd] session saved successfully");
    } else {
        log::error!("[cmd] save_session failed: {:?}", result);
    }
    result
}

#[tauri::command]
pub async fn load_session_cmd(path: String) -> Result<TranslationSession, String> {
    log::info!("[cmd] load_session: {}", path);
    let result = load_session(std::path::Path::new(&path));
    match &result {
        Ok(s) => log::info!("[cmd] session loaded: {} ({} entries)", s.plugin_name, s.entries.len()),
        Err(e) => log::error!("[cmd] load_session failed: {}", e),
    }
    result
}

#[tauri::command]
pub async fn export_plugin_cmd(
    source_path: String,
    output_path: String,
    entries: Vec<TranslationEntry>,
) -> Result<(), String> {
    let validated = entries.iter().filter(|e| e.status == crate::translation::entry::EntryStatus::Validated).count();
    log::info!("[cmd] export_plugin: {} ({} validated entries)", output_path, validated);
    let result = write_translated_plugin(
        std::path::Path::new(&source_path),
        std::path::Path::new(&output_path),
        &entries,
    );
    if result.is_ok() {
        log::info!("[cmd] export_plugin completed successfully");
    } else {
        log::error!("[cmd] export_plugin failed: {:?}", result);
    }
    result
}
