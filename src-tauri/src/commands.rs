use serde::Serialize;
use tauri::Emitter;

use crate::parser::open_file;
use crate::translation::{
    entry::TranslationEntry,
    session::{
        save_session_auto, list_sessions_all, load_session_by_id, delete_session_by_id,
        SessionListItem, TranslationSession,
    },
    writer::write_translated_plugin,
};

/// Metadata returned synchronously by open_plugin_cmd.
/// The entries themselves are streamed via "plugin:chunk" / "plugin:done" events.
#[derive(Serialize)]
pub struct PluginMetadata {
    pub plugin_name:  String,
    pub author:       String,
    pub description:  String,
    pub masters:      Vec<String>,
    pub is_localized: bool,
    pub entry_count:  usize,
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn open_plugin_cmd(
    path: String,
    window: tauri::WebviewWindow,
) -> Result<PluginMetadata, String> {
    log::info!("[cmd] open_plugin: {}", path);
    let loaded = open_file(std::path::Path::new(&path)).map_err(|e| {
        log::error!("[cmd] open_plugin failed: {}", e);
        e.to_string()
    })?;

    let entry_count = loaded.entries.len();
    log::debug!("[cmd] open_plugin: streaming {} entries in chunks of 200", entry_count);

    for chunk in loaded.entries.chunks(200) {
        window.emit("plugin:chunk", chunk).map_err(|e| e.to_string())?;
    }
    window.emit("plugin:done", entry_count).map_err(|e| e.to_string())?;

    Ok(PluginMetadata {
        plugin_name:  loaded.path.file_stem().and_then(|s| s.to_str()).unwrap_or("unknown").to_owned(),
        author:       loaded.info.author,
        description:  loaded.info.description,
        masters:      loaded.info.masters,
        is_localized: loaded.info.is_localized,
        entry_count,
    })
}

#[tauri::command]
pub async fn save_session_cmd(
    session: TranslationSession,
    app: tauri::AppHandle,
) -> Result<String, String> {
    log::info!("[cmd] save_session: {} ({} entries)", session.plugin_name, session.entries.len());
    let id = save_session_auto(&session, &app).map_err(|e| {
        log::error!("[cmd] save_session failed: {}", e);
        e
    })?;
    log::debug!("[cmd] session saved as '{}'", id);
    Ok(id)
}

#[tauri::command]
pub async fn list_sessions_cmd(app: tauri::AppHandle) -> Result<Vec<SessionListItem>, String> {
    log::debug!("[cmd] list_sessions");
    list_sessions_all(&app)
}

#[tauri::command]
pub async fn load_session_cmd(
    id: String,
    app: tauri::AppHandle,
) -> Result<TranslationSession, String> {
    log::info!("[cmd] load_session: {}", id);
    let result = load_session_by_id(&id, &app);
    match &result {
        Ok(s)  => log::info!("[cmd] session loaded: {} ({} entries)", s.plugin_name, s.entries.len()),
        Err(e) => log::error!("[cmd] load_session failed: {}", e),
    }
    result
}

#[tauri::command]
pub async fn delete_session_cmd(
    id: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    log::info!("[cmd] delete_session: {}", id);
    delete_session_by_id(&id, &app)
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
