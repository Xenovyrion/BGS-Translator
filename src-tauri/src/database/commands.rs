use std::sync::Mutex;
use tauri::State;
use serde::Serialize;

use crate::database::{
    format::{load_any, load_eet, load_bgt, save_bgt, export_delimited, import_delimited},
    store::TranslationDb,
    types::{DbEntry, DbInfo, ApplyResult, DbFileInfo},
    personal_store::PersonalDb,
    personal_format::{load_bgtx, save_bgtx},
    types::PersonalDbEntry,
};
use crate::translation::entry::{EntryStatus, TranslationEntry};

/// Global state of the loaded database (persistent across Tauri commands).
pub struct DbState(pub Mutex<Option<TranslationDb>>);

// ── Load a database ───────────────────────────────────────────────────────────

#[tauri::command]
pub async fn load_db_cmd(state: State<'_, DbState>, path: String) -> Result<DbInfo, String> {
    log::debug!("[db] Loading database: {}", path);
    let db = load_any(std::path::Path::new(&path)).map_err(|e| {
        log::error!("[db] Load error: {}", e);
        e
    })?;
    let info = db.info();
    log::info!("[db] {} entries loaded from '{}'", info.entry_count, info.name);
    *state.0.lock().unwrap() = Some(db);
    Ok(info)
}

// ── Apply the database to a list of entries ───────────────────────────────────

#[tauri::command]
pub async fn apply_db_cmd(
    state:   State<'_, DbState>,
    entries: Vec<TranslationEntry>,
) -> Result<ApplyResult, String> {
    let guard = state.0.lock().unwrap();
    let Some(db) = guard.as_ref() else {
        return Ok(ApplyResult { matched: 0, total: entries.len() });
    };

    let total        = entries.len();
    let mut matched  = 0usize;

    let _updated: Vec<TranslationEntry> = entries
        .into_iter()
        .map(|mut e| {
            if e.translated.is_empty() {
                if let Some(t) = db.lookup(e.form_id, &e.original, &e.record_type, &e.sub_type) {
                    if !t.is_empty() {
                        e.translated = t.to_owned();
                        e.status     = EntryStatus::Validated;
                        matched     += 1;
                    }
                }
            }
            e
        })
        .collect();

    log::info!("[db] apply_db: {}/{} entries translated", matched, total);
    Ok(ApplyResult { matched, total })
}

/// Variant of apply_db_cmd that also returns the modified entries (used after open_plugin).
#[derive(Serialize)]
pub struct ApplyResultFull {
    pub matched: usize,
    pub total:   usize,
    pub entries: Vec<TranslationEntry>,
}

#[tauri::command]
pub async fn apply_db_full_cmd(
    state:   State<'_, DbState>,
    entries: Vec<TranslationEntry>,
) -> Result<ApplyResultFull, String> {
    let guard = state.0.lock().unwrap();
    let Some(db) = guard.as_ref() else {
        let total = entries.len();
        log::debug!("[db] apply_db_full: no database loaded, skipping");
        return Ok(ApplyResultFull { matched: 0, total, entries });
    };

    let total        = entries.len();
    let mut matched  = 0usize;

    let entries: Vec<TranslationEntry> = entries
        .into_iter()
        .map(|mut e| {
            if e.translated.is_empty() {
                if let Some(t) = db.lookup(e.form_id, &e.original, &e.record_type, &e.sub_type) {
                    if !t.is_empty() {
                        e.translated = t.to_owned();
                        e.status     = EntryStatus::Validated;
                        matched     += 1;
                    }
                }
            }
            e
        })
        .collect();

    log::info!("[db] apply_db_full: {}/{} entries translated", matched, total);
    Ok(ApplyResultFull { matched, total, entries })
}

// ── Add entries to the database ───────────────────────────────────────────────

#[tauri::command]
pub async fn add_to_db_cmd(
    state:   State<'_, DbState>,
    entries: Vec<TranslationEntry>,
) -> Result<usize, String> {
    let mut guard = state.0.lock().unwrap();
    let db = guard.as_mut().ok_or("No database loaded")?;
    if db.read_only { return Err("This database is read-only".into()); }

    let new_entries: Vec<DbEntry> = entries
        .into_iter()
        .filter(|e| !e.translated.is_empty())
        .map(|e| DbEntry {
            form_id:     e.form_id,
            original:    e.original,
            translated:  e.translated,
            record_type: Some(e.record_type),
            sub_type:    Some(e.sub_type),
            editor_id:   if e.editor_id.is_empty() { None } else { Some(e.editor_id) },
        })
        .collect();

    let count = new_entries.len();
    db.add_entries(new_entries);
    log::info!("[db] {} entries added to the database", count);
    Ok(count)
}

