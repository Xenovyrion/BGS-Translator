use serde::Serialize;
use crate::database::{
    personal_format::{load_bgtx, save_bgtx, peek_bgtx},
    personal_store::PersonalDb,
    types::{EntryUpdate, PersonalDbEntry, PersonalDbInfo, PersonalDbFileInfo},
};
use crate::translation::entry::{EntryStatus, TranslationEntry};

// ── Helpers ───────────────────────────────────────────────────────────────────

fn personal_dbs_dir(custom_dir: Option<&str>) -> Result<std::path::PathBuf, String> {
    match custom_dir.filter(|s| !s.is_empty()) {
        Some(d) => {
            let p = std::path::PathBuf::from(d);
            if !p.exists() { std::fs::create_dir_all(&p).map_err(|e| e.to_string())?; }
            Ok(p)
        }
        None => {
            let exe = std::env::current_exe().map_err(|e| e.to_string())?;
            let dir = exe.parent().ok_or("Cannot determine exe directory")?
                .join("personal_dbs");
            if !dir.exists() { std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?; }
            Ok(dir)
        }
    }
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// Create an empty personal database (.bgtx) and save it to disk.
/// Returns metadata about the newly created file.
#[tauri::command]
pub async fn create_personal_db_cmd(
    name:       String,
    game:       String,
    lang_from:  String,
    lang_to:    String,
    custom_dir: Option<String>,
) -> Result<PersonalDbInfo, String> {
    let dir = personal_dbs_dir(custom_dir.as_deref())?;
    // Sanitize name for filesystem
    let safe_name: String = name.chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' || c == ' ' { c } else { '_' })
        .collect();
    let filename = format!("{}.bgtx", safe_name.trim());
    let path = dir.join(&filename);

    let db = PersonalDb::empty(
        name.clone(),
        path.to_string_lossy().into_owned(),
        game, lang_from, lang_to,
    );
    save_bgtx(&db, &path)?;
    tracing::info!("[personal_db] Created '{}' at '{}'", name, path.display());
    Ok(db.info())
}

/// Scan a directory for .bgtx files and return their metadata.
#[tauri::command]
pub async fn scan_personal_dbs_cmd(
    custom_dir: Option<String>,
) -> Result<Vec<PersonalDbFileInfo>, String> {
    let dir = personal_dbs_dir(custom_dir.as_deref())?;
    let mut list = Vec::new();
    let rd = std::fs::read_dir(&dir).map_err(|e| e.to_string())?;
    for entry in rd.flatten() {
        let p   = entry.path();
        let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
        if ext != "bgtx" { continue; }
        let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
        let name = p.file_stem().and_then(|s| s.to_str()).unwrap_or("?").to_owned();
        let (db_name, game, lang_from, lang_to, entry_count) = match peek_bgtx(&p) {
            Some(h) => (h.name, h.game, h.lang_from, h.lang_to, h.entry_count),
            None    => (name.clone(), String::new(), String::new(), String::new(), 0),
        };
        list.push(PersonalDbFileInfo {
            name: db_name, path: p.to_string_lossy().into_owned(),
            size, game, lang_from, lang_to, entry_count,
        });
    }
    list.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(list)
}

/// Peek at a single .bgtx file and return its metadata without loading all entries.
#[tauri::command]
pub async fn peek_personal_db_cmd(path: String) -> Result<PersonalDbInfo, String> {
    let p = std::path::Path::new(&path);
    let h = peek_bgtx(p).ok_or("Cannot read .bgtx file")?;
    Ok(PersonalDbInfo {
        name: h.name, path, game: h.game,
        lang_from: h.lang_from, lang_to: h.lang_to,
        entry_count: h.entry_count,
    })
}

/// Add entries from the current session to a personal database.
/// If the .bgtx doesn't exist yet, it's created with the given metadata.
/// Returns the updated entry count.
#[tauri::command]
pub async fn add_to_personal_db_cmd(
    path:       String,
    entries:    Vec<TranslationEntry>,
    // Fallback metadata used if the file doesn't exist yet
    name:       Option<String>,
    game:       Option<String>,
    lang_from:  Option<String>,
    lang_to:    Option<String>,
) -> Result<PersonalDbInfo, String> {
    let p = std::path::Path::new(&path);

    // Load existing or create empty
    let mut db = if p.exists() {
        load_bgtx(p)?
    } else {
        PersonalDb::empty(
            name.unwrap_or_else(|| {
                p.file_stem().and_then(|s| s.to_str()).unwrap_or("Ma BDD").to_owned()
            }),
            path.clone(),
            game.unwrap_or_default(),
            lang_from.unwrap_or_else(|| "en".into()),
            lang_to.unwrap_or_else(|| "fr".into()),
        )
    };

    // Convert session entries → PersonalDbEntry (any non-empty translation, regardless of status)
    let new_entries: Vec<PersonalDbEntry> = entries
        .into_iter()
        .filter(|e| !e.translated.is_empty())
        .map(|e| PersonalDbEntry {
            form_id:     e.form_id,
            original:    e.original,
            translated:  e.translated,
            record_type: e.record_type,
            sub_type:    e.sub_type,
            editor_id:   e.editor_id,
        })
        .collect();

    let added = new_entries.len();
    db.add_entries(new_entries);
    save_bgtx(&db, p)?;
    tracing::info!("[personal_db] {} entries added to '{}' (total: {})", added, path, db.entry_count());
    Ok(db.info())
}

/// Apply a personal DB to a list of session entries.
/// ID-based match has priority over text-based.
/// Returns the updated entries and the number of matches.
#[derive(Serialize)]
pub struct PersonalApplyResult {
    pub matched: usize,
    pub total:   usize,
    pub entries: Vec<TranslationEntry>,
}

#[tauri::command]
pub async fn apply_personal_db_cmd(
    path:    String,
    entries: Vec<TranslationEntry>,
) -> Result<PersonalApplyResult, String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        let total = entries.len();
        return Ok(PersonalApplyResult { matched: 0, total, entries });
    }

    let db = load_bgtx(p)?;
    let total       = entries.len();
    let mut matched = 0usize;

    let entries: Vec<TranslationEntry> = entries
        .into_iter()
        .map(|mut e| {
            if e.translated.is_empty() {
                if let Some(t) = db.lookup(e.form_id, &e.original, &e.sub_type) {
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

    tracing::info!("[personal_db] apply '{}': {}/{} matched", path, matched, total);
    Ok(PersonalApplyResult { matched, total, entries })
}

/// Returns the path to the personal_dbs directory (creates it if needed).
#[tauri::command]
pub async fn get_personal_dbs_dir_cmd(custom_dir: Option<String>) -> Result<String, String> {
    personal_dbs_dir(custom_dir.as_deref()).map(|p| p.to_string_lossy().into_owned())
}

/// Delete a personal database file from disk.
#[tauri::command]
pub async fn delete_personal_db_cmd(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if p.exists() {
        std::fs::remove_file(p).map_err(|e| e.to_string())?;
        tracing::info!("[personal_db] Deleted '{}'", path);
    }
    Ok(())
}

// ── In-place edit commands ────────────────────────────────────────────────────

/// Update the `translated` field of specific entries (identified by their index in the DB).
/// Loads the .bgtx, applies the changes in-place, saves. Returns the number of updated entries.
#[tauri::command]
pub async fn update_personal_db_entries_cmd(
    path:    String,
    updates: Vec<EntryUpdate>,
) -> Result<usize, String> {
    let p = std::path::Path::new(&path);
    let mut db = load_bgtx(p)?;
    let mut count = 0usize;
    for u in updates {
        if db.update_entry_at_index(u.idx, u.translated) { count += 1; }
    }
    save_bgtx(&db, p)?;
    tracing::info!("[personal_db] {} entries updated in '{}'", count, path);
    Ok(count)
}

/// Remove all entries with an empty (or whitespace-only) translation from a .bgtx file.
/// Returns the number of removed entries.
#[tauri::command]
pub async fn purge_personal_db_cmd(path: String) -> Result<usize, String> {
    let p = std::path::Path::new(&path);
    let mut db = load_bgtx(p)?;
    let removed = db.purge_untranslated();
    save_bgtx(&db, p)?;
    tracing::info!("[personal_db] {} untranslated entries purged from '{}'", removed, path);
    Ok(removed)
}

/// Manually add a single new entry to a .bgtx file.
/// Creates the file if it does not exist yet.
#[tauri::command]
pub async fn add_entry_to_personal_db_cmd(
    path:        String,
    original:    String,
    translated:  String,
    record_type: String,
    sub_type:    String,
    editor_id:   String,
) -> Result<usize, String> {
    let p = std::path::Path::new(&path);
    let mut db = if p.exists() {
        load_bgtx(p)?
    } else {
        PersonalDb::empty(
            p.file_stem().and_then(|s| s.to_str()).unwrap_or("Ma BDD").to_owned(),
            path.clone(),
            String::new(),
            "en".into(),
            "fr".into(),
        )
    };
    db.add_entries(vec![PersonalDbEntry {
        form_id: 0,
        original, translated, record_type, sub_type, editor_id,
    }]);
    save_bgtx(&db, p)?;
    let count = db.entry_count();
    tracing::info!("[personal_db] Entry manually added to '{}' (total: {})", path, count);
    Ok(count)
}

/// Merge entries from any supported source file (.eet, .bgt, .bgtx, .csv, .tsv, .xml)
/// into an existing .bgtx. Creates the .bgtx if it does not exist yet.
/// Returns the number of entries merged.
#[tauri::command]
pub async fn import_into_personal_db_cmd(
    path:     String,
    src_path: String,
) -> Result<usize, String> {
    let p   = std::path::Path::new(&path);
    let src = std::path::Path::new(&src_path);

    let mut db = if p.exists() {
        load_bgtx(p)?
    } else {
        PersonalDb::empty(
            p.file_stem().and_then(|s| s.to_str()).unwrap_or("Ma BDD").to_owned(),
            path.clone(),
            String::new(),
            "en".into(),
            "fr".into(),
        )
    };

    let db_entries = super::commands::load_source_as_db_entries(src)?;
    let new_entries: Vec<PersonalDbEntry> = db_entries.into_iter().map(|e| PersonalDbEntry {
        form_id:     e.form_id,
        original:    e.original,
        translated:  e.translated,
        record_type: e.record_type.unwrap_or_default(),
        sub_type:    e.sub_type.unwrap_or_default(),
        editor_id:   e.editor_id.unwrap_or_default(),
    }).collect();

    let count = new_entries.len();
    db.add_entries(new_entries);
    save_bgtx(&db, p)?;
    tracing::info!("[personal_db] {} entries imported into '{}' from '{}'", count, path, src_path);
    Ok(count)
}
