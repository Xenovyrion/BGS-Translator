use serde::Serialize;
use tauri::{Emitter, Manager};
use tauri_plugin_opener::OpenerExt;

use crate::formats;
use crate::parser::open_file;
use crate::translation::{
    entry::TranslationEntry,
    session::{
        save_session_auto, list_sessions_all, load_session_by_id, delete_session_by_id,
        SessionListItem, TranslationSession,
    },
    writer::write_translated_plugin,
};

/// Metadata returned synchronously by open_plugin_cmd / open_strings_file_cmd.
/// The entries themselves are streamed via "plugin:chunk" / "plugin:done" events.
#[derive(Serialize)]
pub struct PluginMetadata {
    pub plugin_name:     String,
    pub plugin_path:     String,
    pub author:          String,
    pub description:     String,
    pub masters:         Vec<String>,
    pub is_localized:    bool,
    /// `true` when the source is a standalone `.strings` / `.dlstrings` / `.ilstrings` file
    /// (not a full plugin). Export must always be loose files, never BA2.
    pub is_strings_only: bool,
    pub entry_count:     usize,
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn open_plugin_cmd(
    path: String,
    target_lang: String,
    window: tauri::WebviewWindow,
) -> Result<PluginMetadata, String> {
    log::info!("[cmd] open_plugin: {} (target_lang={})", path, target_lang);
    let lang = if target_lang.is_empty() { "en".to_owned() } else { target_lang };
    let win  = window.clone();
    let loaded = open_file(std::path::Path::new(&path), &lang, move |status| {
        win.emit("plugin:status", status).ok();
    }).map_err(|e| {
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
        plugin_name:     loaded.path.file_stem().and_then(|s| s.to_str()).unwrap_or("unknown").to_owned(),
        plugin_path:     loaded.path.to_string_lossy().into_owned(),
        author:          loaded.info.author,
        description:     loaded.info.description,
        masters:         loaded.info.masters,
        is_localized:    loaded.info.is_localized,
        is_strings_only: false,
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
    // For reference import, load English only (no target pre-fill needed)
    let loaded = open_file(std::path::Path::new(&reference_path), "en", |_| {}).map_err(|e| {
        log::error!("[cmd] import_translations_from failed: {}", e);
        e.to_string()
    })?;
    log::info!("[cmd] import_translations_from: {} entries loaded from reference", loaded.entries.len());
    Ok(loaded.entries)
}

/// Open a standalone `.strings` / `.dlstrings` / `.ilstrings` file for translation.
///
/// Parses the file, creates one `TranslationEntry` per string ID (source set to
/// `StringSource::Localized` so the standard strings exporter picks it up), and
/// streams the entries through the normal `"plugin:chunk"` / `"plugin:done"` events.
///
/// The returned `PluginMetadata` has `is_localized = true` and `is_strings_only = true`.
/// The frontend must therefore always export as loose files (never BA2).
#[tauri::command]
pub async fn open_strings_file_cmd(
    path:   String,
    window: tauri::WebviewWindow,
) -> Result<PluginMetadata, String> {
    use crate::parser::strings_file::{load_strings_file, StringFileKind};
    use crate::translation::entry::{EntryStatus, StringSource};

    log::info!("[cmd] open_strings_file: {}", path);
    let p   = std::path::Path::new(&path);
    let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();

    let kind = match ext.as_str() {
        "strings"   => StringFileKind::Strings,
        "dlstrings" => StringFileKind::DlStrings,
        "ilstrings" => StringFileKind::IlStrings,
        other => return Err(format!("Extension non supportée pour un fichier strings : .{other}")),
    };

    let table = load_strings_file(p).map_err(|e| {
        log::error!("[cmd] open_strings_file failed: {e}");
        e.to_string()
    })?;

    // Build entries — source must be Localized so build_strings_tables picks them up at export.
    let record_type = match kind {
        StringFileKind::Strings   => "STRS",
        StringFileKind::DlStrings => "DLST",
        StringFileKind::IlStrings => "ILST",
    };

    let mut entries: Vec<crate::translation::entry::TranslationEntry> = table
        .into_iter()
        .map(|(string_id, text)| crate::translation::entry::TranslationEntry {
            form_id:     string_id,
            record_type: record_type.to_string(),
            editor_id:   format!("{:08X}", string_id),
            sub_type:    ext.clone(),
            original:    text,
            translated:  String::new(),
            status:      EntryStatus::Untranslated,
            source:      StringSource::Localized { string_id, kind },
        })
        .collect();

    // Deterministic order — sort by string ID
    entries.sort_by_key(|e| e.form_id);
    let entry_count = entries.len();

    // Strip `_xx` / `_xxx` language suffix to get a clean plugin stem.
    // e.g. "Starfield_en" → "Starfield", "MyMod_fren" → "MyMod"
    let raw_stem    = p.file_stem().and_then(|s| s.to_str()).unwrap_or("strings").to_string();
    let plugin_stem = strip_lang_suffix(&raw_stem);

    log::info!("[cmd] open_strings_file: {} entries, stem={}", entry_count, plugin_stem);

    // Stream entries using the same events as open_plugin_cmd
    for chunk in entries.chunks(200) {
        window.emit("plugin:chunk", chunk).map_err(|e| e.to_string())?;
    }
    window.emit("plugin:done", entry_count).map_err(|e| e.to_string())?;

    Ok(PluginMetadata {
        plugin_name:     plugin_stem,
        plugin_path:     path,
        author:          String::new(),
        description:     String::new(),
        masters:         Vec::new(),
        is_localized:    true,
        is_strings_only: true,
        entry_count,
    })
}

/// Strip a trailing language-code suffix from a strings file stem.
///
/// Matches `_XX` or `_XXX` where XX/XXX is 2–4 ASCII letters (e.g. `_en`, `_fr`, `_fren`).
/// Returns the stem unchanged when no such suffix is found.
fn strip_lang_suffix(stem: &str) -> String {
    if let Some(idx) = stem.rfind('_') {
        let suffix = &stem[idx + 1..];
        if (2..=4).contains(&suffix.len()) && suffix.bytes().all(|b| b.is_ascii_alphabetic()) {
            return stem[..idx].to_string();
        }
    }
    stem.to_string()
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

/// Export result for a localized (strings-based) plugin.
#[derive(Serialize)]
pub struct StringsExportResult {
    pub strings_count:   usize,
    pub dlstrings_count: usize,
    pub ilstrings_count: usize,
    pub total:           usize,
    pub output_dir:      String,
}

/// Export translated strings for a **localized** plugin (Starfield, Fallout 4…).
///
/// Writes up to three files under `<output_dir>/Strings/`:
///   `<plugin_stem>_<target_lang>.strings`
///   `<plugin_stem>_<target_lang>.dlstrings`
///   `<plugin_stem>_<target_lang>.ilstrings`
///
/// Only `Validated` entries with a `Localized` source are written.
/// Files for empty tables are skipped.
#[tauri::command]
pub async fn export_strings_cmd(
    output_dir:   String,
    plugin_stem:  String,
    target_lang:  String,
    source_ba2:   Option<String>,  // path to original BA2, used to copy hashes
    pack_as_ba2:  bool,            // true → write a BA2; false → loose files
    entries:      Vec<TranslationEntry>,
) -> Result<StringsExportResult, String> {
    let validated = entries.iter().filter(|e| e.status == crate::translation::entry::EntryStatus::Validated).count();
    log::info!("[cmd] export_strings: plugin={} lang={} pack_ba2={} validated={}/{}",
        plugin_stem, target_lang, pack_as_ba2, validated, entries.len());

    let lang = if target_lang.is_empty() { "en".to_owned() } else { target_lang };

    let result = if pack_as_ba2 {
        // ── BA2 output ────────────────────────────────────────────────────────
        let ba2_name   = format!("{} - Localization.ba2", plugin_stem);
        let output_path = std::path::Path::new(&output_dir).join(&ba2_name);
        let src_path   = source_ba2.as_deref().map(std::path::Path::new);

        log::info!("[cmd] export_strings: writing BA2 → {}", output_path.display());
        crate::parser::strings_writer::write_strings_ba2(
            &output_path,
            &plugin_stem,
            &lang,
            &entries,
            src_path,
        ).map_err(|e| {
            log::error!("[cmd] export_strings (BA2) failed: {}", e);
            e
        })?
    } else {
        // ── Loose files output ────────────────────────────────────────────────
        crate::parser::strings_writer::write_strings_files(
            std::path::Path::new(&output_dir),
            &plugin_stem,
            &lang,
            &entries,
        ).map_err(|e| {
            log::error!("[cmd] export_strings (loose) failed: {}", e);
            e
        })?
    };

    let total = result.strings + result.dlstrings + result.ilstrings;
    log::info!("[cmd] export_strings done — strings={} dlstrings={} ilstrings={} total={} ba2={}",
        result.strings, result.dlstrings, result.ilstrings, total, result.is_ba2);

    let out_path = if result.is_ba2 {
        std::path::Path::new(&output_dir)
            .join(format!("{} - Localization.ba2", plugin_stem))
            .to_string_lossy().into_owned()
    } else {
        output_dir.clone()
    };

    Ok(StringsExportResult {
        strings_count:   result.strings,
        dlstrings_count: result.dlstrings,
        ilstrings_count: result.ilstrings,
        total,
        output_dir: out_path,
    })
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

/// Delete log files older than `max_age_days` days from the app log directory.
/// Only files whose name starts with "bgstranslator" are touched.
/// Called from the frontend on startup and whenever the retention setting changes.
/// Setting `max_age_days` to 0 is a no-op (purge disabled).
#[tauri::command]
pub async fn purge_logs_cmd(app: tauri::AppHandle, max_age_days: u32) -> Result<u32, String> {
    if max_age_days == 0 { return Ok(0); }

    let log_dir = app.path().app_log_dir().map_err(|e| e.to_string())?;

    let cutoff = std::time::SystemTime::now()
        .checked_sub(std::time::Duration::from_secs(max_age_days as u64 * 86_400))
        .unwrap_or(std::time::SystemTime::UNIX_EPOCH);

    let Ok(entries) = std::fs::read_dir(&log_dir) else { return Ok(0) };

    let mut removed = 0u32;
    for entry in entries.filter_map(|e| e.ok()) {
        let path = entry.path();
        let is_our_log = path
            .file_name()
            .and_then(|n| n.to_str())
            .map(|n| n.starts_with("bgstranslator"))
            .unwrap_or(false);
        if !is_our_log { continue; }

        let Ok(meta)     = entry.metadata() else { continue };
        let Ok(modified) = meta.modified()  else { continue };

        if modified < cutoff {
            if std::fs::remove_file(&path).is_ok() {
                removed += 1;
                log::debug!("[logs] Purged old log: {}", path.display());
            }
        }
    }

    if removed > 0 {
        log::info!("[logs] Purged {} log file(s) older than {} days", removed, max_age_days);
    }
    Ok(removed)
}

/// Open an https/http URL in the default system browser.
/// Uses the Rust-side opener to bypass the JS plugin ACL check.
#[tauri::command]
pub async fn open_url_cmd(app: tauri::AppHandle, url: String) -> Result<(), String> {
    app.opener().open_url(&url, None::<&str>)
        .map_err(|e| e.to_string())
}