// ── Save / Export ─────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn save_db_cmd(state: State<'_, DbState>, path: String) -> Result<(), String> {
    let guard = state.0.lock().unwrap();
    let db    = guard.as_ref().ok_or("No database loaded")?;
    log::info!("[db] Saving database to: {}", path);
    save_bgt(db, std::path::Path::new(&path))
}

#[tauri::command]
pub async fn export_db_cmd(
    state:  State<'_, DbState>,
    path:   String,
    format: String,
) -> Result<(), String> {
    let guard = state.0.lock().unwrap();
    let db    = guard.as_ref().ok_or("No database loaded")?;
    let p     = std::path::Path::new(&path);
    log::info!("[db] Exporting database as {} to: {}", format, path);
    match format.as_str() {
        "bgt" => save_bgt(db, p),
        "csv" => export_delimited(db, p, ','),
        "tsv" => export_delimited(db, p, '\t'),
        _     => Err(format!("Unsupported format: {}", format)),
    }
}

// ── Get info on the current database ─────────────────────────────────────────

#[tauri::command]
pub async fn get_db_info_cmd(state: State<'_, DbState>) -> Result<Option<DbInfo>, String> {
    let guard = state.0.lock().unwrap();
    Ok(guard.as_ref().map(|db| db.info()))
}

// ── databases/ directory helpers ──────────────────────────────────────────────

/// Returns (and creates if needed) the path to the default databases/ folder (next to the exe).
fn databases_dir() -> Result<std::path::PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let dir = exe.parent().ok_or("Cannot determine exe directory")?
              .join("databases");
    if !dir.exists() {
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(dir)
}

/// Resolves the active database directory: custom_dir takes priority over the default.
fn resolve_db_dir(custom_dir: Option<&str>) -> Result<std::path::PathBuf, String> {
    match custom_dir.filter(|s| !s.is_empty()) {
        Some(d) => {
            let p = std::path::PathBuf::from(d);
            if !p.exists() {
                std::fs::create_dir_all(&p).map_err(|e| e.to_string())?;
            }
            Ok(p)
        }
        None => databases_dir(),
    }
}

#[tauri::command]
pub async fn get_databases_dir_cmd(custom_dir: Option<String>) -> Result<String, String> {
    resolve_db_dir(custom_dir.as_deref()).map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn scan_databases_dir_cmd(custom_dir: Option<String>) -> Result<Vec<DbFileInfo>, String> {
    let dir = resolve_db_dir(custom_dir.as_deref())?;
    let mut list = Vec::new();
    let rd = std::fs::read_dir(&dir).map_err(|e| e.to_string())?;
    for entry in rd.flatten() {
        let p   = entry.path();
        let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
        if ext != "bgt" && ext != "eet" { continue; }
        let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
        let name = p.file_stem().and_then(|s| s.to_str()).unwrap_or("?").to_owned();
        let (game, lang_from, lang_to) = if ext == "bgt" {
            match crate::database::format::peek_bgt_info(&p) {
                Some(info) => (info.game, info.lang_from, info.lang_to),
                None       => (String::new(), String::new(), String::new()),
            }
        } else {
            (String::new(), String::new(), String::new())
        };
        list.push(DbFileInfo { name, path: p.to_string_lossy().into_owned(), format: ext, size, game, lang_from, lang_to });
    }
    list.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(list)
}

/// Scans the database folder and returns the path of the first .bgt whose game
/// name matches `game` (case-insensitive partial match). Returns None if not found.
#[tauri::command]
pub async fn find_db_for_game_cmd(
    game: String,
    custom_dir: Option<String>,
) -> Result<Option<String>, String> {
    if game.is_empty() { return Ok(None); }
    let dir = resolve_db_dir(custom_dir.as_deref())?;
    let game_lower = game.to_lowercase();

    // Two-pass scan: exact header match first, then filename heuristic, then substring.
    // This prevents a .bgt whose header game field is wrong from shadowing a
    // correctly-named file (e.g. all bundled DBs having "Starfield" in the header).
    let mut exact_match:    Option<String> = None;
    let mut filename_match: Option<String> = None;
    let mut substring_match: Option<String> = None;

    let rd = std::fs::read_dir(&dir).map_err(|e| e.to_string())?;
    let mut entries: Vec<_> = rd.flatten().collect();
    // Sort by filename for deterministic results
    entries.sort_by_key(|e| e.file_name());

    for entry in entries {
        let p = entry.path();
        let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
        if ext != "bgt" { continue; }

        // Level 1: exact game header match
        if let Some(g) = crate::database::format::peek_bgt_game(&p) {
            let g_lower = g.to_lowercase();
            if g_lower == game_lower {
                exact_match = Some(p.to_string_lossy().into_owned());
                break; // can't do better
            }
            if exact_match.is_none() {
                if g_lower.contains(&game_lower) || game_lower.contains(&g_lower) {
                    substring_match.get_or_insert_with(|| p.to_string_lossy().into_owned());
                }
            }
        }

        // Level 2: filename contains the game name (fallback for wrong header)
        if filename_match.is_none() {
            let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
            if stem.contains(&game_lower) {
                filename_match = Some(p.to_string_lossy().into_owned());
            }
        }
    }

    let result = exact_match.or(filename_match).or(substring_match);
    match &result {
        Some(p) => log::info!("[db] Auto-detected DB '{}' for game '{}'", p, game),
        None    => log::info!("[db] No matching DB found for game '{}'", game),
    }
    Ok(result)
}

/// Returns (and creates if needed) the path for autosaving a session for the given plugin.
#[tauri::command]
pub async fn get_autosave_path_cmd(plugin_name: String) -> Result<String, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let dir = exe.parent()
        .ok_or("Cannot determine exe directory")?
        .join("sessions");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let safe: String = plugin_name.chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' || c == '.' { c } else { '_' })
        .collect();
    let filename = format!("{}_autosave.bgts", safe);
    Ok(dir.join(filename).to_string_lossy().into_owned())
}

