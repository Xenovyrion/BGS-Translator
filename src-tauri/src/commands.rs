use serde::Serialize;
use tauri::{Emitter, Manager};

use crate::formats;
use crate::database::{format::save_bgt, store::TranslationDb, types::DbEntry};
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
    pub plugin_path:  String,
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
        plugin_path:  loaded.path.to_string_lossy().into_owned(),
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

/// Opens a reference plugin and returns its entries so the frontend can
/// compare them with the currently-open plugin and import translations.
/// Unlike open_plugin_cmd, this is synchronous (no streaming) and intended
/// for secondary "reference" files, not the main plugin.
#[tauri::command]
pub async fn import_translations_from_plugin_cmd(
    reference_path: String,
) -> Result<Vec<TranslationEntry>, String> {
    log::info!("[cmd] import_translations_from: {}", reference_path);
    let loaded = open_file(std::path::Path::new(&reference_path)).map_err(|e| {
        log::error!("[cmd] import_translations_from failed: {}", e);
        e.to_string()
    })?;
    log::info!("[cmd] import_translations_from: {} entries loaded from reference", loaded.entries.len());
    Ok(loaded.entries)
}

/// Creates a directory (and all parents) from the frontend.
/// Uses the Rust logger so errors appear in the log file.
#[tauri::command]
pub async fn ensure_dir_cmd(path: String) -> Result<(), String> {
    log::info!("[cmd] ensure_dir: {}", path);
    std::fs::create_dir_all(&path).map_err(|e| {
        let msg = format!("Cannot create directory '{}': {}", path, e);
        log::error!("[cmd] {}", msg);
        msg
    })
}