/// Converts a .eet file to .bgt format.
/// out_dir:   output directory (None = default databases/ folder).
/// game_name: game name provided by the user (overrides auto-detection).
#[tauri::command]
pub async fn convert_eet_cmd(
    src_path:  String,
    out_dir:   Option<String>,
    game_name: Option<String>,
) -> Result<DbFileInfo, String> {
    let src = std::path::Path::new(&src_path);
    if src.extension().and_then(|e| e.to_str()).unwrap_or("") != "eet" {
        return Err("Source file must be a .eet file".into());
    }

    let stem = src.file_stem().and_then(|s| s.to_str()).unwrap_or("import").to_owned();

    let (detected_game, entries) = load_eet(src).map_err(|_| {
        "Unable to read .eet file (unrecognized format or corrupted file)".to_string()
    })?;
    let count = entries.len();

    if count == 0 {
        return Err("No entries could be imported from this .eet file".into());
    }

    // Priority: user-supplied name > name detected in header > "unknown"
    let game = game_name
        .filter(|s| !s.trim().is_empty())
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| {
            if detected_game.is_empty() { "unknown".to_string() } else { detected_game }
        });

    log::info!("[eet→bgt] Game: '{}'", game);
    let db = TranslationDb::from_entries(
        stem.clone(), game.clone(), "en".into(), "fr".into(), false, entries,
    );

    let dest_dir = resolve_db_dir(out_dir.as_deref())?;
    let dest     = dest_dir.join(format!("{}.bgt", stem));
    save_bgt(&db, &dest).map_err(|_| {
        "Unable to write .bgt file to the databases/ directory".to_string()
    })?;

    log::info!("[eet→bgt] {} entries converted → '{}'", count, dest.display());
    Ok(DbFileInfo {
        name:      stem,
        path:      dest.to_string_lossy().into_owned(),
        format:    "bgt".into(),
        size:      std::fs::metadata(&dest).map(|m| m.len()).unwrap_or(0),
        game,
        lang_from: "en".into(),
        lang_to:   "fr".into(),
    })
}

// ── Debug mode ────────────────────────────────────────────────────────────────

use std::sync::atomic::{AtomicBool, Ordering};
pub static DEBUG_MODE: AtomicBool = AtomicBool::new(false);

/// Enables or disables advanced debug mode.
/// When enabled, log::debug!() calls are written to the log file.
/// When disabled, only Info/Warn/Error messages are logged.
#[tauri::command]
pub fn set_debug_mode_cmd(enabled: bool) {
    DEBUG_MODE.store(enabled, Ordering::Relaxed);
    // Dynamically change the global log level so debug messages are actually filtered.
    if enabled {
        log::set_max_level(log::LevelFilter::Debug);
    } else {
        log::set_max_level(log::LevelFilter::Info);
    }
    log::info!("[system] Debug mode {}", if enabled { "enabled (verbose logging)" } else { "disabled" });
}

// ── Create an empty database ──────────────────────────────────────────────────

#[tauri::command]
pub async fn create_db_cmd(
    state:     State<'_, DbState>,
    name:      String,
    game:      String,
    lang_from: String,
    lang_to:   String,
) -> Result<DbInfo, String> {
    let db   = TranslationDb::from_entries(name, game, lang_from, lang_to, false, vec![]);
    let info = db.info();
    log::info!("[db] Empty database created: '{}' ({} → {})", info.name, info.lang_from, info.lang_to);
    *state.0.lock().unwrap() = Some(db);
    Ok(info)
}

// ── Universal converter ───────────────────────────────────────────────────────
//
// Supported source formats (auto-detected by extension):
//   .eet  — EET binary  (has form_id)
//   .bgt  — BGT v2      (has form_id)
//   .bgtx — BGTX        (has form_id)
//   .csv  — comma-separated (form_id in optional column 6)
//   .tsv  — tab-separated
//   .xml  — xTranslator XML or ESP-ESM Translator XML (no form_id)

#[derive(serde::Serialize)]
pub struct ConvertResult {
    pub path:        String,
    pub entry_count: usize,
}

/// Load any supported source format and return a list of DbEntry.
fn load_source_as_db_entries(src: &std::path::Path) -> Result<Vec<DbEntry>, String> {
    let ext = src.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    match ext.as_str() {
        "eet" => {
            let (_, entries) = load_eet(src)?;
            Ok(entries)
        }
        "bgt" => {
            let db = load_bgt(src)?;
            Ok(db.entries().to_vec())
        }
        "bgtx" => {
            let db = load_bgtx(src)?;
            Ok(db.entries().iter().map(|e| DbEntry {
                form_id:     e.form_id,
                original:    e.original.clone(),
                translated:  e.translated.clone(),
                record_type: if e.record_type.is_empty() { None } else { Some(e.record_type.clone()) },
                sub_type:    if e.sub_type.is_empty()    { None } else { Some(e.sub_type.clone()) },
                editor_id:   if e.editor_id.is_empty()   { None } else { Some(e.editor_id.clone()) },
            }).collect())
        }
        "csv" => import_delimited(src, ','),
        "tsv" => import_delimited(src, '\t'),
        "xml" => {
            // Try xTranslator first, fall back to ESP-ESM Translator XML
            use crate::formats::{xtranslator_xml, esptranslator_xml};
            let imported = xtranslator_xml::import(src)
                .or_else(|_| esptranslator_xml::import(src))?;
            Ok(imported.into_iter().map(|e| DbEntry {
                form_id:     0,
                original:    e.original,
                translated:  e.translated,
                record_type: e.record_type,
                sub_type:    e.sub_type,
                editor_id:   e.editor_id,
            }).collect())
        }
        _ => Err(format!("Unsupported source format: .{}", ext)),
    }
}

/// Convert any supported source to a .bgt (reference database, v2).
#[tauri::command]
pub async fn convert_to_bgt_cmd(
    src_path:  String,
    out_path:  String,
    name:      String,
    game:      String,
    lang_from: String,
    lang_to:   String,
    read_only: bool,
) -> Result<ConvertResult, String> {
    let src  = std::path::Path::new(&src_path);
    let dest = std::path::Path::new(&out_path);

    let entries = load_source_as_db_entries(src)?;
    let count   = entries.len();
    if count == 0 { return Err("No translatable entries found in source file.".into()); }

    let db = TranslationDb::from_entries(name, game, lang_from, lang_to, read_only, entries);
    save_bgt(&db, dest)?;
    log::info!("[converter] .bgt: {} entries → '{}'", count, dest.display());
    Ok(ConvertResult { path: out_path, entry_count: count })
}

/// Convert any supported source to a .bgtx (personal database).
#[tauri::command]
pub async fn convert_to_bgtx_cmd(
    src_path:  String,
    out_path:  String,
    name:      String,
    game:      String,
    lang_from: String,
    lang_to:   String,
) -> Result<ConvertResult, String> {
    let src  = std::path::Path::new(&src_path);
    let dest = std::path::Path::new(&out_path);

    let db_entries = load_source_as_db_entries(src)?;
    let count      = db_entries.len();
    if count == 0 { return Err("No translatable entries found in source file.".into()); }

    let personal_entries: Vec<PersonalDbEntry> = db_entries.into_iter().map(|e| PersonalDbEntry {
        form_id:     e.form_id,
        original:    e.original,
        translated:  e.translated,
        record_type: e.record_type.unwrap_or_default(),
        sub_type:    e.sub_type.unwrap_or_default(),
        editor_id:   e.editor_id.unwrap_or_default(),
    }).collect();

    let db = PersonalDb::from_entries(name, dest.to_string_lossy().into_owned(), game, lang_from, lang_to, personal_entries);
    save_bgtx(&db, dest)?;
    log::info!("[converter] .bgtx: {} entries → '{}'", count, dest.display());
    Ok(ConvertResult { path: out_path, entry_count: count })
}