#[tauri::command]
pub async fn export_plugin_cmd(
    source_path: String,
    output_path: String,
    entries: Vec<TranslationEntry>,
) -> Result<(), String> {
    let total     = entries.len();
    let validated = entries.iter().filter(|e| e.status == crate::translation::entry::EntryStatus::Validated).count();
    log::info!("[cmd] export_plugin: {} ({} / {} validated entries)", output_path, validated, total);
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

/// Auto-detect format from file extension / content and return imported entries
/// for session use (text-based matching on the frontend).
///
/// - .xml → peek content for "SSTXMLRessources" → xtranslator_xml, else esptranslator_xml
/// - .csv / .tsv → session_csv
#[tauri::command]
pub async fn import_format_cmd(path: String) -> Result<Vec<formats::ImportedEntry>, String> {
    log::info!("[cmd] import_format: {}", path);
    let p = std::path::Path::new(&path);
    let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();

    let result = match ext.as_str() {
        "xml" => {
            // Peek first 512 bytes to decide between xtranslator and esptranslator formats
            let snippet = std::fs::read_to_string(p)
                .map(|s| s.chars().take(512).collect::<String>())
                .unwrap_or_default();
            if snippet.contains("SSTXMLRessources") {
                formats::xtranslator_xml::import(p)
            } else {
                formats::esptranslator_xml::import(p)
            }
        }
        "csv" | "tsv" => formats::session_csv::import(p),
        _ => Err(format!("Unsupported format for import: .{}", ext)),
    };

    match &result {
        Ok(entries) => log::info!("[cmd] import_format: {} entries loaded", entries.len()),
        Err(e)      => log::error!("[cmd] import_format failed: {}", e),
    }
    result
}

/// Export session entries as xTranslator XML.
#[tauri::command]
pub async fn export_xtranslator_xml_cmd(
    path:        String,
    entries:     Vec<TranslationEntry>,
    plugin_name: String,
    source_lang: String,
    dest_lang:   String,
) -> Result<usize, String> {
    log::info!("[cmd] export_xtranslator_xml: {} ({} entries)", path, entries.len());
    let count = formats::xtranslator_xml::export(
        std::path::Path::new(&path),
        &entries,
        &plugin_name,
        &source_lang,
        &dest_lang,
    )?;
    log::info!("[cmd] export_xtranslator_xml: {} entries written", count);
    Ok(count)
}

/// Export session entries as ESP-ESM Translator XML.
#[tauri::command]
pub async fn export_esptranslator_xml_cmd(
    path:        String,
    entries:     Vec<TranslationEntry>,
    plugin_name: String,
) -> Result<usize, String> {
    log::info!("[cmd] export_esptranslator_xml: {} ({} entries)", path, entries.len());
    let count = formats::esptranslator_xml::export(
        std::path::Path::new(&path),
        &entries,
        &plugin_name,
    )?;
    log::info!("[cmd] export_esptranslator_xml: {} entries written", count);
    Ok(count)
}

/// Export session entries as CSV.
#[tauri::command]
pub async fn export_session_csv_cmd(
    path:    String,
    entries: Vec<TranslationEntry>,
) -> Result<usize, String> {
    log::info!("[cmd] export_session_csv: {} ({} entries)", path, entries.len());
    let count = formats::session_csv::export(std::path::Path::new(&path), &entries)?;
    log::info!("[cmd] export_session_csv: {} entries written", count);
    Ok(count)
}

/// Convert any supported external format to a .bgt database file.
///
/// Supported sources: .xml (auto-detected), .csv, .tsv, .eet
#[tauri::command]
pub async fn convert_to_bgt_cmd(
    source_path: String,
    output_path: String,
    db_name:     String,
    game:        String,
    lang_from:   String,
    lang_to:     String,
    read_only:   bool,
) -> Result<usize, String> {
    log::info!("[cmd] convert_to_bgt: {} → {}", source_path, output_path);
    let src = std::path::Path::new(&source_path);
    let dst = std::path::Path::new(&output_path);

    let ext = src.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();

    let db_entries: Vec<DbEntry> = match ext.as_str() {
        "xml" => {
            let snippet = std::fs::read_to_string(src)
                .map(|s| s.chars().take(512).collect::<String>())
                .unwrap_or_default();
            let imported = if snippet.contains("SSTXMLRessources") {
                formats::xtranslator_xml::import(src)?
            } else {
                formats::esptranslator_xml::import(src)?
            };
            imported.into_iter().map(|e| DbEntry {
                original:    e.original,
                translated:  e.translated,
                record_type: e.record_type,
                sub_type:    e.sub_type,
                editor_id:   e.editor_id,
            }).collect()
        }
        "csv" | "tsv" => {
            let imported = formats::session_csv::import(src)?;
            imported.into_iter().map(|e| DbEntry {
                original:    e.original,
                translated:  e.translated,
                record_type: e.record_type,
                sub_type:    e.sub_type,
                editor_id:   e.editor_id,
            }).collect()
        }
        "eet" => {
            let (_game_name, entries) = crate::database::format::load_eet(src)?;
            entries
        }
        _ => return Err(format!("Unsupported format for conversion: .{}", ext)),
    };

    let count = db_entries.len();
    let db = TranslationDb::from_entries(db_name, game, lang_from, lang_to, read_only, db_entries);

    if let Some(parent) = dst.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    save_bgt(&db, dst)?;

    log::info!("[cmd] convert_to_bgt: {} entries saved to '{}'", count, output_path);
    Ok(count)
}

// ── Log file helpers ──────────────────────────────────────────────────────────

fn open_with_os(path: &std::path::Path) -> Result<(), String> {
    let path_str = path.to_string_lossy().into_owned();
    #[cfg(windows)]
    {
        // powershell Start-Process is more reliable than cmd /c start for paths with special chars
        std::process::Command::new("powershell")
            .args(["-WindowStyle", "Hidden", "-Command",
                   &format!("Start-Process '{}'", path_str.replace('\'', "''"))])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open").arg(path).spawn().map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open").arg(path).spawn().map_err(|e| e.to_string())?;
    }
    let _ = path_str; // suppress unused warning on non-windows builds
    Ok(())
}

fn open_dir_in_explorer(dir: &std::path::Path) -> Result<(), String> {
    #[cfg(windows)]
    {
        std::process::Command::new("explorer")
            .arg(dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open").arg(dir).spawn().map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open").arg(dir).spawn().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Returns the canonical path of the log file used by this app instance.
#[tauri::command]
pub async fn get_log_path_cmd(app: tauri::AppHandle) -> Result<String, String> {
    let dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("bgstranslator.log").to_string_lossy().into_owned())
}

/// Opens the log file in the OS default text editor.
#[tauri::command]
pub async fn open_log_file_cmd(app: tauri::AppHandle) -> Result<(), String> {
    let log_file = app.path().app_log_dir()
        .map_err(|e| e.to_string())?
        .join("bgstranslator.log");
    open_with_os(&log_file)
}

/// Opens the log directory in the file manager.
#[tauri::command]
pub async fn open_log_dir_cmd(app: tauri::AppHandle) -> Result<(), String> {
    let dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
    open_dir_in_explorer(&dir)
}
